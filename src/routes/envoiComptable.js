const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { genererRecaps, genererHtmlEmail } = require('../lib/envoiComptable');
const { envoyerMail } = require('../lib/mailer');

router.get('/envoi-comptable', requireAdmin, async (req, res) => {
  const { data: societes } = await req.db.from('societes').select('*').order('nom');
  res.render('envoi-comptable', {
    societes: societes || [], mois: req.query.mois || '', societeId: req.query.societe || '',
    envoye: req.query.envoye === '1', error: null
  });
});

router.post('/envoi-comptable/generer', requireAdmin, async (req, res) => {
  const { mois, societe_id } = req.body;
  const { data: societes } = await req.db.from('societes').select('*').order('nom');

  if (!mois || !/^\d{4}-\d{2}$/.test(mois)) {
    return res.render('envoi-comptable', {
      societes: societes || [], mois: '', societeId: societe_id || '', envoye: false,
      error: 'Veuillez sélectionner un mois valide.'
    });
  }

  const recaps = await genererRecaps(req.db, mois, societe_id || null);
  if (recaps.length === 0) {
    return res.render('envoi-comptable', {
      societes: societes || [], mois, societeId: societe_id || '', envoye: false,
      error: "Aucune société avec des alternants rattachés pour ce mois-là."
    });
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
  res.redirect('/envoi-comptable?envoye=1');
});

module.exports = router;
