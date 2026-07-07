// Jours fériés légaux français : dates fixes + dates mobiles calculées à
// partir du dimanche de Pâques (algorithme de Gauss/Meeus, calendrier grégorien).

// Sérialise un Date en 'YYYY-MM-DD' à partir de ses composantes LOCALES.
// Ne jamais utiliser toISOString() ici : ça repasse par UTC et décale la
// date d'un jour quand le fuseau serveur est en avance sur UTC (ex. Europe/Paris en été).
function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function datePaques(annee) {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
}

function joursFeriesAnnee(annee) {
  const paques = datePaques(annee);
  const lundiPaques = new Date(paques); lundiPaques.setDate(paques.getDate() + 1);
  const ascension = new Date(paques); ascension.setDate(paques.getDate() + 39);
  const lundiPentecote = new Date(paques); lundiPentecote.setDate(paques.getDate() + 50);

  return [
    `${annee}-01-01`,
    iso(lundiPaques),
    `${annee}-05-01`,
    `${annee}-05-08`,
    iso(ascension),
    iso(lundiPentecote),
    `${annee}-07-14`,
    `${annee}-08-15`,
    `${annee}-11-01`,
    `${annee}-11-11`,
    `${annee}-12-25`
  ];
}

const cache = {};
function joursFeriesSet(annee) {
  if (!cache[annee]) cache[annee] = new Set(joursFeriesAnnee(annee));
  return cache[annee];
}

function estFerie(dateIso) {
  if (!dateIso) return false;
  const str = String(dateIso).slice(0, 10);
  const annee = Number(str.slice(0, 4));
  return joursFeriesSet(annee).has(str);
}

module.exports = { estFerie, joursFeriesAnnee };
