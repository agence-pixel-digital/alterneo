// Pont « connexion en un clic » vers les sites WordPress des clients.
// Le tableau de bord MainWP (maintenance.pixel-digital.fr) expose ?go=<domaine> :
// s'il reconnaît le domaine, il ouvre le wp-admin du site déjà connecté, après
// authentification MainWP (mot de passe + 2FA). Aucun identifiant ne transite ici.
const MAINWP_URL = (process.env.MAINWP_URL || 'https://maintenance.pixel-digital.fr').replace(/\/+$/, '');

// Extrait le domaine d'une saisie libre (« https://www.monsite.fr/wp-admin » -> « monsite.fr »).
function domaineDepuis(url) {
  const s = (url || '').trim().toLowerCase();
  if (!s) return null;
  const host = s.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/^www\./, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
}

// Lien de connexion en un clic pour une fiche client (null si pas de site).
function lienConnexionMainWP(fiche) {
  const domaine = domaineDepuis(fiche && fiche.site_web) || domaineDepuis(fiche && fiche.lien_connexion);
  return domaine ? MAINWP_URL + '/?go=' + encodeURIComponent(domaine) : null;
}

// Le domaine est-il géré par MainWP ? Interroge ?go=<domaine>&check=1 (204 = oui, 404 = non),
// sans authentification ni donnée renvoyée. Résultat mis en cache 10 min ; en cas d'erreur
// réseau on répond null (inconnu) et le bouton reste affiché.
const CACHE = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
async function estConnecteMainWP(domaine) {
  if (!domaine) return false;
  const hit = CACHE.get(domaine);
  if (hit && hit.expire > Date.now()) return hit.valeur;
  let valeur = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(MAINWP_URL + '/?go=' + encodeURIComponent(domaine) + '&check=1', { redirect: 'manual', signal: ctrl.signal });
    clearTimeout(timer);
    if (r.status === 204) valeur = true;
    else if (r.status === 404) valeur = false;
  } catch (e) { valeur = null; }
  if (valeur !== null) CACHE.set(domaine, { valeur, expire: Date.now() + CACHE_TTL_MS });
  return valeur;
}

// Enrichit une fiche client : lienMainWP (URL du bouton) et mainwpConnecte (true/false/null).
async function enrichirMainWP(fiche) {
  const domaine = domaineDepuis(fiche && fiche.site_web) || domaineDepuis(fiche && fiche.lien_connexion);
  fiche.lienMainWP = domaine ? MAINWP_URL + '/?go=' + encodeURIComponent(domaine) : null;
  fiche.mainwpConnecte = domaine ? await estConnecteMainWP(domaine) : false;
  return fiche;
}

module.exports = { MAINWP_URL, domaineDepuis, lienConnexionMainWP, estConnecteMainWP, enrichirMainWP };
