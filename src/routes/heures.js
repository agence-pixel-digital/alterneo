const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { iso } = require('../lib/dates');

router.get('/heures', async (req, res) => {
  const db = req.db;
  const profile = req.profile;

  if (profile.role === 'admin') {
    const { alt, mois } = req.query;
    const { data: alternants } = await db.from('profiles').select('*').eq('role', 'alternant').order('nom');

    const { data: allHeures } = await db.from('heures_supplementaires').select('alternant_id, heures');
    const totaux = {};
    (allHeures || []).forEach(h => { totaux[h.alternant_id] = (totaux[h.alternant_id] || 0) + Number(h.heures); });

    let historiqueQuery = db.from('heures_supplementaires')
      .select('*, profiles!heures_supplementaires_alternant_id_fkey(prenom,nom,avatar_color)')
      .order('date', { ascending: false });
    if (alt) historiqueQuery = historiqueQuery.eq('alternant_id', alt);
    if (mois) historiqueQuery = historiqueQuery.gte('date', mois + '-01').lte('date', mois + '-31');
    const { data: historique } = await historiqueQuery;

    return res.render('heures-admin', {
      alternants: alternants || [], totaux, historique: historique || [],
      filtreAlt: alt || '', filtreMois: mois || '', error: null
    });
  }

  if (!profile.heures_eligible) {
    return res.render('heures-alternant', { eligible: false, total: 0, historique: [] });
  }
  const { data: historique } = await db.from('heures_supplementaires').select('*').eq('alternant_id', profile.id).order('date', { ascending: false });
  const total = (historique || []).reduce((s, h) => s + Number(h.heures), 0);
  res.render('heures-alternant', { eligible: true, total, historique: historique || [] });
});

router.post('/heures', requireAdmin, async (req, res) => {
  const { alternant_id, heures, date, motif } = req.body;
  const h = parseFloat(heures);
  if (alternant_id && h) {
    await req.db.from('heures_supplementaires').insert({
      alternant_id, heures: h, date: date || iso(new Date()), motif: motif || 'Heures supplémentaires'
    });
  }
  res.redirect('/heures?alt=' + alternant_id);
});

router.post('/heures/:id/supprimer', requireAdmin, async (req, res) => {
  const { retour } = req.body;
  await req.db.from('heures_supplementaires').delete().eq('id', req.params.id);
  res.redirect(retour || '/heures');
});

module.exports = router;
