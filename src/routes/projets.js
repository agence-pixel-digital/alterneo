const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { supabaseAdmin } = require('../supabaseClient');
const { buildGanttProjets, fenetreGantt } = require('../lib/ganttProjets');

const VUES = ['liste', 'taches', 'kanban', 'gantt'];
const TACHE_STATUTS = ['a_faire', 'en_cours', 'termine'];

function normaliseMembres(body) {
  return [].concat(body.membres || []).filter(Boolean);
}

// Retour vers l'onglet d'origine après une action (vue + filtres conservés).
function retourOu(req, defaut) {
  const retour = req.body.retour || '';
  return retour.startsWith('/projets') ? retour : defaut;
}

router.get('/projets', async (req, res) => {
  const db = req.db;
  const isAdmin = req.profile.role === 'admin';
  const vue = VUES.includes(req.query.vue) ? req.query.vue : 'liste';
  const filtreProjet = req.query.projet || '';
  const filtreMembre = isAdmin ? (req.query.membre || '') : '';
  // Statuts sélectionnés (multi) : la vue Tâches s'ouvre sur « À faire » +
  // « En cours » ; un ?statut= explicitement vide signifie « tous ».
  let filtreStatut;
  if (req.query.statut === undefined) filtreStatut = vue === 'taches' ? ['a_faire', 'en_cours'] : [];
  else filtreStatut = String(req.query.statut).split(',').filter(s => TACHE_STATUTS.includes(s));
  const filtreMois = req.query.mois || '';
  const voirArchives = req.query.archives === '1';

  // RLS : un membre ne reçoit que les projets dont il fait partie (et leurs tâches).
  // La liste des alternants sert aussi aux membres : choix des membres d'un
  // projet et assignation des tâches dans les modales.
  const [{ data: projetsRows }, { data: tachesRows }, { data: alternants }] = await Promise.all([
    db.from('projets').select('*, projet_membres(profiles(id, prenom, nom, avatar_color))').order('date_debut'),
    db.from('taches').select('*, projets(id, nom, statut), profiles(id, prenom, nom, avatar_color)').order('created_at'),
    db.from('profiles').select('id, prenom, nom, avatar_color').eq('role', 'alternant').order('nom')
  ]);

  const taches = tachesRows || [];
  const projets = (projetsRows || []).map(p => {
    const membres = (p.projet_membres || []).map(pm => pm.profiles).filter(Boolean)
      .sort((a, b) => (a.prenom + a.nom).localeCompare(b.prenom + b.nom));
    const siennes = taches.filter(t => t.projet_id === p.id);
    return Object.assign({}, p, {
      membres,
      nbTaches: siennes.length,
      nbTerminees: siennes.filter(t => t.statut === 'termine').length,
      taches: siennes
    });
  });

  // Filtres partagés entre les vues.
  const parMembre = p => !filtreMembre || p.membres.some(m => m.id === filtreMembre);
  const parProjet = t => !filtreProjet || t.projet_id === filtreProjet;

  const projetsActifs = projets.filter(p => p.statut === 'actif');
  const projetsListe = projets.filter(p => (voirArchives ? p.statut === 'archive' : p.statut === 'actif') && parMembre(p));

  // Vue Tâches : tous projets confondus, filtrable par projet / membre / statuts.
  const tachesListe = taches.filter(t =>
    parProjet(t) &&
    (!filtreStatut.length || filtreStatut.includes(t.statut)) &&
    (!filtreMembre || t.assigne_id === filtreMembre)
  );

  // Projet mis en avant quand la vue Tâches est filtrée sur un projet précis.
  const projetSelectionne = filtreProjet ? projets.find(p => p.id === filtreProjet) || null : null;

  // Kanban : les projets archivés n'encombrent pas le tableau.
  const idsActifs = new Set(projetsActifs.map(p => p.id));
  const tachesKanban = taches.filter(t => parProjet(t) && idsActifs.has(t.projet_id) &&
    (!filtreMembre || t.assigne_id === filtreMembre));

  // Gantt : une ligne par alternant, avec les projets actifs dont il est
  // membre dans la fenêtre + ses semaines d'école.
  let gantt = null;
  let fenetre = null;
  if (vue === 'gantt') {
    fenetre = fenetreGantt(filtreMois);
    const membreIds = [...new Set(projetsActifs.flatMap(p => p.membres.map(m => m.id)))]
      .filter(id => !filtreMembre || id === filtreMembre);
    let ecoleRows = [];
    if (membreIds.length) {
      const { data } = await db.from('planning').select('alternant_id, date')
        .eq('type', 'ecole').in('alternant_id', membreIds)
        .gte('date', fenetre.debut).lte('date', fenetre.fin);
      ecoleRows = data || [];
    }
    gantt = buildGanttProjets(projetsActifs, Object.assign({ ecole: ecoleRows, membre: filtreMembre }, fenetre));
  }

  res.render('projets', {
    isAdmin, vue,
    STATUTS: { a_faire: 'À faire', en_cours: 'En cours', termine: 'Terminé' },
    STATUT_BADGES: { a_faire: 'badge-afaire', en_cours: 'badge-encours', termine: 'badge-termine' },
    projets, projetsListe, projetsActifs, projetSelectionne,
    taches: tachesListe, tachesKanban,
    alternants: alternants || [],
    gantt,
    filtreProjet, filtreMembre, filtreStatut, filtreMois, voirArchives,
    moi: req.profile.id
  });
});

