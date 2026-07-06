const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware');

router.get('/missions', async (req, res) => {
  const db = req.db;
  const profile = req.profile;
  const { mois } = req.query;

  if (profile.role === 'admin') {
    const { alt } = req.query;
    const { data: alternants } = await db.from('profiles').select('*').eq('role', 'alternant').order('nom');

    let query = db.from('missions')
      .select('*, profiles!missions_alternant_id_fkey(prenom,nom,avatar_color)')
      .order('date_debut', { ascending: false });
    if (alt) query = query.eq('alternant_id', alt);
    if (mois) query = query.lte('date_debut', mois + '-31').gte('date_fin', mois + '-01');
    const { data: missions } = await query;

    return res.render('missions-admin', {
      alternants: alternants || [], missions: missions || [],
      filtreAlt: alt || '', filtreMois: mois || '', error: null
    });
  }

  let query = db.from('missions').select('*').eq('alternant_id', profile.id).order('date_debut', { ascending: false });
  if (mois) query = query.lte('date_debut', mois + '-31').gte('date_fin', mois + '-01');
  const { data: missions } = await query;
  res.render('missions-alternant', { missions: missions || [], filtreMois: mois || '' });
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

router.post('/missions/:id/supprimer', requireAdmin, async (req, res) => {
  await req.db.from('missions').delete().eq('id', req.params.id);
  res.redirect('/missions');
});

module.exports = router;
