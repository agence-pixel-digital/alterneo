// Devis : vocabulaire, listes de valeurs et petits calculs partagés entre la
// route et les vues. Le suivi est réservé à l'admin (RLS is_admin()).
const { nombre, formatEuro } = require('./clients');
const { iso, parseIsoLocal } = require('./dates');

const STATUTS = ['a_faire', 'envoye', 'valide'];
const STATUT_LABEL = { a_faire: 'À faire', envoye: 'Envoyé', valide: 'Validé' };
const STATUT_COURT = { a_faire: 'À faire', envoye: 'En attente', valide: 'Validé' };
const STATUT_BADGE = { a_faire: 'badge-afaire', envoye: 'badge-encours', valide: 'badge-termine' };
const STATUT_DOT = { a_faire: '#2E5C8A', envoye: '#D9A441', valide: '#1F9D6B' };

function t(v) {
  const s = (v === undefined || v === null) ? '' : String(v).trim();
  return s || null;
}

// Montant saisi « 1 200,50 » ou « 1200.5 » -> 1200.5 (null si vide / invalide).
function lireMontant(v) {
  const s = (v === undefined || v === null) ? '' : String(v).replace(/\s|€/g, '').replace(',', '.');
  if (!s) return null;
  const n = nombre(s);
  return n === null || n < 0 ? null : Math.round(n * 100) / 100;
}

// Champs d'un devis depuis un formulaire (création ou modification).
function lireDevis(body) {
  return {
    entreprise: t(body.entreprise),
    contact_prenom: t(body.contact_prenom),
    contact_nom: t(body.contact_nom),
    telephone: t(body.telephone),
    email: t(body.email),
    description: t(body.description),
    montant: lireMontant(body.montant),
    client_id: t(body.client_id),
    statut: STATUTS.includes(body.statut) ? body.statut : 'a_faire'
  };
}

// Dates automatiques selon le statut : un devis « envoyé » reçoit sa date
// d'envoi s'il n'en a pas, un devis « validé » sa date de validation ; un
// retour en arrière efface les dates qui n'ont plus de sens.
function datesPourStatut(statut, actuel) {
  const auj = iso(new Date());
  const dateEnvoi = actuel && actuel.date_envoi;
  const dateValidation = actuel && actuel.date_validation;
  if (statut === 'a_faire') return { date_envoi: null, date_validation: null };
  if (statut === 'envoye') return { date_envoi: dateEnvoi || auj, date_validation: null };
  return { date_envoi: dateEnvoi || auj, date_validation: dateValidation || auj };
}

// Nombre de jours écoulés depuis une date ISO (0 si aujourd'hui).
function joursDepuis(isoDate) {
  if (!isoDate) return null;
  const d = parseIsoLocal(isoDate);
  const auj = parseIsoLocal(iso(new Date()));
  return Math.max(0, Math.round((auj - d) / 86400000));
}

function nomContact(d) {
  return [d.contact_prenom, d.contact_nom].filter(Boolean).join(' ');
}

// Enrichit un devis pour l'affichage.
function preparerDevis(d) {
  const client = d.clients || null;
  return Object.assign({}, d, {
    contact: nomContact(d),
    montantFmt: d.montant === null || d.montant === undefined ? null : formatEuro(d.montant),
    joursAttente: d.statut === 'envoye' ? joursDepuis(d.date_envoi) : null,
    clientLie: client ? { id: client.id, nom: client.societe || client.client || 'Client' } : null,
    clients: undefined
  });
}

// Tri du pipeline : à faire = les plus anciens d'abord, envoyé = les plus
// longtemps en attente d'abord, validé = les plus récents d'abord.
function trierDevis(liste) {
  return (liste || []).slice().sort((a, b) => {
    if (a.statut !== b.statut) return STATUTS.indexOf(a.statut) - STATUTS.indexOf(b.statut);
    if (a.statut === 'valide') return String(b.date_validation || b.created_at).localeCompare(String(a.date_validation || a.created_at));
    if (a.statut === 'envoye') return String(a.date_envoi || a.created_at).localeCompare(String(b.date_envoi || b.created_at));
    return String(a.created_at).localeCompare(String(b.created_at));
  });
}

// Totaux par statut (nombre + montant cumulé).
function totaux(liste) {
  const r = {};
  STATUTS.forEach(s => { r[s] = { nb: 0, montant: 0 }; });
  (liste || []).forEach(d => {
    r[d.statut].nb += 1;
    r[d.statut].montant += nombre(d.montant) || 0;
  });
  return r;
}

module.exports = {
  STATUTS, STATUT_LABEL, STATUT_COURT, STATUT_BADGE, STATUT_DOT,
  lireDevis, lireMontant, datesPourStatut, joursDepuis, nomContact, preparerDevis, trierDevis, totaux, formatEuro
};
