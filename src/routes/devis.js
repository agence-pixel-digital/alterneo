// Devis : suivi commercial réservé à l'admin (liste + kanban À faire / Envoyé / Validé).
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const D = require('../lib/devis');

const VUES = ['liste', 'kanban'];
const SELECT_DEVIS = '*, clients(id, societe, client)';

router.use('/devis', requireAdmin);

// Retour vers la vue d'origine après une action.
function retourOu(req, defaut) {
  const retour = req.body.retour || '';
  return retour.startsWith('/devis') ? retour : defaut;
}

router.get('/devis', async (req, res) => {
  const vue = VUES.includes(req.query.vue) ? req.query.vue : 'liste';
  const [{ data: rows }, { data: clients }] = await Promise.all([
    req.db.from('devis').select(SELECT_DEVIS).order('created_at', { ascending: false }),
    req.db.from('clients').select('id, societe, client').order('societe')
  ]);
  const devis = D.trierDevis((rows || []).map(D.preparerDevis));
  res.render('devis', {
    vue, devis,
    totaux: D.totaux(devis),
    clients: (clients || []).map(c => ({ id: c.id, nom: c.societe || c.client || 'Client sans nom' })),
    D
  });
});

router.post('/devis', async (req, res) => {
  const champs = D.lireDevis(req.body);
  if (!champs.entreprise) return res.redirect(retourOu(req, '/devis'));
  await req.db.from('devis').insert(Object.assign(champs, D.datesPourStatut(champs.statut, null)));
  res.redirect(retourOu(req, '/devis'));
});

router.post('/devis/:id', async (req, res) => {
  const champs = D.lireDevis(req.body);
  if (!champs.entreprise) return res.redirect(retourOu(req, '/devis'));
  const { data: actuel } = await req.db.from('devis').select('date_envoi, date_validation').eq('id', req.params.id).single();
  await req.db.from('devis')
    .update(Object.assign(champs, D.datesPourStatut(champs.statut, actuel), { updated_at: new Date().toISOString() }))
    .eq('id', req.params.id);
  res.redirect(retourOu(req, '/devis'));
});

// Changement de statut seul : glisser-déposer du kanban (fetch) ou boutons rapides.
router.post('/devis/:id/statut', async (req, res) => {
  const { statut } = req.body;
  const enAjax = req.get('X-Requested-With') === 'fetch';
  if (!D.STATUTS.includes(statut)) {
    return enAjax ? res.status(400).json({ ok: false }) : res.redirect(retourOu(req, '/devis?vue=kanban'));
  }
  const { data: actuel } = await req.db.from('devis').select('date_envoi, date_validation').eq('id', req.params.id).single();
  const { data } = await req.db.from('devis')
    .update(Object.assign({ statut, updated_at: new Date().toISOString() }, D.datesPourStatut(statut, actuel)))
    .eq('id', req.params.id).select('id, date_envoi, date_validation');
  const ok = !!(data && data.length);
  if (enAjax) return res.status(ok ? 200 : 403).json({ ok, devis: ok ? data[0] : null });
  res.redirect(retourOu(req, '/devis?vue=kanban'));
});

router.post('/devis/:id/supprimer', async (req, res) => {
  await req.db.from('devis').delete().eq('id', req.params.id);
  res.redirect(retourOu(req, '/devis'));
});

module.exports = router;
