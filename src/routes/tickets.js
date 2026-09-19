const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { supabaseAdmin } = require('../supabaseClient');
const { sanitizeHtml } = require('../lib/sanitizeHtml');
const { notifierNouveauTicket, notifierTicketTermine } = require('../lib/notifications');

const PRIORITES = ['basse', 'normale', 'haute'];
const PRIORITE_LABEL = { basse: 'Basse', normale: 'Normale', haute: 'Haute' };
const PRIORITE_BADGE = { basse: 'badge-prio-basse', normale: 'badge-prio-normale', haute: 'badge-prio-haute' };
const PRIORITE_RANG = { haute: 0, normale: 1, basse: 2 };

// Pièces jointes libres (PDF, images, Excel, etc.) — pas de restriction de type,
// seulement une taille max par fichier.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }
});

const SELECT_TICKET =
  '*, ticket_assignes(profiles(id, prenom, nom, avatar_color)), ' +
  'ticket_pieces_jointes(id, nom, mime, taille), ' +
  'createur:profiles!tickets_createur_id_fkey(prenom, nom), ' +
  'termine_par:profiles!tickets_termine_par_id_fkey(prenom, nom)';

function normaliseAssignes(body) {
  return [].concat(body.assignes || []).filter(Boolean);
}

// Nom de fichier nettoyé pour un chemin Storage (pas de / ni caractères exotiques).
function nomSur(nom) {
  return String(nom || 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
}

function decore(t) {
  const assignes = (t.ticket_assignes || []).map(a => a.profiles).filter(Boolean)
    .sort((a, b) => (a.prenom + a.nom).localeCompare(b.prenom + b.nom));
  const pieces = t.ticket_pieces_jointes || [];
  return Object.assign({}, t, { assignes, pieces });
}

router.get('/tickets', async (req, res) => {
  const db = req.db;
  const isAdmin = req.profile.role === 'admin';

  // RLS : l'admin voit tout, l'alternant seulement ses tickets assignés.
  const { data: rows } = await db.from('tickets').select(SELECT_TICKET).order('created_at', { ascending: false });
  const tickets = (rows || []).map(decore);
  const triPriorite = (a, b) => (PRIORITE_RANG[a.priorite] - PRIORITE_RANG[b.priorite]);
  const ouverts = tickets.filter(t => t.statut === 'ouvert').sort(triPriorite);
  const termines = tickets.filter(t => t.statut === 'termine');

  if (isAdmin) {
    const { data: alternants } = await db.from('profiles')
      .select('id, prenom, nom, avatar_color').eq('role', 'alternant').order('nom');
    return res.render('tickets-admin', {
      ouverts, termines, alternants: alternants || [],
      PRIORITES, PRIORITE_LABEL, PRIORITE_BADGE, error: null
    });
  }
  res.render('tickets-alternant', {
    ouverts, termines, PRIORITE_LABEL, PRIORITE_BADGE, moi: req.profile.id
  });
});

// Création : réservée à l'admin.
router.post('/tickets', requireAdmin, upload.array('fichiers', 10), async (req, res) => {
  const titre = (req.body.titre || '').trim();
  const priorite = PRIORITES.includes(req.body.priorite) ? req.body.priorite : 'normale';
  const description = sanitizeHtml(req.body.description) || null;
  const assignes = normaliseAssignes(req.body);

  if (!titre) return res.redirect('/tickets');

  const { data: ticket } = await supabaseAdmin.from('tickets')
    .insert({ titre, description, priorite, createur_id: req.profile.id })
    .select('id, titre, priorite').single();
  if (!ticket) return res.redirect('/tickets');

  if (assignes.length) {
    await supabaseAdmin.from('ticket_assignes')
      .insert(assignes.map(id => ({ ticket_id: ticket.id, profile_id: id })));
  }

  for (const f of (req.files || [])) {
    const path = `${ticket.id}/${Date.now()}-${nomSur(f.originalname)}`;
    const { error } = await supabaseAdmin.storage.from('tickets')
      .upload(path, f.buffer, { contentType: f.mimetype || 'application/octet-stream' });
    if (!error) {
      await supabaseAdmin.from('ticket_pieces_jointes').insert({
        ticket_id: ticket.id, fichier_url: path, nom: f.originalname, mime: f.mimetype, taille: f.size
      });
    }
  }

  if (assignes.length) {
    const { data: profs } = await supabaseAdmin.from('profiles').select('email').in('id', assignes);
    notifierNouveauTicket(ticket, (profs || []).map(p => p.email));
  }
  res.redirect('/tickets');
});

// Édition : réservée à l'admin (titre / description / priorité / assignés + ajout de pièces).
router.post('/tickets/:id', requireAdmin, upload.array('fichiers', 10), async (req, res) => {
  const titre = (req.body.titre || '').trim();
  const priorite = PRIORITES.includes(req.body.priorite) ? req.body.priorite : 'normale';
  const description = sanitizeHtml(req.body.description) || null;
  const assignes = normaliseAssignes(req.body);
  if (!titre) return res.redirect('/tickets');

  const { data: modifie } = await req.db.from('tickets')
    .update({ titre, description, priorite }).eq('id', req.params.id).select('id');
  if (!modifie || !modifie.length) return res.redirect('/tickets');

  await supabaseAdmin.from('ticket_assignes').delete().eq('ticket_id', req.params.id);
  if (assignes.length) {
    await supabaseAdmin.from('ticket_assignes')
      .insert(assignes.map(id => ({ ticket_id: req.params.id, profile_id: id })));
  }

  for (const f of (req.files || [])) {
    const path = `${req.params.id}/${Date.now()}-${nomSur(f.originalname)}`;
    const { error } = await supabaseAdmin.storage.from('tickets')
      .upload(path, f.buffer, { contentType: f.mimetype || 'application/octet-stream' });
    if (!error) {
      await supabaseAdmin.from('ticket_pieces_jointes').insert({
        ticket_id: req.params.id, fichier_url: path, nom: f.originalname, mime: f.mimetype, taille: f.size
      });
    }
  }
  res.redirect('/tickets');
});

// Marquer terminé : l'assigné (ou l'admin). La RLS garantit que seul un assigné
// (ou un admin) peut modifier le ticket ; un mail part alors vers les admins.
router.post('/tickets/:id/terminer', async (req, res) => {
  const { data } = await req.db.from('tickets')
    .update({ statut: 'termine', termine_par_id: req.profile.id, termine_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('statut', 'ouvert').select('id, titre');
  if (data && data.length) notifierTicketTermine(data[0], req.profile);
  res.redirect('/tickets');
});

// Rouvrir un ticket terminé : réservé à l'admin.
router.post('/tickets/:id/rouvrir', requireAdmin, async (req, res) => {
  await req.db.from('tickets')
    .update({ statut: 'ouvert', termine_par_id: null, termine_at: null })
    .eq('id', req.params.id);
  res.redirect('/tickets');
});

router.post('/tickets/:id/supprimer', requireAdmin, async (req, res) => {
  // Nettoyage du Storage avant suppression (le cascade DB ne touche pas les fichiers).
  const { data: pieces } = await req.db.from('ticket_pieces_jointes').select('fichier_url').eq('ticket_id', req.params.id);
  const chemins = (pieces || []).map(p => p.fichier_url).filter(Boolean);
  if (chemins.length) await supabaseAdmin.storage.from('tickets').remove(chemins);
  await req.db.from('tickets').delete().eq('id', req.params.id);
  res.redirect('/tickets');
});

router.get('/tickets/:id/pieces/:pieceId/telecharger', async (req, res) => {
  // RLS : ne renvoie la pièce que si l'utilisateur a accès au ticket.
  const { data: piece } = await req.db.from('ticket_pieces_jointes')
    .select('fichier_url, nom').eq('id', req.params.pieceId).eq('ticket_id', req.params.id).maybeSingle();
  if (!piece) return res.status(404).send('Pièce jointe introuvable.');
  const { data, error } = await supabaseAdmin.storage.from('tickets')
    .createSignedUrl(piece.fichier_url, 60, { download: piece.nom });
  if (error) return res.status(500).send('Impossible de générer le lien de téléchargement.');
  res.redirect(data.signedUrl);
});

module.exports = router;
