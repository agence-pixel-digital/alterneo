const { supabaseAdmin } = require('../supabaseClient');
const { envoyerRappelsAbsencesEcole } = require('./notifications');

// Planificateur intégré à l'application (pas de cron externe). Chaque mois, à
// partir du 23, les alternants reçoivent un rappel pour compléter leurs
// absences école. L'envoi est rendu idempotent par la table
// `rappels_absences_ecole` (clé = mois) : au plus un envoi par mois, même si le
// serveur redémarre ou tourne en plusieurs instances.
const JOUR_RAPPEL = 23;

async function verifierEtEnvoyer() {
  const now = new Date();
  if (now.getDate() < JOUR_RAPPEL) return;   // pas encore le 23

  const mois = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Réservation du mois via une insertion à clé unique : si le mois est déjà
  // enregistré, l'insertion échoue (conflit) et on n'envoie rien.
  const { error } = await supabaseAdmin.from('rappels_absences_ecole').insert({ mois });
  if (error) return;

  const n = await envoyerRappelsAbsencesEcole();
  console.log(`Rappels absences école envoyés pour ${mois} : ${n}`);
}

function planifierRappels() {
  // Contrôle au démarrage, puis toutes les heures (l'idempotence évite les
  // doublons ; tant que l'app tourne un jour >= 23, le rappel du mois part).
  const executer = () => verifierEtEnvoyer().catch(e => console.error('Planificateur rappels :', e.message));
  executer();
  setInterval(executer, 60 * 60 * 1000);
}

module.exports = { planifierRappels };
