const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware');

router.get('/parametres', requireAdmin, async (req, res) => {
  const { data: societes } = await req.db.from('societes').select('*').order('nom');
  res.render('parametres', { societes: societes || [], error: null });
});

router.post('/parametres/societes', requireAdmin, async (req, res) => {
  const { nom, email_comptable } = req.body;
  if (nom && nom.trim()) {
    await req.db.from('societes').insert({ nom: nom.trim(), email_comptable: email_comptable || null });
  }
  res.redirect('/parametres');
});

router.post('/parametres/societes/:id', requireAdmin, async (req, res) => {
  const { nom, email_comptable } = req.body;
  await req.db.from('societes').update({ nom: nom.trim(), email_comptable: email_comptable || null }).eq('id', req.params.id);
  res.redirect('/parametres');
});

router.post('/parametres/societes/:id/supprimer', requireAdmin, async (req, res) => {
  await req.db.from('societes').delete().eq('id', req.params.id);
  res.redirect('/parametres');
});

module.exports = router;
