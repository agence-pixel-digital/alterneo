const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// Construit une grille de calendrier mensuel (semaines de 7 cases) à partir
// des lignes de planning déjà chargées, pour un affichage en lecture seule.
function buildMonthGrid(rows, profile, moisParam) {
  const today = new Date();
  const [y, m] = (moisParam || today.toISOString().slice(0, 7)).split('-').map(Number);

  const byDate = {};
  (rows || []).forEach(r => { byDate[r.date] = r.type; });

  const lastDay = new Date(y, m, 0).getDate();
  const first = new Date(y, m - 1, 1);
  const startDow = (first.getDay() + 6) % 7; // Lundi = 0
  const todayKey = today.toISOString().slice(0, 10);

  const weeks = [];
  let week = new Array(startDow).fill(null);
  for (let d = 1; d <= lastDay; d++) {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const inContract = (!profile.date_debut || key >= profile.date_debut) && (!profile.date_fin || key <= profile.date_fin);
    week.push({ day: d, type: byDate[key] || null, inContract, today: key === todayKey });
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) { while (week.length < 7) week.push(null); weeks.push(week); }

  const prevM = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const nextM = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };

  return {
    weeks,
    monthLabel: MONTHS_FR[m - 1] + ' ' + y,
    prevMois: `${prevM.y}-${String(prevM.m).padStart(2, '0')}`,
    nextMois: `${nextM.y}-${String(nextM.m).padStart(2, '0')}`
  };
}

// Construit une grille "tous les alternants x jours du mois" en une seule
// vue, pour l'onglet Planning de l'admin.
function buildGlobalMonthGrid(alternants, rows, moisParam) {
  const [y, m] = (moisParam || new Date().toISOString().slice(0, 7)).split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();

  const byAlternant = {};
  (rows || []).forEach(r => {
    if (!byAlternant[r.alternant_id]) byAlternant[r.alternant_id] = {};
    byAlternant[r.alternant_id][r.date] = r.type;
  });

  const jours = [];
  for (let d = 1; d <= lastDay; d++) {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const wd = new Date(y, m - 1, d).getDay();
    jours.push({ day: d, isWeekend: wd === 0 || wd === 6, key });
  }

  const lignes = alternants.map(a => ({
    alternant: a,
    cellules: jours.map(j => ({ day: j.day, isWeekend: j.isWeekend, type: (byAlternant[a.id] || {})[j.key] || null }))
  }));

  const prevM = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const nextM = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };

  return {
    jours, lignes,
    monthLabel: MONTHS_FR[m - 1] + ' ' + y,
    prevMois: `${prevM.y}-${String(prevM.m).padStart(2, '0')}`,
    nextMois: `${nextM.y}-${String(nextM.m).padStart(2, '0')}`
  };
}

module.exports = { buildMonthGrid, buildGlobalMonthGrid };
