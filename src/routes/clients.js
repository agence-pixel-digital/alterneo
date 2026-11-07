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
// Un client porte plusieurs abonnements (client_souscriptions : ID Stripe, prix,
// quantité, périodicité, moyen de paiement) ; chaque abonnement regroupe un ou
// plusieurs produits / services (client_abonnements : produit, domaine, accès).

const t = (v) => { const s = (v || '').trim(); return s || null; };

// Champs de la fiche client : chaîne vide -> null (pas de valeurs « » en base).
// Le numéro client (import Stripe) n'est plus saisi ni affiché : il reste en base
// comme simple trace de l'import, les abonnements étant rattachés par client_id.
function lireClient(body) {
  return {
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

// Abonnement (client_souscriptions) : prix, quantité, périodicité, paiement, ID Stripe.
function lireSouscription(body) {
  const periodicite = (body.periodicite || '').trim();
  const prix = K.nombre(String(body.prix_unitaire || '').replace(/\s/g, '').replace(',', '.'));
  const quantite = K.nombre(body.quantite);
  return {
    prix_unitaire: prix,
    quantite: quantite === null ? null : Math.max(1, Math.round(quantite)),
    periodicite: K.PERIODICITES.includes(periodicite) ? periodicite : null,
    moyen_paiement: t(body.moyen_paiement),
    stripe_subscription_id: K.extraireIdStripe(body.stripe_subscription_id, 'sub_')
  };
}

// Produit / service (client_abonnements) rattaché à un abonnement.
function lireProduit(body) {
  return {
    produit: t(body.produit),
    description: t(body.description),
    categorie: K.CATEGORIES.includes(body.categorie) ? body.categorie : 'autre',
    domaine: t(body.domaine),
    type_site: t(body.type_site),
    hostinger: t(body.hostinger),
    lien_connexion: t(body.lien_connexion),
    identifiant: t(body.identifiant),
    mot_de_passe: t(body.mot_de_passe)
  };
}

// Enrichit un produit pour l'affichage : domaines, liens, connexion MainWP.
function preparerProduit(a) {
  a.domaines = K.domaines(a.domaine);
  a.liens = K.liensConnexion(a.lien_connexion).map(K.urlSure);
  // Connexion en un clic (MainWP) : seulement pour les sites WordPress.
  const wp = /wordpress/i.test(a.type_site || '');
  const domaine = domaineDepuis(a.domaines[0]) || domaineDepuis(a.liens[0]);
  a.domaineMainWP = wp ? domaine : null;
  a.lienMainWP = a.domaineMainWP ? lienConnexionMainWP({ site_web: a.domaineMainWP }) : null;
  a.mainwpConnecte = null;
  return a;
}

// Enrichit un abonnement : produits triés, montant annualisé, lien Stripe.
function preparerSouscription(s) {
  s.produits = K.trierAbonnements(s.client_abonnements).map(preparerProduit);
  delete s.client_abonnements;
  s.montant = K.montant(s);
  s.montantAnnuel = K.montantAnnuel(s);
  s.lienStripe = K.lienStripeAbonnement(s.stripe_subscription_id);
  s.planification = /^sub_sched_/.test(s.stripe_subscription_id || '');
  s.categories = K.categoriesDe(s.produits);
  return s;
}

function preparerClient(c) {
  c.souscriptions = K.trierAbonnements(c.client_souscriptions).map(preparerSouscription);
  delete c.client_souscriptions;
  // Tous les produits / services à plat (recherche, catégories, sites).
  c.produits = [];
  c.souscriptions.forEach(s => s.produits.forEach(a => c.produits.push(a)));
  c.totaux = K.totaux(c.souscriptions);
  c.categories = K.categoriesDe(c.produits);
  c.lienStripe = K.lienStripeClient(c.stripe_customer_id);
  const sites = [];
  c.produits.forEach(a => a.domaines.forEach(d => { if (!sites.includes(d)) sites.push(d); }));
  c.sites = sites;
  // Premier site WordPress connectable : bouton « Connexion » de la liste.
  const wp = c.produits.find(a => a.lienMainWP);
  c.lienMainWP = wp ? wp.lienMainWP : null;
  return c;
}

function locaux(req, extra) {
  return Object.assign({
    isAdmin: req.profile.role === 'admin',
    K, ico, CATEGORIE_ICO
  }, extra);
}

const SELECT_CLIENT = '*, client_souscriptions(*, client_abonnements(*))';

// GET /clients : liste + recherche (admin et alternants).
router.get('/clients', async (req, res) => {
  const { data: clients } = await req.db
    .from('clients')
    .select(SELECT_CLIENT)
    .order('societe', { ascending: true, nullsFirst: false })
    .order('client', { ascending: true, nullsFirst: false });
  const liste = (clients || []).map(preparerClient);
  const global = { clients: liste.length, abonnements: 0, produits: 0, mensuel: 0, annuel: 0, stripe: 0 };
  liste.forEach(c => {
    global.abonnements += c.souscriptions.length;
    global.produits += c.produits.length;
    global.mensuel += c.totaux.mensuel;
    global.annuel += c.totaux.annuel;
    if (c.stripe_customer_id) global.stripe++;
  });
  global.caAnnuel = global.mensuel * 12 + global.annuel;
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
  await Promise.all(client.produits.map(async (a) => {
    if (!a.domaineMainWP) return;
    if (!verifs.has(a.domaineMainWP)) verifs.set(a.domaineMainWP, estConnecteMainWP(a.domaineMainWP));
    a.mainwpConnecte = await verifs.get(a.domaineMainWP);
  }));
  const premierWP = client.produits.find(a => a.lienMainWP && a.mainwpConnecte !== false);
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

// Vérifie que l'abonnement appartient bien au client de l'URL.
async function souscriptionDuClient(req) {
  const { data } = await req.db.from('client_souscriptions').select('id')
    .eq('id', req.params.sid).eq('client_id', req.params.id).maybeSingle();
  return data ? data.id : null;
}

// Ajout d'un abonnement au client, avec son premier produit / service.
router.post('/clients/:id/abonnements', requireAdmin, async (req, res) => {
  const souscription = lireSouscription(req.body);
  const produit = lireProduit(req.body);
  if (!produit.produit && !produit.description && !produit.domaine) return res.redirect('/clients/' + req.params.id);
  const { data: dernier } = await req.db.from('client_souscriptions').select('ordre')
    .eq('client_id', req.params.id).order('ordre', { ascending: false }).limit(1).maybeSingle();
  souscription.client_id = req.params.id;
  souscription.ordre = dernier ? dernier.ordre + 1 : 0;
  const { data: cree } = await req.db.from('client_souscriptions').insert(souscription).select('id').single();
  if (cree) {
    produit.client_id = req.params.id;
    produit.souscription_id = cree.id;
    produit.ordre = 0;
    await req.db.from('client_abonnements').insert(produit);
  }
  res.redirect('/clients/' + req.params.id);
});

// Modification d'un abonnement (prix, quantité, périodicité, paiement, ID Stripe).
router.post('/clients/:id/abonnements/:sid', requireAdmin, async (req, res) => {
  await req.db.from('client_souscriptions').update(lireSouscription(req.body))
    .eq('id', req.params.sid).eq('client_id', req.params.id);
  res.redirect('/clients/' + req.params.id);
});

// Suppression d'un abonnement (le cascade DB supprime ses produits / services).
router.post('/clients/:id/abonnements/:sid/supprimer', requireAdmin, async (req, res) => {
  await req.db.from('client_souscriptions').delete().eq('id', req.params.sid).eq('client_id', req.params.id);
  res.redirect('/clients/' + req.params.id);
});

// Ajout d'un produit / service à un abonnement existant.
router.post('/clients/:id/abonnements/:sid/produits', requireAdmin, async (req, res) => {
  const produit = lireProduit(req.body);
  const sid = await souscriptionDuClient(req);
  if (sid && (produit.produit || produit.description || produit.domaine)) {
    const { data: dernier } = await req.db.from('client_abonnements').select('ordre')
      .eq('souscription_id', sid).order('ordre', { ascending: false }).limit(1).maybeSingle();
    produit.client_id = req.params.id;
    produit.souscription_id = sid;
    produit.ordre = dernier ? dernier.ordre + 1 : 0;
    await req.db.from('client_abonnements').insert(produit);
  }
  res.redirect('/clients/' + req.params.id);
});

// Modification d'un produit / service.
router.post('/clients/:id/abonnements/:sid/produits/:pid', requireAdmin, async (req, res) => {
  await req.db.from('client_abonnements').update(lireProduit(req.body))
    .eq('id', req.params.pid).eq('souscription_id', req.params.sid).eq('client_id', req.params.id);
  res.redirect('/clients/' + req.params.id);
});

// Suppression d'un produit / service ; un abonnement vidé est supprimé avec lui.
router.post('/clients/:id/abonnements/:sid/produits/:pid/supprimer', requireAdmin, async (req, res) => {
  await req.db.from('client_abonnements').delete()
    .eq('id', req.params.pid).eq('souscription_id', req.params.sid).eq('client_id', req.params.id);
  const { count } = await req.db.from('client_abonnements').select('id', { count: 'exact', head: true })
    .eq('souscription_id', req.params.sid);
  if (count === 0) {
    await req.db.from('client_souscriptions').delete().eq('id', req.params.sid).eq('client_id', req.params.id);
  }
  res.redirect('/clients/' + req.params.id);
});

module.exports = router;

// Exposés pour les tests de rendu (pas utilisés par le serveur).
module.exports.preparerClient = preparerClient;
