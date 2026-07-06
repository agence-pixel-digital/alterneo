(function () {
  var MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  var DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  var openPopup = null;

  function pad(n) { return String(n).padStart(2, '0'); }
  function isoOf(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function frOf(y, m, d) { return pad(d) + '/' + pad(m + 1) + '/' + y; }

  function closePopup() {
    if (openPopup) { openPopup.remove(); openPopup = null; }
  }

  function buildPopup(field, display, hidden) {
    var today = new Date();
    var parts = hidden.value ? hidden.value.split('-').map(Number) : null;
    var viewYear = parts ? parts[0] : today.getFullYear();
    var viewMonth = parts ? parts[1] - 1 : today.getMonth();

    var popup = document.createElement('div');
    popup.className = 'date-popup';

    function render() {
      popup.innerHTML = '';

      var header = document.createElement('div');
      header.className = 'date-popup-header';
      var prev = document.createElement('button'); prev.type = 'button'; prev.textContent = '‹';
      var title = document.createElement('span'); title.className = 'date-popup-title'; title.textContent = MOIS[viewMonth] + ' ' + viewYear;
      var next = document.createElement('button'); next.type = 'button'; next.textContent = '›';
      prev.onclick = function (e) { e.stopPropagation(); viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } render(); };
      next.onclick = function (e) { e.stopPropagation(); viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } render(); };
      header.appendChild(prev); header.appendChild(title); header.appendChild(next);
      popup.appendChild(header);

      var grid = document.createElement('div');
      grid.className = 'date-popup-grid';
      DOW.forEach(function (d) {
        var el = document.createElement('div'); el.className = 'date-popup-dow'; el.textContent = d;
        grid.appendChild(el);
      });

      var first = new Date(viewYear, viewMonth, 1);
      var startDow = (first.getDay() + 6) % 7;
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

      for (var i = 0; i < startDow; i++) {
        var elPrev = document.createElement('div');
        elPrev.className = 'date-popup-day muted';
        elPrev.textContent = prevMonthDays - startDow + i + 1;
        grid.appendChild(elPrev);
      }

      for (var d = 1; d <= daysInMonth; d++) {
        (function (day) {
          var el = document.createElement('div');
          el.className = 'date-popup-day';
          el.textContent = day;
          var isToday = viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
          var isSelected = hidden.value === isoOf(viewYear, viewMonth, day);
          if (isToday) el.classList.add('today');
          if (isSelected) el.classList.add('selected');
          el.onclick = function (e) {
            e.stopPropagation();
            hidden.value = isoOf(viewYear, viewMonth, day);
            display.value = frOf(viewYear, viewMonth, day);
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
            closePopup();
          };
          grid.appendChild(el);
        })(d);
      }

      var filled = startDow + daysInMonth;
      var remaining = (7 - (filled % 7)) % 7;
      for (var j = 1; j <= remaining; j++) {
        var elNext = document.createElement('div');
        elNext.className = 'date-popup-day muted';
        elNext.textContent = j;
        grid.appendChild(elNext);
      }
      popup.appendChild(grid);

      var footer = document.createElement('div');
      footer.className = 'date-popup-footer';
      var todayBtn = document.createElement('button');
      todayBtn.type = 'button';
      todayBtn.textContent = "Aujourd'hui";
      todayBtn.onclick = function (e) {
        e.stopPropagation();
        hidden.value = isoOf(today.getFullYear(), today.getMonth(), today.getDate());
        display.value = frOf(today.getFullYear(), today.getMonth(), today.getDate());
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
        closePopup();
      };
      footer.appendChild(todayBtn);
      popup.appendChild(footer);
    }

    render();
    field.appendChild(popup);
    return popup;
  }

  function buildMonthPopup(field, display, hidden) {
    var today = new Date();
    var parts = hidden.value ? hidden.value.split('-').map(Number) : null;
    var viewYear = parts ? parts[0] : today.getFullYear();

    var popup = document.createElement('div');
    popup.className = 'date-popup';

    function render() {
      popup.innerHTML = '';

      var header = document.createElement('div');
      header.className = 'date-popup-header';
      var prev = document.createElement('button'); prev.type = 'button'; prev.textContent = '‹';
      var title = document.createElement('span'); title.className = 'date-popup-title'; title.textContent = String(viewYear);
      var next = document.createElement('button'); next.type = 'button'; next.textContent = '›';
      prev.onclick = function (e) { e.stopPropagation(); viewYear--; render(); };
      next.onclick = function (e) { e.stopPropagation(); viewYear++; render(); };
      header.appendChild(prev); header.appendChild(title); header.appendChild(next);
      popup.appendChild(header);

      var grid = document.createElement('div');
      grid.className = 'date-popup-grid month-grid';
      MOIS.forEach(function (nom, idx) {
        var el = document.createElement('div');
        el.className = 'date-popup-day month-cell';
        el.textContent = nom.slice(0, 3);
        var value = viewYear + '-' + pad(idx + 1);
        if (viewYear === today.getFullYear() && idx === today.getMonth()) el.classList.add('today');
        if (hidden.value === value) el.classList.add('selected');
        el.onclick = function (e) {
          e.stopPropagation();
          hidden.value = value;
          display.value = nom + ' ' + viewYear;
          hidden.dispatchEvent(new Event('change', { bubbles: true }));
          closePopup();
        };
        grid.appendChild(el);
      });
      popup.appendChild(grid);
    }

    render();
    field.appendChild(popup);
    return popup;
  }

  function buildRangePopup(field, startDisplay, endDisplay, startHidden, endHidden) {
    var today = new Date();
    var start = startHidden.value || null;
    var end = endHidden.value || null;
    var initial = start ? start.split('-').map(Number) : [today.getFullYear(), today.getMonth() + 1, today.getDate()];
    var viewYear = initial[0], viewMonth = initial[1] - 1;

    var popup = document.createElement('div');
    popup.className = 'date-popup';

    function frOfIso(iso) {
      return frOf(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
    }

    function applyValues() {
      startHidden.value = start || '';
      endHidden.value = end || '';
      startDisplay.value = start ? frOfIso(start) : '';
      endDisplay.value = end ? frOfIso(end) : '';
      startHidden.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function render() {
      popup.innerHTML = '';

      var header = document.createElement('div');
      header.className = 'date-popup-header';
      var prev = document.createElement('button'); prev.type = 'button'; prev.textContent = '‹';
      var title = document.createElement('span'); title.className = 'date-popup-title'; title.textContent = MOIS[viewMonth] + ' ' + viewYear;
      var next = document.createElement('button'); next.type = 'button'; next.textContent = '›';
      prev.onclick = function (e) { e.stopPropagation(); viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } render(); };
      next.onclick = function (e) { e.stopPropagation(); viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } render(); };
      header.appendChild(prev); header.appendChild(title); header.appendChild(next);
      popup.appendChild(header);

      var hint = document.createElement('div');
      hint.style.cssText = 'font-size:11.5px;color:#9AA7B5;margin-bottom:8px;text-align:center;';
      hint.textContent = !start ? 'Choisissez la date de début' : (!end ? 'Choisissez la date de fin' : '');
      if (hint.textContent) popup.appendChild(hint);

      var grid = document.createElement('div');
      grid.className = 'date-popup-grid';
      DOW.forEach(function (d) {
        var el = document.createElement('div'); el.className = 'date-popup-dow'; el.textContent = d;
        grid.appendChild(el);
      });

      var first = new Date(viewYear, viewMonth, 1);
      var startDow = (first.getDay() + 6) % 7;
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

      for (var i = 0; i < startDow; i++) {
        var elPrev = document.createElement('div');
        elPrev.className = 'date-popup-day muted';
        elPrev.textContent = prevMonthDays - startDow + i + 1;
        grid.appendChild(elPrev);
      }

      for (var d = 1; d <= daysInMonth; d++) {
        (function (day) {
          var iso = isoOf(viewYear, viewMonth, day);
          var el = document.createElement('div');
          el.className = 'date-popup-day';
          el.textContent = day;
          var isToday = viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
          if (isToday) el.classList.add('today');
          if (iso === start || iso === end) el.classList.add('selected');
          else if (start && end && iso > start && iso < end) el.classList.add('in-range');
          el.onclick = function (e) {
            e.stopPropagation();
            if (!start || (start && end)) {
              start = iso; end = null;
            } else if (iso < start) {
              start = iso;
            } else {
              end = iso;
            }
            applyValues();
            if (start && end) { closePopup(); } else { render(); }
          };
          grid.appendChild(el);
        })(d);
      }

      var filled = startDow + daysInMonth;
      var remaining = (7 - (filled % 7)) % 7;
      for (var j = 1; j <= remaining; j++) {
        var elNext = document.createElement('div');
        elNext.className = 'date-popup-day muted';
        elNext.textContent = j;
        grid.appendChild(elNext);
      }
      popup.appendChild(grid);
    }

    render();
    field.appendChild(popup);
    return popup;
  }

  document.addEventListener('click', function (e) {
    var rangeDisplay = e.target.closest ? e.target.closest('.range-display') : null;
    if (rangeDisplay) {
      var rangeField = rangeDisplay.closest('.range-field');
      var startDisplay = rangeField.querySelector('.range-start');
      var endDisplay = rangeField.querySelector('.range-end');
      var startHidden = rangeField.querySelector('.range-value-start');
      var endHidden = rangeField.querySelector('.range-value-end');
      if (openPopup && openPopup.parentElement === rangeField) { closePopup(); return; }
      closePopup();
      openPopup = buildRangePopup(rangeField, startDisplay, endDisplay, startHidden, endHidden);
      return;
    }

    var display = e.target.closest ? e.target.closest('.date-display') : null;
    if (display) {
      var field = display.closest('.date-field');
      var isMonth = field.classList.contains('month-field');
      var hidden = field.querySelector(isMonth ? '.month-value' : '.date-value');
      if (openPopup && openPopup.parentElement === field) { closePopup(); return; }
      closePopup();
      openPopup = isMonth ? buildMonthPopup(field, display, hidden) : buildPopup(field, display, hidden);
      return;
    }
    if (!e.target.closest || !e.target.closest('.date-popup')) closePopup();
  });
})();
