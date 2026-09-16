const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { supabaseAdmin } = require('../supabaseClient');
const { parseExcelPlanning } = require('../lib/planningExcel');
const { buildMonthGrid, buildGlobalMonthGrid } = require('../lib/planningGrid');
const { joursOuvresEntre, iso, parseIsoLocal } = require('../lib/dates');
const { deduireRecuperation } = require('../lib/heuresSupp');
const { estFerie } = require('../lib/joursFeries');

const TYPES = ['entreprise', 'ecole', 'conge', 'recuperation', 'absent'];
const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype === EXCEL_MIME)
});

router.get('/planning', async (req, res) => {
  const moisParam = req.query.mois || iso(new Date()).slice(0, 7);
  const [y, m] = moisParam.split('-').map(Number);
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  if (req.profile.role === 'admin') {
    const [{ data: alternants }, { data: rows }] = await Promise.all([
      req.db.from('profiles').select('*').eq('role', 'alternant').order('nom'),
      req.db.from('planning').select('alternant_id,date,type,modalite').gte('date', monthStart).lte('date', monthEnd)
    ]);
    return res.render('planning-admin', buildGlobalMonthGrid(alternants || [], rows || [], moisParam));
  }

  const profile = req.profile;
  const { data: rows } = await req.db.from('planning').select('date,type,commentaire,modalite').eq('alternant_id', profile.id).gte('date', monthStart).lte('date', monthEnd);
  res.render('planning-alternant', Object.assign({ alternantId: profile.id }, buildMonthGrid(rows, profile, moisParam)));
});

router.post('/planning/periode', requireAdmin, async (req, res) => {
  const { alternant_id, debut, fin, type, modalite, jours_ouvres, retour } = req.body;
  if (alternant_id && debut && fin && TYPES.includes(type)) {
    const dates = (jours_ouvres === 'on' ? joursOuvresEntre(debut, fin) : (() => {
      const list = [];
      for (let d = new Date(debut); d <= new Date(fin); d.setDate(d.getDate() + 1)) list.push(d.toISOString().slice(0, 10));
      return list;
    })()).filter(date => !estFerie(date));
    const modaliteRetenue = type === 'entreprise' && ['presentiel', 'distanciel'].includes(modalite) ? modalite : null;
    const rows = dates.map(date => ({ alternant_id, date, type, modalite: modaliteRetenue }));
    if (rows.length) await req.db.from('planning').upsert(rows, { onConflict: 'alternant_id,date' });

    // Un congé ou une récupération ajouté(e) directement depuis le planning doit
    // aussi apparaître (et être comptabilisé) dans l'onglet Congés, comme s'il
    // avait été demandé puis validé. Le solde de congés en dépend.
    if (type === 'conge' || type === 'recuperation') {
      const joursConge = joursOuvresEntre(debut, fin);
      if (joursConge.length > 0) {
        await supabaseAdmin.from('conges').insert({
          alternant_id, date_debut: debut, date_fin: fin, jours: joursConge.length,
          statut: 'validee', type: type === 'recuperation' ? 'recuperation' : 'paye',
          commentaire: "Ajouté manuellement par l'administrateur depuis le planning"
        });
        if (type === 'recuperation') await deduireRecuperation(req.db, alternant_id, joursConge);
      }
    }
  }
  res.redirect(retour || ('/alternants?voir=' + alternant_id));
});

// Modification d'un seul jour depuis la fiche alternant (clic sur une case du
// planning) : type de jour, sous-type de congé, modalité et note en une fois.
router.post('/planning/jour', requireAdmin, async (req, res) => {
  const { alternant_id, date, type, conge_type, modalite, commentaire, retour } = req.body;
  const CONGE_TYPES = ['paye', 'recuperation', 'sans_solde'];
  if (alternant_id && date && !estFerie(date) && ['entreprise', 'ecole', 'conge', 'absent'].includes(type)) {
    const sousType = type === 'conge' && CONGE_TYPES.includes(conge_type) ? conge_type : 'paye';
    // La récupération est saisie comme un congé de sous-type « Récupération »
    // mais reste stockée sous son propre type dans le planning (décompte d'heures).
    const typePlanning = type === 'conge' && sousType === 'recuperation' ? 'recuperation' : type;
    const modaliteRetenue = typePlanning === 'entreprise' && ['presentiel', 'distanciel'].includes(modalite) ? modalite : null;

    const { data: existant } = await req.db.from('planning').select('type').eq('alternant_id', alternant_id).eq('date', date).maybeSingle();
    await req.db.from('planning').upsert(
      { alternant_id, date, type: typePlanning, modalite: modaliteRetenue, commentaire: commentaire || null },
      { onConflict: 'alternant_id,date' }
    );

    // Même logique que /planning/periode : un jour passé en congé/récupération
    // est comptabilisé dans l'onglet Congés — sauf s'il l'était déjà.
    const dejaConge = existant && ['conge', 'recuperation'].includes(existant.type);
    if ((typePlanning === 'conge' || typePlanning === 'recuperation') && !dejaConge) {
      await supabaseAdmin.from('conges').insert({
        alternant_id, date_debut: date, date_fin: date, jours: 1,
        statut: 'validee', type: sousType,
        commentaire: "Ajouté manuellement par l'administrateur depuis le planning"
      });
      if (typePlanning === 'recuperation') await deduireRecuperation(req.db, alternant_id, [date]);
    }
  }
  res.redirect(retour || ('/alternants?voir=' + alternant_id));
});

