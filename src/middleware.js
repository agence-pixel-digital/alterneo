const { supabaseForUser } = require('./supabaseClient');

// Vérifie que l'utilisateur est connecté, attache un client Supabase
// "à son nom" (req.db) et son profil (req.profile) à la requête.
async function requireAuth(req, res, next) {
  if (!req.session.access_token) {
    return res.redirect('/login');
  }
  req.db = supabaseForUser(req.session.access_token);
  const { data: profile, error } = await req.db
    .from('profiles')
    .select('*')
    .eq('id', req.session.user_id)
    .single();

  if (error || !profile) {
    req.session.destroy(() => {});
    return res.redirect('/login');
  }
  req.profile = profile;
  res.locals.profile = profile; // disponible directement dans les vues EJS
  next();
}

function requireAdmin(req, res, next) {
  if (req.profile.role !== 'admin') {
    return res.status(403).send("Accès réservé à l'administrateur.");
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
