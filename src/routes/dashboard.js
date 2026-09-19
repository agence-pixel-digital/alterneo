const express = require('express');
const router = express.Router();
const { next10JoursOuvres, iso } = require('../lib/dates');
const { calculerAcquis } = require('../lib/conges');
const { supabaseAdmin } = require('../supabaseClient');

const PRIORITE_RANG = { haute: 0, normale: 1, basse: 2 };
const PRIORITE_LABEL = { basse: 'Basse', normale: 'Normale', haute: 'Haute' };
const PRIORITE_BADGE = { basse: 'badge-prio-basse', normale: 'badge-prio-normale', haute: 'badge-prio-haute' };

const SELECT_TICKET_MINI = '*, ticket_assignes(profiles(id, prenom, nom, avatar_color))';

// Lundi (ISO) de la semaine d'une date, pour regrouper les jours d'école.
function lundiIso(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // lundi = 0
  dt.setDate(dt.getDate() - dow);
  return iso(dt);
}

// Regroupe des jours d'école (avec noms d'alternant) en semaines à venir uniques.
function semainesEcole(rows, avecAlternant) {
  const vues = new Set();
  const out = [];
  (rows || []).forEach(r => {
    const lundi = lundiIso(r.date);
    const cle = (avecAlternant ? r.alternant_id : '') + lundi;
    if (vues.has(cle)) return;
    vues.add(cle);
    out.push({ lundi, alternant_id: r.alternant_id });
  });
  out.sort((a, b) => a.lundi.localeCompare(b.lundi));
  return out;
}

function triTicket(a, b) { return PRIORITE_RANG[a.priorite] - PRIORITE_RANG[b.priorite]; }
function decoreTicket(t) {
  return Object.assign({}, t, {
    assignes: (t.ticket_assignes || []).map(a => a.profiles).filter(Boolean)
  });
}

