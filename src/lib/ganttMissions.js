const { iso, parseIsoLocal } = require('./dates');

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

function jours(a, b) {
  return Math.round((parseIsoLocal(b) - parseIsoLocal(a)) / 86400000);
}

// Regroupe des dates (ISO, triées) en plages de jours consécutifs : les jours
// d'école du planning deviennent ainsi des blocs hebdomadaires (la coupure du
// week-end sépare naturellement chaque semaine de cours).
function grouperEnPlages(dates) {
  const plages = [];
  dates.sort();
  dates.forEach(date => {
    const derniere = plages[plages.length - 1];
    if (derniere && jours(derniere.fin, date) === 1) derniere.fin = date;
    else plages.push({ debut: date, fin: date });
  });
  return plages;
}

// Construit les données d'un Gantt (une ligne par alternant, des barres
// positionnées en % sur une frise temporelle bornée par options.debut/fin).
// Les missions qui se chevauchent sont réparties sur des sous-lignes (lanes)
// pour rester toutes visibles ; les semaines d'école occupent une sous-ligne
// dédiée en haut, sous forme de blocs non modifiables.
function buildGanttData(missions, fallbackProfile, options = {}) {
  const min = options.debut;
  const max = options.fin;
  const totalDays = jours(min, max) + 1;
  const ecoleRows = options.ecole || [];

  const pct = (isoDate) => (jours(min, isoDate) / totalDays) * 100;

  // Position/largeur d'une plage, bornée à la fenêtre affichée.
  function barre(debut, fin) {
    if (fin < min || debut > max) return null;
    const d = debut < min ? min : debut;
    const f = fin > max ? max : fin;
    return { leftPct: pct(d), widthPct: Math.max(1, ((jours(d, f) + 1) / totalDays) * 100) };
  }

  const byAlternant = {};
  function ligneDe(alternantId, profile) {
    if (!byAlternant[alternantId]) byAlternant[alternantId] = { profile, items: [], ecole: [] };
    return byAlternant[alternantId];
  }

  (missions || []).forEach(m => {
    const pos = barre(m.date_debut, m.date_fin);
    if (!pos) return;
    const profile = m.profiles || fallbackProfile;
    ligneDe(m.alternant_id, profile).items.push(Object.assign({
      id: m.id, alternantId: m.alternant_id, titre: m.titre, description: m.description,
      date_debut: m.date_debut, date_fin: m.date_fin
    }, pos));
  });

  // Blocs école : une plage par groupe de jours consécutifs.
  const ecoleParAlternant = {};
  ecoleRows.forEach(r => {
    (ecoleParAlternant[r.alternant_id] = ecoleParAlternant[r.alternant_id] || []).push(r.date);
  });
  Object.entries(ecoleParAlternant).forEach(([alternantId, dates]) => {
    const profile = (options.profils && options.profils[alternantId]) || fallbackProfile;
    if (!profile) return;
    const ligne = ligneDe(alternantId, profile);
    grouperEnPlages(dates).forEach(p => {
      const pos = barre(p.debut, p.fin);
      if (pos) ligne.ecole.push(Object.assign({ date_debut: p.debut, date_fin: p.fin }, pos));
    });
  });

  const lignes = Object.values(byAlternant).filter(l => l.items.length || l.ecole.length);
  if (lignes.length === 0) return null;
  lignes.sort((a, b) => (a.profile.prenom + a.profile.nom).localeCompare(b.profile.prenom + b.profile.nom));

  // Répartition en sous-lignes : l'école occupe la lane 0, puis chaque mission
  // prend la première lane libre (pas de chevauchement au sein d'une lane).
  lignes.forEach(l => {
    const premiere = l.ecole.length ? 1 : 0;
    l.ecole.forEach(e => { e.lane = 0; });
    const lanesFin = []; // date de fin de la dernière barre de chaque lane mission
    l.items.sort((a, b) => a.date_debut.localeCompare(b.date_debut) || b.date_fin.localeCompare(a.date_fin));
    l.items.forEach(it => {
      let lane = 0;
      while (lanesFin[lane] && lanesFin[lane] >= it.date_debut) lane++;
      lanesFin[lane] = it.date_fin;
      it.lane = premiere + lane;
    });
    l.laneCount = premiere + Math.max(lanesFin.length, l.ecole.length ? 0 : 1);
  });

  // Repères mensuels : un trait + libellé au 1er de chaque mois de la fenêtre.
  const markers = [];
  const cursor = parseIsoLocal(min);
  cursor.setDate(1);
  if (iso(cursor) < min) cursor.setMonth(cursor.getMonth() + 1);
  while (cursor <= parseIsoLocal(max)) {
    markers.push({ label: MONTHS_FR[cursor.getMonth()] + ' ' + cursor.getFullYear(), leftPct: pct(iso(cursor)) });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Repères hebdomadaires (un trait discret chaque lundi) pour bien distinguer les semaines.
  const semaines = [];
  const wCursor = parseIsoLocal(min);
  while (wCursor <= parseIsoLocal(max)) {
    if (wCursor.getDay() === 1) semaines.push({ leftPct: pct(iso(wCursor)) });
    wCursor.setDate(wCursor.getDate() + 1);
  }

  // Semaine en cours (surbrillance) : permet de repérer d'un coup d'œil quelles
  // missions sont actuellement en train d'être réalisées.
  let semaineActuelle = null;
  const today = new Date();
  const dow = today.getDay(); // 0 = dimanche
  const diffLundi = dow === 0 ? -6 : 1 - dow;
  const lundi = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffLundi);
  const dimanche = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + 6);
  const posSemaine = barre(iso(lundi), iso(dimanche));
  if (posSemaine) semaineActuelle = posSemaine;

  return { lignes, markers, semaines, semaineActuelle };
}

// Fenêtre d'affichage du Gantt : le mois demandé seul, ou par défaut le mois
// en cours + le mois suivant.
function fenetreGantt(mois) {
  let y, m; // m : 1-12
  if (mois && /^\d{4}-\d{2}$/.test(mois)) {
    [y, m] = mois.split('-').map(Number);
    return { debut: `${y}-${String(m).padStart(2, '0')}-01`, fin: iso(new Date(y, m, 0)) };
  }
  const now = new Date();
  y = now.getFullYear(); m = now.getMonth() + 1;
  return { debut: `${y}-${String(m).padStart(2, '0')}-01`, fin: iso(new Date(y, m + 1, 0)) };
}

module.exports = { buildGanttData, fenetreGantt };
