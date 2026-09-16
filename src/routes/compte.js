const express = require('express');
const router = express.Router();
const { supabaseAnon, supabaseAdmin } = require('../supabaseClient');

router.get('/mon-compte', (req, res) => {
  res.render('mon-compte', { error: null, success: null });
});

router.post('/mon-compte/mot-de-passe', async (req, res) => {
  const { mot_de_passe_actuel, nouveau_mot_de_passe, confirmation } = req.body;

  if (!nouveau_mot_de_passe || nouveau_mot_de_passe.length < 8) {
    return res.render('mon-compte', { error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.', success: null });
  }
  if (nouveau_mot_de_passe !== confirmation) {
    return res.render('mon-compte', { error: 'La confirmation ne correspond pas au nouveau mot de passe.', success: null });
  }

  // On vérifie le mot de passe actuel en tentant une connexion avec, avant
  // d'autoriser le changement (évite qu'une session laissée ouverte permette
  // à quelqu'un d'autre de changer le mot de passe sans le connaître).
  const { error: verifErr } = await supabaseAnon.auth.signInWithPassword({
    email: req.profile.email, password: mot_de_passe_actuel
  });
  if (verifErr) {
    return res.render('mon-compte', { error: 'Mot de passe actuel incorrect.', success: null });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(req.profile.id, { password: nouveau_mot_de_passe });
  if (error) {
    return res.render('mon-compte', { error: error.message, success: null });
  }
  res.render('mon-compte', { error: null, success: 'Mot de passe mis à jour avec succès.' });
});

module.exports = router;