router.get('/dashboard', async (req, res) => {
  const db = req.db;
  const profile = req.profile;
  const today = iso(new Date());
  const n = new Date();
  const dansXjours = iso(new Date(n.getFullYear(), n.getMonth(), n.getDate() + 120));

  if (profile.role === 'admin') {
    const jours = next10JoursOuvres();
    const isoJours = jours.map(j => j.iso);

    const [{ data: alternants }, { data: pending }, { data: ticketsRows },
      { data: projetsRows }, { data: congesValidees }, { data: heures },
      { data: planningRows }, { data: ecoleRows }] = await Promise.all([
      db.from('profiles').select('*').eq('role', 'alternant').order('nom'),
      db.from('conges').select('*, profiles!conges_alternant_id_fkey(prenom,nom)').eq('statut', 'attente').order('date_debut'),
      db.from('tickets').select(SELECT_TICKET_MINI).order('created_at', { ascending: false }),
      db.from('projets').select('id, nom, statut, taches(statut)').eq('statut', 'actif').order('date_debut'),
      db.from('conges').select('alternant_id, jours').eq('statut', 'validee'),
      db.from('heures_supplementaires').select('alternant_id, heures'),
      db.from('planning').select('alternant_id,date,type').in('date', isoJours),
      db.from('planning').select('alternant_id,date').eq('type', 'ecole').gte('date', today).lte('date', dansXjours)
    ]);

    const tickets = (ticketsRows || []).map(decoreTicket);
    const ticketsOuverts = tickets.filter(t => t.statut === 'ouvert').sort(triTicket);
    const ticketsTermines = tickets.filter(t => t.statut === 'termine').length;

    // Soldes congés / heures par alternant.
    const prisParAlt = {}; (congesValidees || []).forEach(c => { prisParAlt[c.alternant_id] = (prisParAlt[c.alternant_id] || 0) + Number(c.jours); });
    const heuresParAlt = {}; (heures || []).forEach(h => { heuresParAlt[h.alternant_id] = (heuresParAlt[h.alternant_id] || 0) + Number(h.heures); });
    const soldes = (alternants || []).map(a => {
      const acquis = calculerAcquis(a.date_debut, a.date_fin);
      const pris = prisParAlt[a.id] || 0;
      return { alternant: a, congesDispo: Math.round((acquis - pris) * 10) / 10, heures: heuresParAlt[a.id] || 0 };
    });

    const projets = (projetsRows || []).map(p => {
      const t = p.taches || [];
      const terminees = t.filter(x => x.statut === 'termine').length;
      return { id: p.id, nom: p.nom, nbTaches: t.length, nbTerminees: terminees, pct: t.length ? Math.round(terminees / t.length * 100) : 0 };
    });

    const nomsAlt = {}; (alternants || []).forEach(a => { nomsAlt[a.id] = a; });
    const ecole = semainesEcole(ecoleRows, true).slice(0, 8)
      .map(s => ({ lundi: s.lundi, alternant: nomsAlt[s.alternant_id] })).filter(s => s.alternant);

    const planningMap = {};
    (planningRows || []).forEach(p => { planningMap[p.alternant_id + p.date] = p.type; });

    return res.render('dashboard-admin', {
      alternants: alternants || [], pending: pending || [],
      ticketsOuverts, ticketsTermines, projets, soldes, ecole,
      jours, planningMap, PRIORITE_LABEL, PRIORITE_BADGE
    });
  }

  // ---- Alternant ----
  const equipeJours = next10JoursOuvres();
  const equipeIso = equipeJours.map(j => j.iso);

  const [{ data: ticketsRows }, { data: mesTaches }, { data: mesProjetsRows },
    { data: congesValidees }, { count: enAttenteCount }, { data: mesHeures },
    { data: derniereFiche }, { data: mesEcole }, { data: equipe }, { data: equipePlanning }] = await Promise.all([
    db.from('tickets').select(SELECT_TICKET_MINI).order('created_at', { ascending: false }),
    db.from('taches').select('*, projets(nom,statut)').eq('assigne_id', profile.id).neq('statut', 'termine').order('created_at'),
    db.from('projets').select('id, nom, statut, taches(statut)').eq('statut', 'actif').order('date_debut'),
    db.from('conges').select('jours').eq('alternant_id', profile.id).eq('statut', 'validee'),
    db.from('conges').select('id', { count: 'exact', head: true }).eq('alternant_id', profile.id).eq('statut', 'attente'),
    db.from('heures_supplementaires').select('heures').eq('alternant_id', profile.id),
    db.from('fiches_paie').select('*').eq('alternant_id', profile.id).order('date_depot', { ascending: false }).limit(1),
    db.from('planning').select('date').eq('alternant_id', profile.id).eq('type', 'ecole').gte('date', today).lte('date', dansXjours),
    // Vue "équipe" volontairement partagée (RLS bypass assumé, lecture seule).
    supabaseAdmin.from('profiles').select('*').eq('role', 'alternant').order('nom'),
    supabaseAdmin.from('planning').select('alternant_id,date,type').in('date', equipeIso)
  ]);

  const tickets = (ticketsRows || []).map(decoreTicket);
  const mesTickets = tickets.filter(t => t.statut === 'ouvert').sort(triTicket);

  const mesProjets = (mesProjetsRows || []).map(p => {
    const t = p.taches || [];
    const terminees = t.filter(x => x.statut === 'termine').length;
    return { id: p.id, nom: p.nom, nbTaches: t.length, nbTerminees: terminees, pct: t.length ? Math.round(terminees / t.length * 100) : 0 };
  });

  const totalHeures = (mesHeures || []).reduce((s, h) => s + Number(h.heures), 0);
  const pris = (congesValidees || []).reduce((s, c) => s + Number(c.jours), 0);
  const acquis = calculerAcquis(profile.date_debut, profile.date_fin);
  const dispo = Math.round((acquis - pris) * 10) / 10;
  const mesSemainesEcole = semainesEcole(mesEcole, false).slice(0, 6);

  const equipePlanningMap = {};
  (equipePlanning || []).forEach(p => { equipePlanningMap[p.alternant_id + p.date] = p.type; });

  res.render('dashboard-alternant', {
    mesTickets, mesTaches: mesTaches || [], mesProjets,
    dispo, enAttente: enAttenteCount || 0, totalHeures,
    derniereFiche: derniereFiche && derniereFiche[0],
    mesSemainesEcole,
    equipe: equipe || [], equipeJours, equipePlanningMap,
    PRIORITE_LABEL, PRIORITE_BADGE
  });
});

module.exports = router;
