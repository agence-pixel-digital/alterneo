const { createClient } = require('@supabase/supabase-js');

// Client "admin" : accès complet, réservé au serveur, jamais exposé au navigateur.
// Utilisé pour créer des comptes alternants et pour toute opération qui doit
// contourner les règles de sécurité (RLS) côté admin.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Client "anonyme" : utilisé uniquement pour la connexion (login) des utilisateurs.
const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Client "au nom de l'utilisateur connecté" : respecte les règles RLS
// (un alternant ne peut voir que ses propres données, un admin voit tout).
function supabaseForUser(accessToken) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

module.exports = { supabaseAdmin, supabaseAnon, supabaseForUser };