// Création ouverte aux alternants : un alternant devient automatiquement
// membre du projet qu'il crée (sinon il ne le verrait pas, RLS oblige).
// L'insertion passe par supabaseAdmin car le créateur n'est membre qu'après
// coup ; l'appartenance forcée joue le rôle de garde-fou.
router.post('/projets', async (req, res) => {
  const { nom, description, date_debut, date_fin } = req.body;
  let membres = normaliseMembres(req.body);
  if (req.profile.role !== 'admin' && !membres.includes(req.profile.id)) membres.push(req.profile.id);
  if (nom && date_debut && date_fin) {
    const { data: projet } = await supabaseAdmin.from('projets')
      .insert({ nom, description: description || null, date_debut, date_fin })
      .select('id').single();
    if (projet && membres.length) {
      await supabaseAdmin.from('projet_membres').insert(membres.map(id => ({ projet_id: projet.id, profile_id: id })));
    }
  }
  res.redirect(retourOu(req, '/projets'));
});

// Modification ouverte aux membres du projet (la RLS refuse les non-membres).
router.post('/projets/:id', async (req, res) => {
  const { nom, description, date_debut, date_fin } = req.body;
  const isAdmin = req.profile.role === 'admin';
  let membres = normaliseMembres(req.body);
  if (!isAdmin && !membres.includes(req.profile.id)) membres.push(req.profile.id);
  if (nom && date_debut && date_fin) {
    const { data: modifie } = await req.db.from('projets')
      .update({ nom, description: description || null, date_debut, date_fin })
      .eq('id', req.params.id).select('id');
    if (modifie && modifie.length) {
      // Les membres sont remplacés par la sélection du formulaire. Un membre
      // garde sa propre ligne (supprimée en dernier lieu jamais) pour rester
      // autorisé par la RLS pendant la réinsertion des autres.
      let suppr = req.db.from('projet_membres').delete().eq('projet_id', req.params.id);
      if (!isAdmin) suppr = suppr.neq('profile_id', req.profile.id);
      await suppr;
      const aInserer = isAdmin ? membres : membres.filter(id => id !== req.profile.id);
      if (aInserer.length) {
        await req.db.from('projet_membres').insert(aInserer.map(id => ({ projet_id: req.params.id, profile_id: id })));
      }
    }
  }
  res.redirect(retourOu(req, '/projets'));
});

router.post('/projets/:id/archiver', requireAdmin, async (req, res) => {
  const { data: projet } = await req.db.from('projets').select('statut').eq('id', req.params.id).single();
  if (projet) {
    await req.db.from('projets')
      .update({ statut: projet.statut === 'actif' ? 'archive' : 'actif' })
      .eq('id', req.params.id);
  }
  res.redirect(retourOu(req, '/projets'));
});

router.post('/projets/:id/supprimer', requireAdmin, async (req, res) => {
  await req.db.from('projets').delete().eq('id', req.params.id);
  res.redirect(retourOu(req, '/projets'));
});

// Création/modification de tâches ouvertes aux membres du projet (RLS).
router.post('/taches', async (req, res) => {
  const { projet_id, titre, description, assigne_id, statut } = req.body;
  if (projet_id && titre) {
    await req.db.from('taches').insert({
      projet_id, titre,
      description: description || null,
      assigne_id: assigne_id || null,
      statut: TACHE_STATUTS.includes(statut) ? statut : 'a_faire'
    });
  }
  res.redirect(retourOu(req, '/projets?vue=taches'));
});

router.post('/taches/:id', async (req, res) => {
  const { projet_id, titre, description, assigne_id, statut } = req.body;
  if (projet_id && titre) {
    await req.db.from('taches').update({
      projet_id, titre,
      description: description || null,
      assigne_id: assigne_id || null,
      statut: TACHE_STATUTS.includes(statut) ? statut : 'a_faire'
    }).eq('id', req.params.id);
  }
  res.redirect(retourOu(req, '/projets?vue=taches'));
});

router.post('/taches/:id/supprimer', requireAdmin, async (req, res) => {
  await req.db.from('taches').delete().eq('id', req.params.id);
  res.redirect(retourOu(req, '/projets?vue=taches'));
});

// Changement de statut seul : utilisé par le glisser-déposer du Kanban (fetch)
// et par la modale côté membre. La RLS garantit qu'un membre ne peut modifier
// que les tâches de ses projets, assignées à lui ou non assignées.
router.post('/taches/:id/statut', async (req, res) => {
  const { statut } = req.body;
  const enAjax = req.get('X-Requested-With') === 'fetch';
  if (!TACHE_STATUTS.includes(statut)) {
    return enAjax ? res.status(400).json({ ok: false }) : res.redirect('/projets?vue=kanban');
  }
  const { data } = await req.db.from('taches').update({ statut }).eq('id', req.params.id).select('id');
  const ok = !!(data && data.length);
  if (enAjax) return res.status(ok ? 200 : 403).json({ ok });
  res.redirect(retourOu(req, '/projets?vue=kanban'));
});

module.exports = router;
