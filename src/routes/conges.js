const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { joursOuvresEntre } = require('../lib/dates');
const { calculerAcquis } = require('../lib/conges');
const { notifierNouvelleCongeDemande, notifierReponseConge } = require('../lib/notifications');
const { deduireRecuperation, annulerDeductionRecuperation } = require('../lib/heuresSupp');

async function soldeAlternant(db, alternantId, dateDebut, dateFin) {
  // Seuls les congés de type "payé" entament le solde de congés payés — les
  // jours de récupération sont décomptés directement du compteur d'heures
  // supplémentaires via une ligne négative dans heures_supplementaires
  // (voir deduireRecuperation), donc le solde d'heures dispo est le total net.
  const [{ data: payes }, { data: heuresSupp }] = await Promise.all([
    db.from('conges').select('jours').eq('alternant_id', alternantId).eq('statut', 'validee').eq('type', 'paye'),
    db.from('heures_supplementaires').select('heures').eq('alternant_id', alternantId)
  ]);
  const pris = (payes || []).reduce((s, c) => s + Number(c.jours), 0);
  const acquis = calculerAcquis(dateDebut, dateFin);
  const heuresRecupDispo = Math.round((heuresSupp || []).reduce((s, h) => s + Number(h.heures), 0) * 10) / 10;

  return { acquis, pris, dispo: Math.round((acquis - pris) * 10) / 10, heuresRecupDispo };
}

router.get('/conges', async (req, res) => {
  const db = req.db;
  const profile = req.profile;

  if (profile.role === 'admin') {
    const { alt, mois } = req.query;

    let pendingQuery = db.from('conges').select('*, profiles!conges_alternant_id_fkey(prenom,nom,date_debut,date_fin)').eq('statut', 'attente');
    let treatedQuery = db.from('conges').select('*, profiles!conges_alternant_id_fkey(prenom,nom)').neq('statut', 'attente').order('date_debut', { ascending: false });
    if (alt) { pendingQuery = pendingQuery.eq('alternant_id', alt); treatedQuery = treatedQuery.eq('alternant_id', alt); }
    if (mois) {
      const debut = mois + '-01';
      const fin = mois + '-31';
      pendingQuery = pendingQuery.gte('date_debut', debut).lte('date_debut', fin);
      treatedQuery = treatedQuery.gte('date_debut', debut).lte('date_debut', fin);
    }

    const [{ data: pending }, { data: treated }, { data: alternants }] = await Promise.all([
      pendingQuery, treatedQuery,
      db.from('profiles').select('id,prenom,nom').eq('role', 'alternant').order('nom')
    ]);
    const pendingAvecSolde = await Promise.all((pending || []).map(async c => ({
      ...c, solde: await soldeAlternant(db, c.alternant_id, c.profiles.date_debut, c.profiles.date_fin)
    })));
    return res.render('conges-admin', {
      pending: pendingAvecSolde, treated: treated || [], alternants: alternants || [],
      filtreAlt: alt || '', filtreMois: mois || ''
    });
  }

  const [{ data: mine }, solde] = await Promise.all([
    db.from('conges').select('*').eq('alternant_id', profile.id).order('date_debut', { ascending: false }),
    soldeAlternant(db, profile.id, profile.date_debut, profile.date_fin)
  ]);
  res.render('conges-alternant', { conges: mine || [], solde, error: null });
});

router.post('/conges', async (req, res) => {
  const { date_debut, date_fin, commentaire } = req.body;
  let type = 'paye';
  if (req.body.type === 'recuperation' && req.profile.heures_eligible) type = 'recuperation';
  else if (req.body.type === 'sans_solde') type = 'sans_solde';
  const jours = joursOuvresEntre(date_debut, date_fin).length;
  if (jours <= 0) {
    const [{ data: mine }, solde] = await Promise.all([
      req.db.from('conges').select('*').eq('alternant_id', req.profile.id),
      soldeAlternant(req.db, req.profile.id, req.profile.date_debut, req.profile.date_fin)
    ]);
    return res.render('conges-alternant', { conges: mine || [], solde, error: 'Dates invalides.' });
  }
  const { data: conge } = await req.db.from('conges').insert({
    alternant_id: req.profile.id, date_debut, date_fin, jours, commentaire, statut: 'attente', type
  }).select().single();
  if (conge) notifierNouvelleCongeDemande(req.profile, conge);
  res.redirect('/conges');
});

router.post('/conges/:id/valider', requireAdmin, async (req, res) => {
  const { data: conge } = await req.db.from('conges').select('*, profiles!conges_alternant_id_fkey(prenom,nom,email)').eq('id', req.params.id).single();
  await req.db.from('conges').update({ statut: 'validee' }).eq('id', req.params.id);

  if (conge) {
    const planningType = conge.type === 'recuperation' ? 'recuperation' : 'conge';
    const jours = joursOuvresEntre(conge.date_debut, conge.date_fin);
    const rows = jours.map(date => ({ alternant_id: conge.alternant_id, date, type: planningType }));
    if (rows.length) await req.db.from('planning').upsert(rows, { onConflict: 'alternant_id,date' });
    if (conge.type === 'recuperation') await deduireRecuperation(req.db, conge.alternant_id, jours);
    notifierReponseConge(conge.profiles, { ...conge, statut: 'validee' });
  }
  res.redirect('/conges');
});

router.post('/conges/:id/refuser', requireAdmin, async (req, res) => {
  const motif_refus = req.body.motif_refus || 'Non précisé';
  const { data: conge } = await req.db.from('conges').select('*, profiles!conges_alternant_id_fkey(prenom,nom,email)').eq('id', req.params.id).single();
  await req.db.from('conges').update({ statut: 'refusee', motif_refus }).eq('id', req.params.id);
  if (conge) notifierReponseConge(conge.profiles, { ...conge, statut: 'refusee', motif_refus });
  res.redirect('/conges');
});

router.post('/conges/:id/supprimer', requireAdmin, async (req, res) => {
  const { data: conge } = await req.db.from('conges').select('*').eq('id', req.params.id).single();
  await req.db.from('conges').delete().eq('id', req.params.id);

  if (conge && conge.statut === 'validee' && conge.type === 'recuperation') {
    const dates = joursOuvresEntre(conge.date_debut, conge.date_fin);
    await annulerDeductionRecuperation(req.db, conge.alternant_id, dates);
  }

  const remplacement = req.body.remplacement;
  if (conge && (remplacement === 'ecole' || remplacement === 'entreprise')) {
    const dates = joursOuvresEntre(conge.date_debut, conge.date_fin);
    const { data: planningRows } = await req.db.from('planning').select('date,type')
      .eq('alternant_id', conge.alternant_id).in('date', dates);
    const aRemplacer = (planningRows || []).filter(p => p.type === 'conge' || p.type === 'recuperation').map(p => p.date);
    if (aRemplacer.length) {
      const rows = aRemplacer.map(date => ({ alternant_id: conge.alternant_id, date, type: remplacement }));
      await req.db.from('planning').upsert(rows, { onConflict: 'alternant_id,date' });
    }
  }
  res.redirect('/conges');
});

module.exports = router;
