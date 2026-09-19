// Sanitiseur HTML minimal, sans dépendance externe. Pensé pour du contenu riche
// simple (gras/italique/souligné/listes/liens/titres) produit par l'éditeur
// maison des tickets. Principe : liste blanche de balises ; toute autre balise
// est retirée (son texte est conservé) ; tous les attributs sont supprimés sauf
// href sur <a> (schéma contrôlé). Les blocs <script>/<style> et les commentaires
// sont éliminés intégralement. Indispensable car la description est ensuite
// rendue en HTML brut (<%- %>) dans les vues.

const BALISES_OK = new Set(['p', 'div', 'span', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'h3', 'h4']);

function hrefSur(valeur) {
  const v = (valeur || '').trim();
  if (/^(https?:|mailto:)/i.test(v)) return v;   // liens externes / mail
  if (/^[/#]/.test(v)) return v;                 // chemin relatif ou ancre
  return null;                                   // rejette javascript:, data:, etc.
}

function sanitizeHtml(input) {
  if (!input) return '';
  let html = String(input);

  // Retire commentaires et blocs script/style (contenu compris).
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  html = html.replace(/<(script|style)\b[^>]*>/gi, '');

  // Réécrit chaque balise à partir de la liste blanche.
  html = html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, function (m, slash, nom, attrs) {
    const t = nom.toLowerCase();
    if (!BALISES_OK.has(t)) return '';           // balise interdite : on la retire, le texte reste
    if (slash) return '</' + t + '>';
    if (t === 'a') {
      const mh = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs || '');
      const href = mh ? hrefSur(mh[2] || mh[3] || mh[4]) : null;
      return href
        ? '<a href="' + href.replace(/"/g, '%22') + '" target="_blank" rel="noopener noreferrer">'
        : '<a>';
    }
    return '<' + t + '>';                         // balise autorisée, sans attribut
  });

  return html.trim();
}

module.exports = { sanitizeHtml };
