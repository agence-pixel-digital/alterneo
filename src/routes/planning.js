const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { supabaseAdmin } = require('../supabaseClient');
const { parseExcelPlanning } = require('../lib/planningExcel');
const { buildMonthGrid, buildGlobalMonthGrid } = require('../lib/planningGrid');
const { joursOuvresEntre } = require('../lib/dates');
const { deduireRecuperation } = require('../lib/heuresSupp');
const { estFerie } = require('../lib/joursFeries');

const TYPES = ['entreprise', 'ecole', 'conge', 'recuperation', 'absent'];
const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype === EXCEL_MIME)
});

router.get('/planning', async (req, res) => {
  const moisParam = req.query.mois || new Date().toISOString().slice(0, 7);
  const [y, m] = moisParam.split('-').map(Number);
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  if (req.profile.role === 'admin') {
    const [{ data: alternants }, { data: rows }] = await Promise.all([
      req.db.from('profiles').select('*').eq('role', 'alternant').order('nom'),
      req.db.from('planning').select('alternant_id,date,type').gte('date', monthStart).lte('date', monthEnd)
    ]);
    return res.render('planning-admin', buildGlobalMonthGrid(alternants || [], rows || [], moisParam));
  }

  const profile = req.profile;
  const { data: rows } = await req.db.from('planning').select('date,type,commentaire').eq('alternant_id', profile.id).gte('date', monthStart).lte('date', monthEnd);
  res.render('planning-alternant', Object.assign({ alternantId: profile.id }, buildMonthGrid(rows, profile, moisParam)));
});

router.post('/planning/periode', requireAdmin, async (req, res) => {
  const { alternant_id, debut, fin, type, jours_ouvres, retour } = req.body;
  if (alternant_id && debut && fin && TYPES.includes(type)) {
    const dates = (jours_ouvres === 'on' ? joursOuvresEntre(debut, fin) : (() => {
      const list = [];
      for (let d = new Date(debut); d <= new Date(fin); d.setDate(d.getDate() + 1)) list.push(d.toISOString().slice(0, 10));
      return list;
    })()).filter(date => !estFerie(date));
    const rows = dates.map(date => ({ alternant_id, date, type }));
    if (rows.length) await req.db.from('planning').upsert(rows, { onConflict: 'alternant_id,date' });

    // Un congé ou une récupération ajouté(e) directement depuis le planning doit
    // aussi apparaître (et être comptabilisé) dans l'onglet Congés, comme s'il
    // avait été demandé puis validé. Le solde de congés en dépend.
    if (type === 'conge' || type === 'recuperation') {
      const joursConge = joursOuvresEntre(debut, fin);
      if (joursConge.length > 0) {
        await supabaseAdmin.from('conges').insert({
          alternant_id, date_debut: debut, date_fin: fin, jours: joursConge.length,
          statut: 'validee', type: type === 'recuperation' ? 'recuperation' : 'paye',
          commentaire: "Ajouté manuellement par l'administrateur depuis le planning"
        });
        if (type === 'recuperation') await deduireRecuperation(req.db, alternant_id, joursConge);
      }
    }
  }
  res.redirect(retour || ('/alternants?voir=' + alternant_id));
});

router.post('/planning/commentaire', async (req, res) => {
  const { alternant_id, date, commentaire, retour } = req.body;
  if (req.profile.role !== 'admin' && req.profile.id !== alternant_id) {
    return res.status(403).send('Accès refusé.');
  }
  if (alternant_id && date) {
    const { data: existing } = await supabaseAdmin.from('planning').select('id').eq('alternant_id', alternant_id).eq('date', date).maybeSingle();
    if (existing) {
      await supabaseAdmin.from('planning').update({ commentaire: commentaire || null }).eq('alternant_id', alternant_id).eq('date', date);
    } else if (commentaire) {
      await supabaseAdmin.from('planning').insert({ alternant_id, date, commentaire });
    }
  }
  res.redirect(retour || '/planning');
});

router.post('/alternants/:id/planning-import', requireAdmin, upload.single('fichier'), async (req, res) => {
  const { data: alternant } = await req.db.from('profiles').select('*').eq('id', req.params.id).single();
  if (!req.file) {
    return res.render('planning-import-preview', { alternant, lignes: [], ignorees: 0, error: 'Veuillez joindre un fichier Excel (.xlsx) au format du modèle.' });
  }
  try {
    const { lignes, ignorees } = parseExcelPlanning(req.file.buffer);
    res.render('planning-import-preview', {
      alternant, lignes, ignorees,
      error: lignes.length === 0 ? "Aucune ligne exploitable trouvée dans le fichier. Vérifiez qu'il respecte le format du modèle." : null
    });
  } catch (e) {
    res.render('planning-import-preview', { alternant, lignes: [], ignorees: 0, error: "Impossible de lire ce fichier Excel : " + e.message });
  }
});

router.post('/alternants/:id/planning-import/confirmer', requireAdmin, async (req, res) => {
  const dates = [].concat(req.body.date || []);
  const types = [].concat(req.body.type || []);
  const keep = [].concat(req.body.keep || []).map(String);

  const rows = [];
  dates.forEach((date, i) => {
    if (keep.includes(String(i)) && date && TYPES.includes(types[i]) && !estFerie(date)) {
      rows.push({ alternant_id: req.params.id, date, type: types[i] });
    }
  });
  if (rows.length) {
    await req.db.from('planning').upsert(rows, { onConflict: 'alternant_id,date' });
  }
  res.redirect('/alternants?voir=' + req.params.id);
});

module.exports = router;