router.post('/planning/commentaire', async (req, res) => {
  const { alternant_id, date, commentaire, retour } = req.body;
  if (req.profile.role !== 'admin' && req.profile.id !== alternant_id) {
    return res.status(403).send('Accès refusé.');
  }
  if (alternant_id && date) {
    const { data: existing } = await supabaseAdmin.from('planning').select('id').eq('alternant_id', alternant_id).eq('date', date).maybeSingle();
    if (existing) {
      await supabaseAdmin.from('planning').update({ commentaire: commentaire || null }).eq('alternant_id', alternant_id).eq('date', date);
    } else if (commentaire) {
      await supabaseAdmin.from('planning').insert({ alternant_id, date, commentaire });
    }
  }
  res.redirect(retour || '/planning');
});

router.post('/alternants/:id/planning-import', requireAdmin, upload.single('fichier'), async (req, res) => {
  const { data: alternant } = await req.db.from('profiles').select('*').eq('id', req.params.id).single();
  if (!req.file) {
    return res.render('planning-import-preview', { alternant, lignes: [], ignorees: 0, error: 'Veuillez joindre un fichier Excel (.xlsx) au format du modèle.' });
  }
  try {
    const { lignes, ignorees } = parseExcelPlanning(req.file.buffer);
    res.render('planning-import-preview', {
      alternant, lignes, ignorees,
      error: lignes.length === 0 ? "Aucune ligne exploitable trouvée dans le fichier. Vérifiez qu'il respecte le format du modèle." : null
    });
  } catch (e) {
    res.render('planning-import-preview', { alternant, lignes: [], ignorees: 0, error: "Impossible de lire ce fichier Excel : " + e.message });
  }
});

// Jour ouvré (hors week-ends et fériés) qui suit une date ISO.
function prochainJourOuvre(dateIso) {
  const d = parseIsoLocal(dateIso);
  do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6 || estFerie(iso(d)));
  return iso(d);
}

// Regroupe des dates ISO triées en périodes de jours ouvrés consécutifs
// (un week-end ou un férié entre deux jours ne coupe pas la période).
function grouperEnPeriodes(dates) {
  const periodes = [];
  dates.forEach(function (date) {
    const derniere = periodes[periodes.length - 1];
    if (derniere && prochainJourOuvre(derniere[derniere.length - 1]) === date) derniere.push(date);
    else periodes.push([date]);
  });
  return periodes;
}

router.post('/alternants/:id/planning-import/confirmer', requireAdmin, async (req, res) => {
  const dates = [].concat(req.body.date || []);
  const types = [].concat(req.body.type || []);
  const modalites = [].concat(req.body.modalite || []);
  const keep = [].concat(req.body.keep || []).map(String);

  const rows = [];
  dates.forEach((date, i) => {
    if (keep.includes(String(i)) && date && TYPES.includes(types[i]) && !estFerie(date)) {
      const modalite = types[i] === 'entreprise' && ['presentiel', 'distanciel'].includes(modalites[i]) ? modalites[i] : null;
      rows.push({ alternant_id: req.params.id, date, type: types[i], modalite });
    }
  });
  if (rows.length) {
    // Jours déjà en congé/récupération avant l'import : déjà comptés dans
    // l'onglet Congés, on ne les recompte pas.
    const { data: existants } = await req.db.from('planning')
      .select('date,type').eq('alternant_id', req.params.id)
      .in('date', rows.map(r => r.date));
    const dejaConges = new Set((existants || [])
      .filter(r => r.type === 'conge' || r.type === 'recuperation').map(r => r.date));

    await req.db.from('planning').upsert(rows, { onConflict: 'alternant_id,date' });

    // Même logique que l'ajout manuel (/planning/periode) : les jours importés
    // en congé/récupération alimentent l'onglet Congés — le solde en dépend.
    for (const type of ['conge', 'recuperation']) {
      const jours = rows.filter(r => r.type === type && !dejaConges.has(r.date)).map(r => r.date).sort();
      for (const periode of grouperEnPeriodes(jours)) {
        await supabaseAdmin.from('conges').insert({
          alternant_id: req.params.id,
          date_debut: periode[0], date_fin: periode[periode.length - 1],
          jours: periode.length, statut: 'validee',
          type: type === 'recuperation' ? 'recuperation' : 'paye',
          commentaire: 'Importé depuis le planning Excel'
        });
        if (type === 'recuperation') await deduireRecuperation(req.db, req.params.id, periode);
      }
    }
  }
  res.redirect('/alternants?voir=' + req.params.id);
});

module.exports = router;
