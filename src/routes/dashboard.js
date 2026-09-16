const express = require('express');
const router = express.Router();
const { next10JoursOuvres } = require('../lib/dates');
const { calculerAcquis } = require('../lib/conges');
const { supabaseAdmin } = require('../supabaseClient');

router.get('/dashboard', async (req, res) => {
  const db = req.db;
  const profile = req.profile;

  if (profile.role === 'admin') {
    const jours = next10JoursOuvres();
    const isoJours = jours.map(j => j.iso);

    const [{ data: alternants }, { data: pending }, { data: recentPaie }, { data: planningRows }] = await Promise.all([
      db.from('profiles').select('*').eq('role', 'alternant').order('nom'),
      db.from('conges').select('*, profiles!conges_alternant_id_fkey(prenom,nom)').eq('statut', 'attente'),
      db.from('fiches_paie').select('*, profiles!fiches_paie_alternant_id_fkey(prenom,nom,avatar_color)').order('date_depot', { ascending: false }).limit(5),
      db.from('planning').select('alternant_id,date,type').in('date', isoJours)
    ]);
    const planningMap = {};
    (planningRows || []).forEach(p => { planningMap[p.alternant_id + p.date] = p.type; });

    return res.render('dashboard-admin', {
      alternants: alternants || [],
      pending: pending || [],
      recentPaie: recentPaie || [],
      jours, planningMap
    });
  }

  const equipeJours = next10JoursOuvres();
  const equipeIso = equipeJours.map(j => j.iso);

  const [{ data: mesConges }, { data: congesValidees }, { count: enAttenteCount }, { data: mesHeures }, { data: derniereFiche }, { data: equipe }, { data: equipePlanning }] = await Promise.all([
    db.from('conges').select('*').eq('alternant_id', profile.id).order('date_debut', { ascending: false }).limit(3),
    db.from('conges').select('jours').eq('alternant_id', profile.id).eq('statut', 'validee'),
    db.from('conges').select('id', { count: 'exact', head: true }).eq('alternant_id', profile.id).eq('statut', 'attente'),
    db.from('heures_supplementaires').select('heures').eq('alternant_id', profile.id),
    db.from('fiches_paie').select('*').eq('alternant_id', profile.id).order('date_depot', { ascending: false }).limit(1),
    // Vue "équipe" : un alternant n'a pas le droit RLS de voir les autres profils/plannings,
    // on utilise donc le client admin pour cette lecture volontairement partagée.
    supabaseAdmin.from('profiles').select('*').eq('role', 'alternant').order('nom'),
    supabaseAdmin.from('planning').select('alternant_id,date,type').in('date', equipeIso)
  ]);
  const totalHeures = (mesHeures || []).reduce((s, h) => s + Number(h.heures), 0);
  const pris = (congesValidees || []).reduce((s, c) => s + Number(c.jours), 0);
  const acquis = calculerAcquis(profile.date_debut, profile.date_fin);
  const dispo = Math.round((acquis - pris) * 10) / 10;
  const enAttente = enAttenteCount || 0;
  const equipePlanningMap = {};
  (equipePlanning || []).forEach(p => { equipePlanningMap[p.alternant_id + p.date] = p.type; });

  res.render('dashboard-alternant', {
    mesConges: mesConges || [],
    dispo, enAttente, totalHeures,
    derniereFiche: derniereFiche && derniereFiche[0],
    equipe: equipe || [], equipeJours, equipePlanningMap
  });
});

module.exports = router;
