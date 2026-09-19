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

  // Compteur de tickets ouverts pour la pastille de navigation. La RLS filtre
  // selon le rôle : l'admin voit tous les tickets ouverts, l'alternant seulement
  // ceux qui lui sont assignés. Sans incidence sur le parcours en cas d'erreur.
  try {
    const { count } = await req.db
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'ouvert');
    res.locals.navTicketsOuverts = count || 0;
  } catch (e) {
    res.locals.navTicketsOuverts = 0;
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.profile.role !== 'admin') {
    return res.status(403).send("Accès réservé à l'administrateur.");
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
