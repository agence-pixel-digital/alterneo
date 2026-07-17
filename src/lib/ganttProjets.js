const { iso, parseIsoLocal } = require('./dates');

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

function jours(a, b) {
  return Math.round((parseIsoLocal(b) - parseIsoLocal(a)) / 86400000);
}

// Regroupe des dates (ISO) en plages de jours consécutifs : les jours d'école
// du planning deviennent ainsi des blocs hebdomadaires (la coupure du week-end
// sépare naturellement chaque semaine de cours).
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

// Construit les données du Gantt des projets : une ligne par alternant, avec
// les barres des projets dont il est membre sur leur durée globale. Les
// projets qui se chevauchent sont répartis sur des sous-lignes (lanes) ; les
// semaines d'école occupent la sous-ligne du haut, en blocs non modifiables.
function buildGanttProjets(projets, options = {}) {
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

  const byMembre = {};
  function ligneDe(profile) {
    if (!byMembre[profile.id]) byMembre[profile.id] = { profile, items: [], ecole: [] };
    return byMembre[profile.id];
  }

  (projets || []).forEach(p => {
    const pos = barre(p.date_debut, p.date_fin);
    if (!pos) return;
    (p.membres || []).forEach(m => {
      ligneDe(m).items.push(Object.assign({ projet: p }, pos));
    });
  });

  // Blocs école : une plage par groupe de jours consécutifs, sur la ligne du membre.
  const ecoleParMembre = {};
  ecoleRows.forEach(r => {
    (ecoleParMembre[r.alternant_id] = ecoleParMembre[r.alternant_id] || []).push(r.date);
  });
  Object.entries(ecoleParMembre).forEach(([membreId, dates]) => {
    const ligne = byMembre[membreId];
    if (!ligne) return;
    grouperEnPlages(dates).forEach(pl => {
      const pos = barre(pl.debut, pl.fin);
      if (pos) ligne.ecole.push(Object.assign({ date_debut: pl.debut, date_fin: pl.fin }, pos));
    });
  });

  let lignes = Object.values(byMembre).filter(l => l.items.length || l.ecole.length);
  if (options.membre) lignes = lignes.filter(l => l.profile.id === options.membre);
  if (lignes.length === 0) return null;
  lignes.sort((a, b) => (a.profile.prenom + a.profile.nom).localeCompare(b.profile.prenom + b.profile.nom));

  // Répartition en sous-lignes : l'école occupe la lane 0, puis chaque projet
  // prend la première lane libre (pas de chevauchement au sein d'une lane).
  lignes.forEach(l => {
    const premiere = l.ecole.length ? 1 : 0;
    l.ecole.forEach(e => { e.lane = 0; });
    const lanesFin = []; // date de fin de la dernière barre de chaque lane projet
    l.items.sort((a, b) => a.projet.date_debut.localeCompare(b.projet.date_debut) || b.projet.date_fin.localeCompare(a.projet.date_fin));
    l.items.forEach(it => {
      let lane = 0;
      while (lanesFin[lane] && lanesFin[lane] >= it.projet.date_debut) lane++;
      lanesFin[lane] = it.projet.date_fin;
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

  // Repères hebdomadaires (un trait discret chaque lundi).
  const semaines = [];
  const wCursor = parseIsoLocal(min);
  while (wCursor <= parseIsoLocal(max)) {
    if (wCursor.getDay() === 1) semaines.push({ leftPct: pct(iso(wCursor)) });
    wCursor.setDate(wCursor.getDate() + 1);
  }

  // Semaine en cours : bande grisée discrète sur chaque ligne (sans libellé).
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

// Fenêtre d'affichage du Gantt : le mois demandé seul, ou par défaut 6 mois
// à partir du mois en cours — on n'en voit que ~2 à l'écran, le reste se
// découvre en faisant coulisser le Gantt à la souris.
function fenetreGantt(mois) {
  let y, m; // m : 1-12
  if (mois && /^\d{4}-\d{2}$/.test(mois)) {
    [y, m] = mois.split('-').map(Number);
    return { debut: `${y}-${String(m).padStart(2, '0')}-01`, fin: iso(new Date(y, m, 0)) };
  }
  const now = new Date();
  y = now.getFullYear(); m = now.getMonth() + 1;
  return { debut: `${y}-${String(m).padStart(2, '0')}-01`, fin: iso(new Date(y, m + 5, 0)) };
}

module.exports = { buildGanttProjets, fenetreGantt };
