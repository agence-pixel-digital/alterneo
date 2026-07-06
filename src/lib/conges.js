// 25 jours de congés payés par an (25/12 j par mois de contrat), disponibles
// en totalité dès le début du contrat (pas d'acquisition progressive).
// Ex. contrat de 12 mois -> 25/12 x 12 = 25 jours disponibles immédiatement.
function calculerAcquis(dateDebut, dateFin) {
  if (!dateDebut || !dateFin) return 0;
  const start = new Date(dateDebut), end = new Date(dateFin);
  if (end < start) return 0;

  let mois = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() >= start.getDate()) mois++; // le mois en cours compte s'il est atteint ou dépassé
  mois = Math.max(0, mois);

  return Math.round(mois * (25 / 12) * 10) / 10;
}

module.exports = { calculerAcquis };
