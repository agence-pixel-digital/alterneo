// 25 jours de congés payés par an (25/12 j par mois de contrat), disponibles
// en totalité dès le début du contrat (pas d'acquisition progressive).
// Ex. contrat de 12 mois -> 25/12 x 12 = 25 jours disponibles immédiatement.
// Le dernier mois incomplet est proratisé au jour près plutôt que compté
// comme un mois entier. Ex. 16/09/2026 -> 24/09/2027 = 12 mois pleins (25 j)
// + 9/30 de mois pour la fraction 16 -> 24/09 -> ~25,6 j (et non 27,1 j).
function calculerAcquis(dateDebut, dateFin) {
  if (!dateDebut || !dateFin) return 0;
  const start = new Date(dateDebut), end = new Date(dateFin);
  if (end < start) return 0;

  let mois = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() >= start.getDate()) {
    // Fraction du dernier mois entamé, proratisée sur sa durée réelle.
    const joursDansMois = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    mois += (end.getDate() - start.getDate() + 1) / joursDansMois;
  }
  mois = Math.max(0, mois);

  return Math.round(mois * (25 / 12) * 10) / 10;
}

module.exports = { calculerAcquis };
