const express = require('express');
const router = express.Router();
const { supabaseAnon, supabaseForUser } = require('../supabaseClient');

router.get('/login', (req, res) => {
  res.render('login', { error: null, success: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    return res.render('login', { error: 'Identifiants incorrects.', success: null });
  }

  req.session.access_token = data.session.access_token;
  req.session.user_id = data.user.id;
  res.redirect('/dashboard');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

router.get('/mot-de-passe-oublie', (req, res) => {
  res.render('forgot-password', { sent: false, error: null });
});

router.post('/mot-de-passe-oublie', async (req, res) => {
  const { email } = req.body;
  if (email) {
    const { error } = await supabaseAnon.auth.resetPasswordForEmail(email, {
      redirectTo: (process.env.BASE_URL || 'http://localhost:3000') + '/reinitialiser-mot-de-passe'
    });
    if (error) console.error('Erreur envoi e-mail de réinitialisation :', error.message);
  }
  // Message générique dans tous les cas, pour ne pas révéler si l'e-mail existe.
  res.render('forgot-password', { sent: true, error: null });
});

router.get('/reinitialiser-mot-de-passe', (req, res) => {
  res.render('reset-password', { error: null });
});

router.post('/reinitialiser-mot-de-passe', async (req, res) => {
  const { access_token, password } = req.body;
  if (!access_token) {
    return res.render('reset-password', { error: 'Lien invalide ou expiré. Redemandez un lien.' });
  }
  if (!password || password.length < 8) {
    return res.render('reset-password', { error: 'Le mot de passe doit contenir au moins 8 caractères.' });
  }
  const { error } = await supabaseForUser(access_token).auth.updateUser({ password });
  if (error) {
    return res.render('reset-password', { error: error.message });
  }
  res.render('login', { error: null, success: 'Mot de passe mis à jour. Vous pouvez vous connecter.' });
});

module.exports = router;
