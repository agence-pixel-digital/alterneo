const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { lienConnexionMainWP, estConnecteMainWP, domaineDepuis } = require('../lib/mainwp');
const K = require('../lib/clients');
const { ico, CATEGORIE_ICO } = require('../lib/icones');

// CRM clients. Lecture ouverte à tout utilisateur connecté (les alternants
// consultent) ; création / modification / suppression réservées à l'admin
// (double sécurité : requireAdmin côté route + RLS is_admin() côté base).
//
// Un client (numéro client) porte plusieurs abonnements / services : chaque
// ligne de client_abonnements correspond à une facturation (Stripe ou non).

const t = (v) => { const s = (v || '').trim(); return s || null; };

// Champs de la fiche client : chaîne vide -> null (pas de valeurs « » en base).
function lireClient(body) {
  let numero = t(body.numero);
  if (numero && /^\d{1,3}$/.test(numero)) numero = numero.padStart(3, '0');
  return {
    numero,
    societe: t(body.societe),
    client: t(body.client),
    telephone: t(body.telephone),
    email: t(body.email),
    siret: t(body.siret),
    adresse: t(body.adresse),
    type_structure: t(body.type_structure),
    stripe_customer_id: K.extraireIdStripe(body.stripe_customer_id, 'cus_'),
    note: t(body.note)
  };
}

function lireAbonnement(body) {
  const periodicite = (body.periodicite || '').trim();
  const prix = K.nombre(String(body.prix_unitaire || '').replace(/\s/g, '').replace(',', '.'));
  const quantite = K.nombre(body.quantite);
  return {
    produit: t(body.produit),
    description: t(body.description),
    categorie: K.CATEGORIES.includes(body.categorie) ? body.categorie : 'autre',
    domaine: t(body.domaine),
    type_site: t(body.type_site),
    hostinger: t(body.hostinger),
    prix_unitaire: prix,
    quantite: quantite === null ? null : Math.max(1, Math.round(quantite)),
    periodicite: K.PERIODICITES.includes(periodicite) ? periodicite : null,
    moyen_paiement: t(body.moyen_paiement),
    stripe_subscription_id: K.extraireIdStripe(body.stripe_subscription_id, 'sub_'),
    lien_connexion: t(body.lien_connexion),
    identifiant: t(body.identifiant),
    mot_de_passe: t(body.mot_de_passe)
  };
}

// Enrichit un abonnement pour l'affichage : domaines, montant, liens.
function preparerAbonnement(a) {
  a.domaines = K.domaines(a.domaine);
  a.liens = K.liensConnexion(a.lien_connexion).map(K.urlSure);
  a.montant = K.montant(a);
  a.lienStripe = K.lienStripeAbonnement(a.stripe_subscription_id);
  // Connexion en un clic (MainWP) : seulement pour les sites WordPress.
  const wp = /wordpress/i.test(a.type_site || '');
  const domaine = domaineDepuis(a.domaines[0]) || domaineDepuis(a.liens[0]);
  a.domaineMainWP = wp ? domaine : null;
  a.lienMainWP = a.domaineMainWP ? lienConnexionMainWP({ site_web: a.domaineMainWP }) : null;
  a.mainwpConnecte = null;
  return a;
}

function preparerClient(c) {
  c.abonnements = K.trierAbonnements(c.client_abonnements).map(preparerAbonnement);
  delete c.client_abonnements;
  c.totaux = K.totaux(c.abonnements);
  c.categories = K.categoriesDe(c.abonnements);
  c.lienStripe = K.lienStripeClient(c.stripe_customer_id);
  const sites = [];
  c.abonnements.forEach(a => a.domaines.forEach(d => { if (!sites.includes(d)) sites.push(d); }));
  c.sites = sites;
  // Premier site WordPress connectable : bouton « Connexion » de la liste.
  const wp = c.abonnements.find(a => a.lienMainWP);
  c.lienMainWP = wp ? wp.lienMainWP : null;
  return c;
}

function locaux(req, extra) {
  return Object.assign({
    isAdmin: req.profile.role === 'admin',
    K, ico, CATEGORIE_ICO
  }, extra);
}

const SELECT_CLIENT = '*, client_abonnements(*)';

