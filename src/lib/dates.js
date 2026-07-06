const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function iso(d) {
  return d.toISOString().slice(0, 10);
}

// Les 10 prochains jours ouvrés (hors week-ends), à partir d'aujourd'hui.
function next10JoursOuvres(start = new Date()) {
  const jours = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (jours.length < 10) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) {
      jours.push({ iso: iso(d), dow: DAYS_FR[(wd + 6) % 7], num: d.getDate() });
    }
    d.setDate(d.getDate() + 1);
  }
  return jours;
}

// Jours ouvrés (hors week-ends) entre deux dates ISO incluses.
function joursOuvresEntre(debutIso, finIso) {
  const jours = [];
  const start = new Date(debutIso), end = new Date(finIso);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) jours.push(iso(d));
  }
  return jours;
}

// 'YYYY-MM-DD' -> 'DD/MM/AAAA' (utilisé partout où une date est affichée).
function formatFr(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = String(isoDate).slice(0, 10).split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

// 'YYYY-MM' -> 'Juillet 2026' (utilisé pour l'affichage des périodes de paie).
function formatPeriodeFr(periode) {
  if (!periode || !/^\d{4}-\d{2}$/.test(periode)) return '—';
  const [y, m] = periode.split('-').map(Number);
  return MONTHS_FR[m - 1] + ' ' + y;
}

module.exports = { next10JoursOuvres, joursOuvresEntre, formatFr, formatPeriodeFr };
