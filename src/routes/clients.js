const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { enrichirMainWP } = require('../lib/mainwp');

// CRM clients. Lecture ouverte à tout utilisateur connecté (les alternants
// consultent) ; création / modification / suppression réservées à l'admin
// (double sécurité : requireAdmin côté route + RLS is_admin() côté base).

const FORFAITS = ['hebergement', 'nom_de_domaine', 'maintenance_classique', 'maintenance_premium', 'autre'];
const FORFAIT_LABEL = {
  hebergement: 'Hébergement',
  nom_de_domaine: 'Nom de domaine',
  maintenance_classique: 'Maintenance Classique',
  maintenance_premium: 'Maintenance Prémium',
  autre: 'Autre'
};
const FORFAIT_RANG = { hebergement: 0, nom_de_domaine: 1, maintenance_classique: 2, maintenance_premium: 3, autre: 4 };

// Champs texte de la fiche : chaîne vide -> null (pas de valeurs « » en base).
function lireChamps(body) {
  const t = (v) => { const s = (v || '').trim(); return s || null; };
  return {
    societe: t(body.societe),
    client: t(body.client),
    site_web: t(body.site_web),
    telephone: t(body.telephone),
    email: t(body.email),
    siret: t(body.siret),
    adresse: t(body.adresse),
    note: t(body.note),
    lien_connexion: t(body.lien_connexion)
  };
}

function trierForfaits(liste) {
  return (liste || []).slice().sort((a, b) =>
    (FORFAIT_RANG[a.type] - FORFAIT_RANG[b.type]) || (a.libelle || '').localeCompare(b.libelle || ''));
}

// GET /clients : liste + recherche (admin et alternants).
router.get('/clients', async (req, res) => {
  const { data: clients } = await req.db
    .from('clients')
    .select('*, client_forfaits(id, type, libelle)')
    .order('societe', { ascending: true, nullsFirst: false });
  const liste = await Promise.all((clients || []).map(c =>
    enrichirMainWP(Object.assign({}, c, { forfaits: trierForfaits(c.client_forfaits) }))));
  res.render('clients', {
    clients: liste,
    isAdmin: req.profile.role === 'admin',
    FORFAITS, FORFAIT_LABEL
  });
});

// GET /clients/:id : fiche client (admin et alternants).
router.get('/clients/:id', async (req, res) => {
  const { data: client } = await req.db
    .from('clients')
    .select('*, client_forfaits(id, type, libelle, created_at)')
    .eq('id', req.params.id).maybeSingle();
  if (!client) return res.redirect('/clients');
  client.forfaits = trierForfaits(client.client_forfaits);
  await enrichirMainWP(client);
  // NB : la variable passée à la vue ne doit PAS s'appeler `client` — EJS traite
  // une clé `client` des données comme son option de compilation « client mode »
  // (via _OPTS_PASSABLE_WITH_DATA), ce qui casse `include()` (« include is not a
  // function »). On la nomme donc `fiche`.
  res.render('client-fiche', {
    fiche: client,
    isAdmin: req.profile.role === 'admin',
    FORFAITS, FORFAIT_LABEL
  });
});

// Création d'un client.
router.post('/clients', requireAdmin, async (req, res) => {
  const champs = lireChamps(req.body);
  if (!champs.societe && !champs.client) return res.redirect('/clients');
  const { data } = await req.db.from('clients').insert(champs).select('id').single();
  res.redirect(data ? '/clients/' + data.id : '/clients');
});

// Modification d'un client.
router.post('/clients/:id', requireAdmin, async (req, res) => {
  const champs = lireChamps(req.body);
  if (!champs.societe && !champs.client) return res.redirect('/clients/' + req.params.id);
  await req.db.from('clients').update(champs).eq('id', req.params.id);
  res.redirect('/clients/' + req.params.id);
});

// Suppression (le cascade DB supprime les forfaits associés).
router.post('/clients/:id/supprimer', requireAdmin, async (req, res) => {
  await req.db.from('clients').delete().eq('id', req.params.id);
  res.redirect('/clients');
});

// Ajout d'un forfait / service au client (plusieurs possibles, même type inclus).
router.post('/clients/:id/forfaits', requireAdmin, async (req, res) => {
  const type = FORFAITS.includes(req.body.type) ? req.body.type : null;
  const libelle = (req.body.libelle || '').trim() || null;
  if (type) await req.db.from('client_forfaits').insert({ client_id: req.params.id, type, libelle });
  res.redirect('/clients/' + req.params.id);
});

// Suppression d'un forfait / service.
router.post('/clients/:id/forfaits/:fid/supprimer', requireAdmin, async (req, res) => {
  await req.db.from('client_forfaits').delete().eq('id', req.params.fid).eq('client_id', req.params.id);
  res.redirect('/clients/' + req.params.id);
});

module.exports = router;
