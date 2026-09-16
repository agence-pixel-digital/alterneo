const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { supabaseAdmin } = require('../supabaseClient');
const { notifierNouvelleAbsenceEcole } = require('../lib/notifications');
const { HEURES_PAR_JOUR } = require('../lib/constants');

const MOTIFS = ['maladie', 'justifie_ecole', 'sans_solde', 'conge_paye'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['application/pdf', 'image/png', 'image/jpeg'].includes(file.mimetype))
});

async function televerserJustificatif(alternantId, file) {
  const ext = file.mimetype === 'application/pdf' ? 'pdf' : (file.mimetype === 'image/png' ? 'png' : 'jpg');
  const path = `${alternantId}/${Date.now()}.${ext}`;
  const { error } = await supabaseAdmin.storage.from('justificatifs').upload(path, file.buffer, { contentType: file.mimetype });
  return error ? null : path;
}

router.get('/ecole', async (req, res) => {
  const db = req.db;
  const profile = req.profile;

  if (profile.role === 'admin') {
    const { alt, mois } = req.query;
    let query = db.from('absences_ecole')
      .select('*, profiles!absences_ecole_alternant_id_fkey(prenom,nom,avatar_color)')
      .order('date', { ascending: false });
    if (alt) query = query.eq('alternant_id', alt);
    if (mois) query = query.gte('date', mois + '-01').lte('date', mois + '-31');

    const [{ data: absences }, { data: alternants }] = await Promise.all([
      query,
      db.from('profiles').select('id,prenom,nom').eq('role', 'alternant').order('nom')
    ]);
    return res.render('ecole-admin', {
      absences: absences || [], alternants: alternants || [],
      filtreAlt: alt || '', filtreMois: mois || '', error: null
    });
  }

  const { data: mine } = await db.from('absences_ecole').select('*').eq('alternant_id', profile.id).order('date', { ascending: false });
  res.render('ecole-alternant', { absences: mine || [], error: null });
});

router.post('/ecole', upload.single('justificatif'), async (req, res) => {
  if (req.profile.role === 'admin') return res.status(403).send('Réservé aux alternants.');
  const { date, heures, motif_type, motif } = req.body;
  if (!date || !MOTIFS.includes(motif_type)) {
    const { data: mine } = await req.db.from('absences_ecole').select('*').eq('alternant_id', req.profile.id).order('date', { ascending: false });
    return res.render('ecole-alternant', { absences: mine || [], error: 'Veuillez renseigner la date et le motif.' });
  }

  const justificatif_url = (motif_type === 'maladie' && req.file) ? await televerserJustificatif(req.profile.id, req.file) : null;

  const { data: absence } = await req.db.from('absences_ecole').insert({
    alternant_id: req.profile.id, date, heures: heures ? Number(heures) : HEURES_PAR_JOUR,
    motif_type, motif: motif || null, justificatif_url
  }).select().single();
  if (absence) notifierNouvelleAbsenceEcole(req.profile, absence);
  res.redirect('/ecole');
});

router.post('/ecole/ajouter', requireAdmin, upload.single('justificatif'), async (req, res) => {
  const { alternant_id, date, heures, motif_type, motif } = req.body;
  if (alternant_id && date && MOTIFS.includes(motif_type)) {
    const justificatif_url = (motif_type === 'maladie' && req.file) ? await televerserJustificatif(alternant_id, req.file) : null;
    await req.db.from('absences_ecole').insert({
      alternant_id, date, heures: heures ? Number(heures) : HEURES_PAR_JOUR,
      motif_type, motif: motif || null, justificatif_url
    });
  }
  res.redirect('/ecole');
});

router.post('/ecole/:id/supprimer', requireAdmin, async (req, res) => {
  await req.db.from('absences_ecole').delete().eq('id', req.params.id);
  res.redirect('/ecole');
});

router.get('/ecole/:id/justificatif', async (req, res) => {
  const { data: absence } = await req.db.from('absences_ecole').select('justificatif_url').eq('id', req.params.id).maybeSingle();
  if (!absence || !absence.justificatif_url) return res.status(404).send('Justificatif introuvable.');

  const { data, error } = await supabaseAdmin.storage.from('justificatifs')
    .createSignedUrl(absence.justificatif_url, 60, { download: true });
  if (error) return res.status(500).send('Impossible de générer le lien de téléchargement.');
  res.redirect(data.signedUrl);
});

module.exports = router;
