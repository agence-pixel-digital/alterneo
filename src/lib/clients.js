// Référentiel et calculs du CRM clients : catégories d'abonnement, liens Stripe,
// montants et totaux. Partagé entre les routes et les vues (via les locals).

const CATEGORIES = ['hebergement_domaine', 'hebergement', 'domaine', 'maintenance_classique', 'maintenance_premium', 'site_web', 'google_ads', 'mail', 'autre'];
const CATEGORIE_LABEL = {
  hebergement_domaine: 'Hébergement & Domaine',
  hebergement: 'Hébergement',
  domaine: 'Nom de domaine',
  maintenance_classique: 'Maintenance Classique',
  maintenance_premium: 'Maintenance Prémium',
  site_web: 'Site web',
  google_ads: 'Google Ads',
  mail: 'E-mails',
  autre: 'Autre'
};
const CATEGORIE_RANG = {};
CATEGORIES.forEach((c, i) => { CATEGORIE_RANG[c] = i; });

const PERIODICITES = ['mensuel', 'annuel'];
const PERIODICITE_LABEL = { mensuel: 'Mensuel', annuel: 'Annuel' };
const PERIODICITE_COURT = { mensuel: 'mois', annuel: 'an' };

// Valeurs rencontrées dans l'état des lieux Stripe ; champs libres en base,
// ces listes servent seulement aux menus déroulants.
const MOYENS_PAIEMENT = ['Prélèvement', 'CB', 'Facturation annuelle', 'À facturer', 'Offert', 'Pixel Digital'];
const TYPES_SITE = ['WordPress', 'Prestashop', 'Autre (PHP/HTML)', 'Domaine'];
const HOSTINGER = ['Hébergement & Domaine', 'Hébergement', 'Domaine'];
const TYPES_STRUCTURE = ['SARL', 'SAS', 'EI', 'Association', 'SA', 'EARL', 'SCEA', 'SELARL', 'GAEC', 'Société étrangère', 'Groupement de droit privé'];

const STRIPE = 'https://dashboard.stripe.com';

// Fiche client Stripe (la clé qui servira à relier Stripe en dynamique).
function lienStripeClient(id) {
  return id ? STRIPE + '/customers/' + encodeURIComponent(id) : null;
}

// Abonnement Stripe : les « sub_sched_ » sont des planifications d'abonnement.
function lienStripeAbonnement(id) {
  if (!id) return null;
  if (/^sub_sched_/.test(id)) return STRIPE + '/subscription_schedules/' + encodeURIComponent(id);
  return STRIPE + '/subscriptions/' + encodeURIComponent(id);
}

// Extrait un identifiant Stripe d'une saisie libre (ID brut ou URL du dashboard).
function extraireIdStripe(saisie, prefixe) {
  const s = (saisie || '').trim();
  if (!s) return null;
  const m = s.match(new RegExp('(' + prefixe + '[A-Za-z0-9_]+)'));
  return m ? m[1] : s;
}

// « a.fr, b.fr » -> ['a.fr', 'b.fr'] (plusieurs domaines possibles sur une ligne).
function domaines(champ) {
  return (champ || '').split(/[,\n]/).map(d => d.trim()).filter(Boolean);
}

// Plusieurs liens de connexion possibles, séparés par « / » entouré d'espaces.
function liensConnexion(champ) {
  return (champ || '').split(/\s+\/\s+/).map(l => l.trim()).filter(Boolean);
}

// Liens sûrs : on force http(s) (évite un « javascript: » saisi dans la fiche).
function urlSure(u) {
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : 'https://' + u;
}

function nombre(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

// Montant d'une ligne = prix unitaire × quantité (quantité absente = 1).
function montant(abo) {
  const prix = nombre(abo.prix_unitaire);
  if (prix === null) return null;
  return prix * (nombre(abo.quantite) || 1);
}

function totaux(abos) {
  const t = { mensuel: 0, annuel: 0, nbMensuel: 0, nbAnnuel: 0 };
  (abos || []).forEach(a => {
    const m = montant(a);
    if (m === null) return;
    if (a.periodicite === 'mensuel') { t.mensuel += m; t.nbMensuel++; }
    else if (a.periodicite === 'annuel') { t.annuel += m; t.nbAnnuel++; }
  });
  return t;
}

function formatEuro(n) {
  const v = nombre(n);
  if (v === null) return '—';
  const opts = Number.isInteger(v) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return v.toLocaleString('fr-FR', opts) + ' €';
}

function trierAbonnements(liste) {
  return (liste || []).slice().sort((a, b) =>
    (a.ordre - b.ordre) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

// Catégories présentes chez un client, dans l'ordre du référentiel, sans doublon.
function categoriesDe(abos) {
  const vues = {};
  (abos || []).forEach(a => { vues[a.categorie || 'autre'] = true; });
  return CATEGORIES.filter(c => vues[c]);
}

module.exports = {
  CATEGORIES, CATEGORIE_LABEL, CATEGORIE_RANG,
  PERIODICITES, PERIODICITE_LABEL, PERIODICITE_COURT,
  MOYENS_PAIEMENT, TYPES_SITE, HOSTINGER, TYPES_STRUCTURE,
  lienStripeClient, lienStripeAbonnement, extraireIdStripe,
  domaines, liensConnexion, urlSure, nombre, montant, totaux, formatEuro,
  trierAbonnements, categoriesDe
};
