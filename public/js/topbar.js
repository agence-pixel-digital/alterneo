(function () {
  function closeSidebar() {
    var sidebar = document.querySelector('.sidebar');
    var backdrop = document.querySelector('.sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.topbar-user-btn') : null;
    var dropdown = document.querySelector('.topbar-dropdown');
    if (dropdown) {
      if (btn) {
        dropdown.classList.toggle('open');
      } else if (!e.target.closest('.topbar-dropdown')) {
        dropdown.classList.remove('open');
      }
    }

    var menuBtn = e.target.closest ? e.target.closest('.mobile-menu-btn') : null;
    if (menuBtn) {
      var sidebar = document.querySelector('.sidebar');
      var backdrop = document.querySelector('.sidebar-backdrop');
      if (sidebar) sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('open');
      return;
    }

    if (e.target.closest && e.target.closest('.sidebar-backdrop')) { closeSidebar(); return; }
    // Un clic sur un lien de la nav referme le menu mobile avant la navigation.
    if (e.target.closest && e.target.closest('.sidebar .nav a')) closeSidebar();
  });
})();