// GET /clients : liste + recherche (admin et alternants).
router.get('/clients', async (req, res) => {
  const { data: clients } = await req.db
    .from('clients')
    .select(SELECT_CLIENT)
    .order('numero', { ascending: true, nullsFirst: false })
    .order('societe', { ascending: true, nullsFirst: false });
  const liste = (clients || []).map(preparerClient);
  const global = { clients: liste.length, abonnements: 0, mensuel: 0, annuel: 0, stripe: 0 };
  liste.forEach(c => {
    global.abonnements += c.abonnements.length;
    global.mensuel += c.totaux.mensuel;
    global.annuel += c.totaux.annuel;
    if (c.stripe_customer_id) global.stripe++;
  });
  res.render('clients', locaux(req, { clients: liste, global }));
});

// GET /clients/:id : fiche client (admin et alternants).
router.get('/clients/:id', async (req, res) => {
  const { data: client } = await req.db
    .from('clients')
    .select(SELECT_CLIENT)
    .eq('id', req.params.id).maybeSingle();
  if (!client) return res.redirect('/clients');
  preparerClient(client);
  // Vérifie une fois par domaine si MainWP gère le site (cache 10 min côté lib).
  const verifs = new Map();
  await Promise.all(client.abonnements.map(async (a) => {
    if (!a.domaineMainWP) return;
    if (!verifs.has(a.domaineMainWP)) verifs.set(a.domaineMainWP, estConnecteMainWP(a.domaineMainWP));
    a.mainwpConnecte = await verifs.get(a.domaineMainWP);
  }));
  const premierWP = client.abonnements.find(a => a.lienMainWP && a.mainwpConnecte !== false);
  client.lienMainWP = premierWP ? premierWP.lienMainWP : null;
  // NB : la variable passée à la vue ne doit PAS s'appeler `client` — EJS traite
  // une clé `client` des données comme son option de compilation « client mode »
  // (via _OPTS_PASSABLE_WITH_DATA), ce qui casse `include()` (« include is not a
  // function »). On la nomme donc `fiche`.
  res.render('client-fiche', locaux(req, { fiche: client }));
});

// Création d'un client.
router.post('/clients', requireAdmin, async (req, res) => {
  const champs = lireClient(req.body);
  if (!champs.societe && !champs.client) return res.redirect('/clients');
  const { data } = await req.db.from('clients').insert(champs).select('id').single();
  res.redirect(data ? '/clients/' + data.id : '/clients');
});

// Modification d'un client.
router.post('/clients/:id', requireAdmin, async (req, res) => {
  const champs = lireClient(req.body);
  if (!champs.societe && !champs.client) return res.redirect('/clients/' + req.params.id);
  await req.db.from('clients').update(champs).eq('id', req.params.id);
  res.redirect('/clients/' + req.params.id);
});

// Suppression (le cascade DB supprime les abonnements associés).
router.post('/clients/:id/supprimer', requireAdmin, async (req, res) => {
  await req.db.from('clients').delete().eq('id', req.params.id);
  res.redirect('/clients');
});

// Ajout d'un abonnement / service au client (plusieurs possibles, même produit inclus).
router.post('/clients/:id/abonnements', requireAdmin, async (req, res) => {
  const champs = lireAbonnement(req.body);
  if (!champs.produit && !champs.description && !champs.domaine) return res.redirect('/clients/' + req.params.id);
  const { data: dernier } = await req.db.from('client_abonnements').select('ordre')
    .eq('client_id', req.params.id).order('ordre', { ascending: false }).limit(1).maybeSingle();
  champs.client_id = req.params.id;
  champs.ordre = dernier ? dernier.ordre + 1 : 0;
  await req.db.from('client_abonnements').insert(champs);
  res.redirect('/clients/' + req.params.id);
});

// Modification d'un abonnement / service.
router.post('/clients/:id/abonnements/:aid', requireAdmin, async (req, res) => {
  const champs = lireAbonnement(req.body);
  await req.db.from('client_abonnements').update(champs).eq('id', req.params.aid).eq('client_id', req.params.id);
  res.redirect('/clients/' + req.params.id);
});

// Suppression d'un abonnement / service.
router.post('/clients/:id/abonnements/:aid/supprimer', requireAdmin, async (req, res) => {
  await req.db.from('client_abonnements').delete().eq('id', req.params.aid).eq('client_id', req.params.id);
  res.redirect('/clients/' + req.params.id);
});

module.exports = router;

// Exposés pour les tests de rendu (pas utilisés par le serveur).
module.exports.preparerClient = preparerClient;
