// Comportements globaux de l'application.
(function () {
  // Filtres auto-appliqués : dans un formulaire de filtre (.js-autofilter),
  // tout changement de valeur (select personnalisé, mois, date…) soumet
  // immédiatement le formulaire — plus besoin de bouton « Filtrer ».
  document.addEventListener('change', function (e) {
    var form = e.target.closest ? e.target.closest('form.js-autofilter') : null;
    if (form) form.submit();
  });

  // Croix d'effacement des filtres date/mois : vide la valeur puis déclenche
  // le change (donc la re-soumission du filtre).
  document.addEventListener('click', function (e) {
    var clear = e.target.closest ? e.target.closest('.date-clear') : null;
    if (!clear) return;
    var field = clear.closest('.date-field');
    var hidden = field.querySelector('input[type="hidden"]');
    hidden.value = '';
    field.querySelector('.date-display').value = '';
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Toutes les popups se ferment d'un clic en dehors de la boîte (sur le voile).
  document.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('modal-overlay')) {
      e.target.style.display = 'none';
    }
  });

  // Détection d'une session expirée : sur une page protégée, on interroge
  // régulièrement /api/session (et au retour sur l'onglet). Dès que la session
  // n'est plus active, on renvoie vers la page de connexion sans attendre que
  // l'utilisateur change de vue.
  (function () {
    var p = window.location.pathname;
    if (p === '/login' || p === '/mot-de-passe-oublie' || p === '/reinitialiser-mot-de-passe') return;
    function verifierSession() {
      fetch('/api/session', { headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : { authenticated: false }; })
        .then(function (d) { if (!d || !d.authenticated) window.location.href = '/login?expired=1'; })
        .catch(function () { /* réseau indisponible : on réessaiera au prochain tick */ });
    }
    setInterval(verifierSession, 60000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) verifierSession();
    });
  })();
})();
