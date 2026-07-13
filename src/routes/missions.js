const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { buildGanttData, fenetreGantt } = require('../lib/ganttMissions');

router.get('/missions', async (req, res) => {
  const db = req.db;
  const profile = req.profile;
  const { mois } = req.query;

  // Le Gantt n'affiche que le mois filtré, ou par défaut le mois en cours + le suivant.
  const fenetre = fenetreGantt(mois);

  if (profile.role === 'admin') {
    const { alt } = req.query;
    const { data: alternants } = await db.from('profiles').select('*').eq('role', 'alternant').order('nom');

    let query = db.from('missions')
      .select('*, profiles!missions_alternant_id_fkey(prenom,nom,avatar_color)')
      .lte('date_debut', fenetre.fin).gte('date_fin', fenetre.debut)
      .order('date_debut', { ascending: true });
    if (alt) query = query.eq('alternant_id', alt);
    const { data: missions } = await query;

    // Jours d'école du planning : affichés sur le Gantt comme des blocs non modifiables.
    let ecoleQuery = db.from('planning').select('alternant_id,date').eq('type', 'ecole')
      .gte('date', fenetre.debut).lte('date', fenetre.fin);
    if (alt) ecoleQuery = ecoleQuery.eq('alternant_id', alt);
    const { data: ecoleRows } = await ecoleQuery;

    const profils = {};
    (alternants || []).forEach(a => { profils[a.id] = a; });

    return res.render('missions-admin', {
      alternants: alternants || [], missions: missions || [],
      gantt: buildGanttData(missions || [], null, Object.assign({ ecole: ecoleRows || [], profils }, fenetre)),
      filtreAlt: alt || '', filtreMois: mois || '', error: null
    });
  }

  const [{ data: missions }, { data: ecoleRows }] = await Promise.all([
    db.from('missions').select('*').eq('alternant_id', profile.id)
      .lte('date_debut', fenetre.fin).gte('date_fin', fenetre.debut)
      .order('date_debut', { ascending: true }),
    db.from('planning').select('alternant_id,date').eq('alternant_id', profile.id).eq('type', 'ecole')
      .gte('date', fenetre.debut).lte('date', fenetre.fin)
  ]);
  res.render('missions-alternant', {
    missions: missions || [],
    gantt: buildGanttData(missions || [], profile, Object.assign({ ecole: ecoleRows || [] }, fenetre)),
    filtreMois: mois || ''
  });
});

router.post('/missions', async (req, res) => {
  const { titre, description, date_debut, date_fin } = req.body;
  // Un alternant ne peut créer une mission que pour lui-même ; seul l'admin
  // choisit librement l'alternant destinataire.
  const alternant_id = req.profile.role === 'admin' ? req.body.alternant_id : req.profile.id;
  if (alternant_id && titre && date_debut && date_fin) {
    await req.db.from('missions').insert({
      alternant_id, titre, description: description || null, date_debut, date_fin
    });
  }
  res.redirect('/missions');
});

router.post('/missions/:id', requireAdmin, async (req, res) => {
  const { titre, description, date_debut, date_fin, alternant_id } = req.body;
  await req.db.from('missions').update({
    alternant_id, titre, description: description || null, date_debut, date_fin
  }).eq('id', req.params.id);
  res.redirect('/missions');
});

router.post('/missions/:id/supprimer', requireAdmin, async (req, res) => {
  await req.db.from('missions').delete().eq('id', req.params.id);
  res.redirect('/missions');
});

module.exports = router;
