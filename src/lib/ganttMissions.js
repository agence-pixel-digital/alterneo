const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

function jours(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// Construit les données d'un Gantt (une ligne par alternant, des barres
// positionnées en % sur une frise temporelle commune) à partir d'une liste
// de missions déjà filtrée (par alternant et/ou par mois).
function buildGanttData(missions, fallbackProfile) {
  if (!missions || missions.length === 0) return null;

  let min = missions[0].date_debut, max = missions[0].date_fin;
  missions.forEach(m => {
    if (m.date_debut < min) min = m.date_debut;
    if (m.date_fin > max) max = m.date_fin;
  });

  const minD = new Date(min); minD.setDate(minD.getDate() - 2);
  const maxD = new Date(max); maxD.setDate(maxD.getDate() + 2);
  min = minD.toISOString().slice(0, 10);
  max = maxD.toISOString().slice(0, 10);
  const totalDays = jours(min, max) + 1;

  const byAlternant = {};
  missions.forEach(m => {
    const profile = m.profiles || fallbackProfile;
    if (!byAlternant[m.alternant_id]) byAlternant[m.alternant_id] = { profile, items: [] };
    const offset = jours(min, m.date_debut);
    const duree = jours(m.date_debut, m.date_fin) + 1;
    byAlternant[m.alternant_id].items.push({
      id: m.id, alternantId: m.alternant_id, titre: m.titre, description: m.description,
      date_debut: m.date_debut, date_fin: m.date_fin,
      leftPct: Math.max(0, (offset / totalDays) * 100),
      widthPct: Math.max(2, (duree / totalDays) * 100)
    });
  });

  const markers = [];
  const cursor = new Date(min);
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() + 1);
  while (cursor <= new Date(max)) {
    const offset = jours(min, cursor.toISOString().slice(0, 10));
    markers.push({ label: MONTHS_FR[cursor.getMonth()] + ' ' + cursor.getFullYear(), leftPct: (offset / totalDays) * 100 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Repères hebdomadaires (un trait discret chaque lundi) pour bien distinguer les semaines.
  const semaines = [];
  const wCursor = new Date(min);
  while (wCursor <= new Date(max)) {
    if (wCursor.getDay() === 1) {
      const offset = jours(min, wCursor.toISOString().slice(0, 10));
      semaines.push({ leftPct: (offset / totalDays) * 100 });
    }
    wCursor.setDate(wCursor.getDate() + 1);
  }

  return { lignes: Object.values(byAlternant), markers, semaines };
}

module.exports = { buildGanttData };
