const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { genererRecaps, genererHtmlEmail } = require('../lib/envoiComptable');
const { envoyerMail } = require('../lib/mailer');

// L'envoi comptable est désormais déclenché depuis une popup de l'onglet
// « Fiches de paie » ; l'ancienne page autonome redirige vers /paie.
router.get('/envoi-comptable', requireAdmin, (req, res) => res.redirect('/paie'));

router.post('/envoi-comptable/generer', requireAdmin, async (req, res) => {
  const { mois, societe_id } = req.body;

  if (!mois || !/^\d{4}-\d{2}$/.test(mois)) {
    return res.redirect('/paie?envoiErreur=' + encodeURIComponent('Veuillez sélectionner un mois valide.'));
  }

  const recaps = await genererRecaps(req.db, mois, societe_id || null);
  if (recaps.length === 0) {
    return res.redirect('/paie?envoiErreur=' + encodeURIComponent("Aucune société avec des alternants rattachés pour ce mois-là."));
  }

  const emails = recaps.map(recap => {
    const { subject, html } = genererHtmlEmail(recap);
    return { societeId: recap.societe.id, societeNom: recap.societe.nom, to: recap.societe.email_comptable || '', mois, subject, html };
  });

  res.render('envoi-comptable-preview', { emails, mois, error: null });
});

router.post('/envoi-comptable/envoyer', requireAdmin, async (req, res) => {
  const { to, subject, html } = req.body;
  if (to && subject && html) await envoyerMail({ to, subject, html });
  res.redirect('/paie?envoi=1');
});

module.exports = router;
