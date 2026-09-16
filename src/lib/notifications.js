const { envoyerMail } = require('./mailer');
const { formatFr } = require('./dates');
const { supabaseAdmin } = require('../supabaseClient');

// Utilise systématiquement supabaseAdmin (et non le client RLS de l'appelant) :
// un alternant n'a pas le droit de voir les profils admin, mais le serveur
// doit pouvoir retrouver leur e-mail pour les notifier.
async function emailsAdmins() {
  const { data } = await supabaseAdmin.from('profiles').select('email').eq('role', 'admin');
  return (data || []).map(a => a.email);
}

async function notifierNouvelleCongeDemande(alternant, conge) {
  const to = await emailsAdmins();
  await envoyerMail({
    to,
    subject: `Nouvelle demande de congé — ${alternant.prenom} ${alternant.nom}`,
    html: `<p>${alternant.prenom} ${alternant.nom} a demandé un congé du ${formatFr(conge.date_debut)} au ${formatFr(conge.date_fin)} (${conge.jours} j).</p>
           <p>${conge.commentaire ? 'Commentaire : ' + conge.commentaire : ''}</p>`
  });
}

async function notifierNouvelleAbsenceEcole(alternant, absence) {
  const to = await emailsAdmins();
  await envoyerMail({
    to,
    subject: `Absence école signalée — ${alternant.prenom} ${alternant.nom}`,
    html: `<p>${alternant.prenom} ${alternant.nom} a signalé une absence le ${formatFr(absence.date)}${absence.heures ? ' (' + absence.heures + 'h)' : ''}.</p>
           <p>Motif : ${absence.motif || '—'}</p>`
  });
}

async function notifierNouvelleFichePaie(alternant, periode) {
  await envoyerMail({
    to: alternant.email,
    subject: 'Nouvelle fiche de paie disponible',
    html: `<p>Bonjour ${alternant.prenom},</p><p>Une nouvelle fiche de paie vient d'être déposée dans votre espace Alternéo.</p>`
  });
}

async function notifierReponseConge(alternant, conge) {
  const statutLabel = conge.statut === 'validee' ? 'validée' : 'refusée';
  await envoyerMail({
    to: alternant.email,
    subject: `Votre demande de congé a été ${statutLabel}`,
    html: `<p>Bonjour ${alternant.prenom},</p>
           <p>Votre demande de congé du ${formatFr(conge.date_debut)} au ${formatFr(conge.date_fin)} a été <strong>${statutLabel}</strong>.</p>
           ${conge.motif_refus ? '<p>Motif : ' + conge.motif_refus + '</p>' : ''}`
  });
}

module.exports = { notifierNouvelleCongeDemande, notifierNouvelleAbsenceEcole, notifierNouvelleFichePaie, notifierReponseConge };
