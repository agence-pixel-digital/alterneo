const { HEURES_PAR_JOUR } = require('./constants');

const MOTIF_RECUPERATION = 'Récupération (jour de repos)';

// Chaque jour de récupération pris (via une demande de congé validée ou un
// ajout manuel sur le planning) doit décompter des heures supplémentaires
// réellement acquises, sinon le compteur d'heures supp. n'a plus de sens.
async function deduireRecuperation(db, alternantId, dates) {
  if (!dates || dates.length === 0) return;
  const rows = dates.map(date => ({
    alternant_id: alternantId, date, heures: -HEURES_PAR_JOUR, motif: MOTIF_RECUPERATION
  }));
  await db.from('heures_supplementaires').insert(rows);
}

// Annule les décomptes automatiques correspondants lorsqu'un congé de type
// récupération est supprimé après avoir été validé.
async function annulerDeductionRecuperation(db, alternantId, dates) {
  if (!dates || dates.length === 0) return;
  await db.from('heures_supplementaires').delete()
    .eq('alternant_id', alternantId).eq('motif', MOTIF_RECUPERATION).in('date', dates);
}

module.exports = { deduireRecuperation, annulerDeductionRecuperation, MOTIF_RECUPERATION };
