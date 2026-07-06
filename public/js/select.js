(function () {
  var openPopup = null;

  function closePopup() {
    if (openPopup) { openPopup.classList.remove('open'); openPopup = null; }
  }

  document.addEventListener('click', function (e) {
    var display = e.target.closest ? e.target.closest('.select-display') : null;
    if (display) {
      var popup = display.closest('.select-field').querySelector('.select-popup');
      if (openPopup === popup) { closePopup(); return; }
      closePopup();
      popup.classList.add('open');
      openPopup = popup;
      return;
    }

    var option = e.target.closest ? e.target.closest('.select-option') : null;
    if (option) {
      var field = option.closest('.select-field');
      var hidden = field.querySelector('.select-value');
      var label = field.querySelector('.select-label');
      hidden.value = option.dataset.value;
      label.textContent = option.dataset.label;
      field.querySelectorAll('.select-option').forEach(function (o) { o.classList.remove('selected'); });
      option.classList.add('selected');
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
      closePopup();
      return;
    }

    if (!e.target.closest || !e.target.closest('.select-popup')) closePopup();
  });
})();
