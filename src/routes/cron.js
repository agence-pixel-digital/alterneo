const express = require('express');
const router = express.Router();
const { envoyerRappelsAbsencesEcole } = require('../lib/notifications');

// Endpoints déclenchés par une tâche planifiée externe (cron Hostinger).
// Protégés par un secret partagé (CRON_SECRET) plutôt que par une session :
// à appeler par ex. le 23 de chaque mois.
//   curl -s -H "x-cron-secret: <CRON_SECRET>" https://alterneo.pixel-digital.fr/cron/rappel-absences-ecole
function verifieSecret(req, res, next) {
  const secret = req.get('x-cron-secret') || req.query.secret;
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(403).json({ ok: false });
  }
  next();
}

router.all('/cron/rappel-absences-ecole', verifieSecret, async (req, res) => {
  try {
    const envoyes = await envoyerRappelsAbsencesEcole();
    res.json({ ok: true, envoyes });
  } catch (e) {
    console.error('Erreur rappel absences école :', e.message);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
