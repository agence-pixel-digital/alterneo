const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE !== 'false',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    });
  }
  return transporter;
}

// N'échoue jamais bruyamment : si le SMTP n'est pas configuré ou l'envoi
// échoue, on logue côté serveur sans casser le parcours utilisateur.
async function envoyerMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t || !to || (Array.isArray(to) && to.length === 0)) return;
  try {
    await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html });
  } catch (e) {
    console.error('Erreur envoi e-mail :', e.message);
  }
}

module.exports = { envoyerMail };
