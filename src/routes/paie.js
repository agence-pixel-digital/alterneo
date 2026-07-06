const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { supabaseAdmin } = require('../supabaseClient');
const { notifierNouvelleFichePaie } = require('../lib/notifications');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf')
});

const PERIODE_RE = /^\d{4}-\d{2}$/;

router.get('/paie', async (req, res) => {
  const db = req.db;
  const profile = req.profile;

  if (profile.role === 'admin') {
    const [{ data: alternants }, { data: recent }] = await Promise.all([
      db.from('profiles').select('*').eq('role', 'alternant').order('nom'),
      db.from('fiches_paie').select('*, profiles!fiches_paie_alternant_id_fkey(prenom,nom,avatar_color)').order('date_depot', { ascending: false }).limit(15)
    ]);
    return res.render('paie-admin', { alternants: alternants || [], recent: recent || [], error: null });
  }

  const { data: fiches } = await db.from('fiches_paie').select('*').eq('alternant_id', profile.id).order('periode', { ascending: false });
  res.render('paie-alternant', { fiches: fiches || [] });
});

router.post('/paie', requireAdmin, upload.single('fichier'), async (req, res) => {
  const { alternant_id, periode } = req.body;
  const rerender = async (error) => {
    const [{ data: alternants }, { data: recent }] = await Promise.all([
      req.db.from('profiles').select('*').eq('role', 'alternant').order('nom'),
      req.db.from('fiches_paie').select('*, profiles!fiches_paie_alternant_id_fkey(prenom,nom,avatar_color)').order('date_depot', { ascending: false }).limit(15)
    ]);
    res.render('paie-admin', { alternants: alternants || [], recent: recent || [], error });
  };

  if (!alternant_id || !periode || !req.file) return rerender('Veuillez remplir tous les champs et joindre un PDF.');
  if (!PERIODE_RE.test(periode)) return rerender('Période invalide — sélectionnez un mois via le calendrier.');

  const { data: existing } = await req.db.from('fiches_paie').select('id').eq('alternant_id', alternant_id).eq('periode', periode).maybeSingle();
  if (existing) return rerender('Une fiche existe déjà pour cette période.');

  const path = `${alternant_id}/${periode}.pdf`;
  const { error: uploadErr } = await supabaseAdmin.storage.from('fiches-paie').upload(path, req.file.buffer, {
    contentType: 'application/pdf', upsert: false
  });
  if (uploadErr) return rerender("Erreur lors de l'envoi du fichier : " + uploadErr.message);

  await req.db.from('fiches_paie').insert({ alternant_id, periode, fichier_url: path });
  const { data: alternant } = await req.db.from('profiles').select('prenom,email').eq('id', alternant_id).single();
  if (alternant) notifierNouvelleFichePaie(alternant, periode);
  res.redirect('/paie');
});

router.get('/paie/:id/telecharger', async (req, res) => {
  const { data: fiche } = await req.db.from('fiches_paie').select('*').eq('id', req.params.id).maybeSingle();
  if (!fiche) return res.status(404).send('Fiche introuvable.');

  const nomFichier = `bulletin-${fiche.periode}.pdf`;
  const { data, error } = await supabaseAdmin.storage.from('fiches-paie')
    .createSignedUrl(fiche.fichier_url, 60, { download: nomFichier });
  if (error) return res.status(500).send('Impossible de générer le lien de téléchargement.');
  res.redirect(data.signedUrl);
});

module.exports = router;
