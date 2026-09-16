const express = require('express');
const multer = require('multer');
const router = express.Router();
const crypto = require('crypto');
const { requireAdmin } = require('../middleware');
const { supabaseAdmin, supabaseAnon } = require('../supabaseClient');
const { calculerAcquis } = require('../lib/conges');
const { buildMonthGrid } = require('../lib/planningGrid');
const { parseExcelPlanning } = require('../lib/planningExcel');
const { iso } = require('../lib/dates');

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const uploadPlanning = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype === EXCEL_MIME)
});

async function chargerFiche(db, id, moisParam) {
  const { data: alternant } = await db.from('profiles').select('*, societes(nom)').eq('id', id).single();
  if (!alternant) return null;

  const mois = moisParam || iso(new Date()).slice(0, 7);
  const [y, m] = mois.split('-').map(Number);
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const [{ data: congesValidees }, { data: heures }, { data: planningRows }] = await Promise.all([
    db.from('conges').select('jours').eq('alternant_id', id).eq('statut', 'validee'),
    db.from('heures_supplementaires').select('heures').eq('alternant_id', id),
    db.from('planning').select('date,type,commentaire,modalite').eq('alternant_id', id).gte('date', monthStart).lte('date', monthEnd)
  ]);
  const pris = (congesValidees || []).reduce((s, c) => s + Number(c.jours), 0);
  const acquis = calculerAcquis(alternant.date_debut, alternant.date_fin);
  const totalHeures = (heures || []).reduce((s, h) => s + Number(h.heures), 0);
  const heuresAcquises = (heures || []).filter(h => Number(h.heures) > 0).reduce((s, h) => s + Number(h.heures), 0);
  const heuresPrises = Math.abs((heures || []).filter(h => Number(h.heures) < 0).reduce((s, h) => s + Number(h.heures), 0));

  return {
    alternant, totalHeures,
    solde: { acquis, pris, dispo: Math.round((acquis - pris) * 10) / 10, heuresRecupDispo: totalHeures },
    soldeHeures: { acquis: heuresAcquises, pris: heuresPrises, dispo: totalHeures },
    grille: buildMonthGrid(planningRows, alternant, mois)
  };
}

router.get('/alternants', requireAdmin, async (req, res) => {
  const [{ data: alternants }, { data: societes }] = await Promise.all([
    req.db.from('profiles').select('*').eq('role', 'alternant').order('nom'),
    req.db.from('societes').select('*').order('nom')
  ]);
  let selected = null;
  if (req.query.voir) selected = await chargerFiche(req.db, req.query.voir, req.query.mois);

  res.render('alternants', { alternants: alternants || [], societes: societes || [], selected, error: req.query.error || null, showModal: false });
});

router.post('/alternants', requireAdmin, uploadPlanning.single('fichier_planning'), async (req, res) => {
  const { prenom, nom, email, poste, date_debut, date_fin, societe_id, mot_de_passe } = req.body;

  const rerenderAvecErreur = async (error) => {
    const [{ data: alternants }, { data: societes }] = await Promise.all([
      req.db.from('profiles').select('*').eq('role', 'alternant').order('nom'),
      req.db.from('societes').select('*').order('nom')
    ]);
    res.render('alternants', { alternants: alternants || [], societes: societes || [], selected: null, error, showModal: true });
  };

  if (mot_de_passe && mot_de_passe.length < 8) {
    return rerenderAvecErreur('Le mot de passe doit contenir au moins 8 caractères.');
  }

  // 1) Création du compte de connexion (Supabase Auth). Si l'admin a choisi un
  // mot de passe, on l'utilise directement ; sinon un mot de passe temporaire
  // aléatoire est généré en attendant que l'alternant en choisisse un lui-même.
  const motDePasseInitial = mot_de_passe || crypto.randomBytes(24).toString('base64');
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email, password: motDePasseInitial, email_confirm: true
  });
  if (createErr) return rerenderAvecErreur(createErr.message);

  // 2) Création de la fiche profil associée
  const { data: profil, error: profilErr } = await supabaseAdmin.from('profiles').insert({
    id: created.user.id, role: 'alternant', prenom, nom, email, poste, date_debut, date_fin,
    societe_id: societe_id || null
  }).select().single();
  if (profilErr || !profil) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return rerenderAvecErreur(profilErr ? profilErr.message : "Impossible de créer la fiche de l'alternant.");
  }

  // 3) Si aucun mot de passe n'a été choisi par l'admin, on envoie un e-mail à
  // l'alternant pour qu'il choisisse lui-même le sien (réutilise le même
  // lien/écran que « mot de passe oublié »).
  if (!mot_de_passe) {
    const { error: mailErr } = await supabaseAnon.auth.resetPasswordForEmail(email, {
      redirectTo: (process.env.BASE_URL || 'http://localhost:3000') + '/reinitialiser-mot-de-passe'
    });
    if (mailErr) console.error('Erreur envoi e-mail de choix de mot de passe :', mailErr.message);
  }

  // 4) Si un planning Excel a été joint à la création, on l'analyse tout de suite
  // et on affiche l'écran de vérification habituel avant enregistrement.
  if (req.file) {
    try {
      const { lignes, ignorees } = parseExcelPlanning(req.file.buffer);
      if (lignes.length > 0) {
        return res.render('planning-import-preview', { alternant: profil, lignes, ignorees, error: null });
      }
    } catch (e) {
      // Fichier illisible : on ignore silencieusement, l'admin pourra réimporter depuis la fiche.
    }
  }

  res.redirect('/alternants?voir=' + created.user.id);
});

router.get('/alternants/:id', requireAdmin, (req, res) => {
  res.redirect('/alternants?voir=' + req.params.id);
});

router.post('/alternants/:id', requireAdmin, async (req, res) => {
  const { prenom, nom, email, poste, date_debut, date_fin, societe_id } = req.body;
  const id = req.params.id;

  const { data: current } = await req.db.from('profiles').select('email').eq('id', id).single();
  if (current && email !== current.email) {
    const { error: emailErr } = await supabaseAdmin.auth.admin.updateUserById(id, { email });
    if (emailErr) return res.redirect('/alternants?voir=' + id + '&error=' + encodeURIComponent(emailErr.message));
  }

  await req.db.from('profiles').update({
    prenom, nom, email, poste, date_debut, date_fin, societe_id: societe_id || null
  }).eq('id', id);
  res.redirect('/alternants?voir=' + id);
});

router.post('/alternants/:id/eligibilite', requireAdmin, async (req, res) => {
  const { data: alternant } = await req.db.from('profiles').select('heures_eligible').eq('id', req.params.id).single();
  await req.db.from('profiles').update({ heures_eligible: !alternant.heures_eligible }).eq('id', req.params.id);
  res.redirect('/alternants?voir=' + req.params.id);
});

// Suppression définitive : les clés étrangères (conges, heures_supplementaires,
// fiches_paie, absences_ecole, planning -> profiles -> auth.users) sont toutes
// en ON DELETE CASCADE, donc supprimer le compte Auth supprime tout le reste
// en base automatiquement. Seuls les fichiers de paie dans Supabase Storage
// doivent être nettoyés séparément.
router.post('/alternants/:id/supprimer', requireAdmin, async (req, res) => {
  const id = req.params.id;

  const { data: fichiers } = await supabaseAdmin.storage.from('fiches-paie').list(id);
  if (fichiers && fichiers.length) {
    await supabaseAdmin.storage.from('fiches-paie').remove(fichiers.map(f => `${id}/${f.name}`));
  }

  await supabaseAdmin.auth.admin.deleteUser(id);
  res.redirect('/alternants');
});

module.exports = router;
