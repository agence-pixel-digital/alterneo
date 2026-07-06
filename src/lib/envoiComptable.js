const { formatFr, formatPeriodeFr } = require('./dates');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function monthRange(mois) {
  const [y, m] = mois.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

async function recapAlternant(db, alternant, start, end) {
  const [{ data: conges }, { data: absences }] = await Promise.all([
    db.from('conges').select('date_debut,date_fin,jours').eq('alternant_id', alternant.id)
      .eq('statut', 'validee').eq('type', 'paye').lte('date_debut', end).gte('date_fin', start).order('date_debut'),
    db.from('absences_ecole').select('date,motif_type,motif').eq('alternant_id', alternant.id)
      .gte('date', start).lte('date', end).order('date')
  ]);
  const maladie = (absences || []).filter(a => a.motif_type === 'maladie');
  const sansSolde = (absences || []).filter(a => a.motif_type === 'sans_solde');
  return { alternant, conges: conges || [], maladie, sansSolde };
}

// Un récapitulatif par société ayant au moins un alternant rattaché.
async function genererRecaps(db, mois, societeIdFiltre) {
  const { start, end } = monthRange(mois);
  let societesQuery = db.from('societes').select('*').order('nom');
  if (societeIdFiltre) societesQuery = societesQuery.eq('id', societeIdFiltre);
  const { data: societes } = await societesQuery;

  const recaps = [];
  for (const societe of (societes || [])) {
    const { data: alternants } = await db.from('profiles').select('*')
      .eq('role', 'alternant').eq('societe_id', societe.id).order('nom');
    if (!alternants || alternants.length === 0) continue;
    const details = await Promise.all(alternants.map(a => recapAlternant(db, a, start, end)));
    recaps.push({ societe, mois, details });
  }
  return recaps;
}

function listeAbsences(absences) {
  return absences.map(a => `<li>${formatFr(a.date)}${a.motif ? ' — ' + escapeHtml(a.motif) : ''}</li>`).join('');
}

function genererHtmlEmail(recap) {
  const { societe, mois, details } = recap;
  const titreMois = formatPeriodeFr(mois);
  let html = `<div style="font-family:Arial,sans-serif;color:#1c2733;">`
    + `<h2 style="margin:0 0 4px;">Récapitulatif mensuel — ${escapeHtml(societe.nom)}</h2>`
    + `<p style="color:#5b6b7d;margin:0 0 20px;">${titreMois}</p>`;

  details.forEach(d => {
    const { alternant, conges, maladie, sansSolde } = d;
    html += `<div style="border-top:1px solid #E8ECF2;padding:16px 0;">`
      + `<h3 style="margin:0 0 10px;">${escapeHtml(alternant.prenom)} ${escapeHtml(alternant.nom)}</h3>`;

    html += `<p style="margin:0 0 4px;font-weight:bold;">Congés payés pris</p>`;
    html += conges.length === 0
      ? `<p style="margin:0 0 10px;color:#9AA7B5;">Aucun congé payé.</p>`
      : `<ul style="margin:0 0 10px;padding-left:18px;">${conges.map(c => `<li>${formatFr(c.date_debut)} → ${formatFr(c.date_fin)} (${c.jours} j)</li>`).join('')}</ul>`;

    html += `<p style="margin:0 0 4px;font-weight:bold;">Maladie</p>`;
    html += maladie.length === 0
      ? `<p style="margin:0 0 10px;color:#9AA7B5;">Aucune absence pour maladie.</p>`
      : `<ul style="margin:0 0 10px;padding-left:18px;">${listeAbsences(maladie)}</ul>`;

    html += `<p style="margin:0 0 4px;font-weight:bold;">Sans solde</p>`;
    html += sansSolde.length === 0
      ? `<p style="margin:0;color:#9AA7B5;">Aucune absence sans solde.</p>`
      : `<ul style="margin:0;padding-left:18px;">${listeAbsences(sansSolde)}</ul>`;

    html += `</div>`;
  });

  html += `</div>`;
  return { subject: `Récapitulatif mensuel — ${societe.nom} — ${titreMois}`, html };
}

module.exports = { genererRecaps, genererHtmlEmail, monthRange };
