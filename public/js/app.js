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
})();
