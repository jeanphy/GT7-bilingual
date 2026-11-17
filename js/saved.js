(function () {
  'use strict';

  var TRANSLATIONS = window.GT7I18n.TRANSLATIONS;
  var Logic = window.GT7Logic;

  var state = Logic.loadSavedAppState();
  var localStrategies = Logic.listSavedStrategies();
  var searchQuery = '';
  var pendingDeleteId = null;

  function t() {
    return TRANSLATIONS[state.language] || TRANSLATIONS.fr;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTimestamp(item) {
    if (!item || !item.updatedAt) return '';
    var ms = new Date(item.updatedAt).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return '';
    try {
      return new Intl.DateTimeFormat(state.language === 'en' ? 'en-US' : 'fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(ms));
    } catch (_e) {
      return new Date(ms).toLocaleDateString();
    }
  }

  function showFeedback(message, kind) {
    var el = document.getElementById('saved-feedback');
    if (!el) return;
    if (!message) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.className = 'inline-feedback ' + (kind === 'ok' ? 'alert-ok' : 'alert-err');
    el.textContent = message;
  }

  function applyThemeAndLanguage() {
    var dict = t();
    var root = document.documentElement;
    root.classList.toggle('dark', state.theme === 'dark');
    root.lang = state.language;
    document.title = dict.savedPageTitle;

    var i18nNodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < i18nNodes.length; i++) {
      var el = i18nNodes[i];
      var key = el.getAttribute('data-i18n');
      if (key && typeof dict[key] === 'string') {
        el.textContent = dict[key];
      }
    }

    document.getElementById('brand-title').textContent = dict.appTitle;
    var searchInput = document.getElementById('saved-search-input');
    if (searchInput) searchInput.placeholder = dict.searchPlaceholder;

    var langBtns = document.querySelectorAll('#lang-switch button');
    for (var li = 0; li < langBtns.length; li++) {
      langBtns[li].classList.toggle('active', langBtns[li].getAttribute('data-lang') === state.language);
    }

    var themeBtns = document.querySelectorAll('#theme-switch button');
    for (var ti = 0; ti < themeBtns.length; ti++) {
      themeBtns[ti].classList.toggle('active', themeBtns[ti].getAttribute('data-theme') === state.theme);
    }
  }

  function getFilteredStrategies() {
    var q = searchQuery.trim().toLowerCase();
    if (!q) return localStrategies;

    return localStrategies.filter(function (item) {
      var haystack = [
        item.title,
        item.trackName,
        item.carName,
        item.carCategory,
        item.summary && item.summary.stintsLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.indexOf(q) !== -1;
    });
  }

  function buildTimelineHtml(item) {
    var dict = t();
    var stints = Array.isArray(item.stints) ? item.stints : [];
    if (stints.length === 0) return '';

    var totalLaps = stints.reduce(function (acc, s) {
      return acc + (Number(s.laps) || 0);
    }, 0);
    totalLaps = Math.max(1, totalLaps);

    var html = '<div class="timeline-bar" style="height:30px">';
    for (var i = 0; i < stints.length; i++) {
      var st = stints[i];
      var comp = dict.compounds[st.compound] ? st.compound : 'medium';
      var shortLabel = dict.compounds[comp].short;
      var pct = Math.max(((Number(st.laps) || 1) / totalLaps) * 100, 7);
      html +=
        '<div class="timeline-segment comp-' + comp + '" style="width:' + pct.toFixed(2) + '%" title="' +
        escapeHtml(dict.compounds[comp].name + ' · ' + dict.lapsWord(st.laps || 1)) + '">' +
        escapeHtml(shortLabel + '·' + (st.laps || 1)) + '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderStrategiesList() {
    var dict = t();
    var container = document.getElementById('saved-strategies-list');
    if (!container) return;

    var items = getFilteredStrategies();
    if (items.length === 0) {
      container.innerHTML =
        '<div class="empty-state">' +
        '<h3 class="panel-title">' + escapeHtml(dict.emptySavedTitle) + '</h3>' +
        '<p class="panel-subtitle">' + escapeHtml(dict.emptySavedDesc) + '</p>' +
        '<a href="./index.html" class="btn btn-primary" style="margin-top:6px">' + escapeHtml(dict.goToPlannerBtn) + '</a>' +
        '</div>';
      return;
    }

    var html = '<div class="saved-grid">';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var trackStr = (item.trackName || dict.unnamedTrackFallback) +
        (typeof item.trackLengthKm === 'number' && item.trackLengthKm > 0
          ? ' (' + item.trackLengthKm.toFixed(3) + ' ' + dict.trackLengthUnit + ')'
          : '');

      var carParts = [];
      if (item.carName) carParts.push(item.carName);
      if (item.carCategory) carParts.push('(' + item.carCategory + ')');
      var bopParts = [];
      if (typeof item.bopPowerHp === 'number' && item.bopPowerHp > 0) bopParts.push(item.bopPowerHp + ' ' + dict.bopPowerUnit);
      if (typeof item.bopWeightKg === 'number' && item.bopWeightKg > 0) bopParts.push(item.bopWeightKg + ' ' + dict.bopWeightUnit);
      var carStr = carParts.length > 0 ? carParts.join(' ') + (bopParts.length > 0 ? ' · BoP: ' + bopParts.join(' / ') : '') : '';

      var raceStr = item.mode === 'laps'
        ? dict.lapsWord(item.totalLaps || 0)
        : Logic.formatDurationMinutes(item.durationMinutes || 60);
      var multStr = '×' + (item.tireWearMultiplier || 1) + ' / ×' + (item.fuelMultiplier || 1);

      var sum = item.summary || {};
      var dateStr = formatTimestamp(item);

      var deleteHtml = pendingDeleteId === item.id
        ? '<button type="button" class="btn btn-danger-outline" data-action="confirm-delete" data-id="' + escapeHtml(item.id) + '">' + escapeHtml(dict.confirmDeleteBtn) + '</button>' +
          '<button type="button" class="btn btn-secondary" data-action="cancel-delete">' + escapeHtml(dict.cancelBtn) + '</button>'
        : '<button type="button" class="btn btn-danger-outline" data-action="ask-delete" data-id="' + escapeHtml(item.id) + '">' + escapeHtml(dict.deleteBtn) + '</button>';

      html +=
        '<article class="saved-card">' +
        '<div class="saved-card-head">' +
        '<div>' +
        '<h3 class="saved-card-title">' + escapeHtml(item.title || trackStr) + '</h3>' +
        (dateStr ? '<div class="saved-card-submeta">' + escapeHtml(dateStr) + '</div>' : '') +
        '</div>' +
        '<span class="source-badge local">' + escapeHtml(dict.badgeLocal) + '</span>' +
        '</div>' +
        '<div class="saved-card-meta">' +
        '<div><strong>' + escapeHtml(dict.navCircuit) + ':</strong> ' + escapeHtml(trackStr) + '</div>' +
        (carStr ? '<div><strong>' + escapeHtml(dict.navCar) + ':</strong> ' + escapeHtml(carStr) + '</div>' : '') +
        '<div><strong>' + escapeHtml(dict.navRace) + ':</strong> <span class="mono">' + escapeHtml(raceStr + ' · ' + multStr) + '</span></div>' +
        '</div>' +
        buildTimelineHtml(item) +
        '<div class="saved-card-kpis">' +
        '<div><div class="stat-label">' + escapeHtml(dict.totalTimeLabel) + '</div><div class="kpi-num mono">' + escapeHtml(Logic.formatRaceTime(sum.totalTimeSeconds || 0)) + '</div></div>' +
        '<div><div class="stat-label">' + escapeHtml(dict.totalLapsLabel) + '</div><div class="kpi-num mono">' + escapeHtml(String(sum.totalLaps || 0)) + '</div></div>' +
        '<div><div class="stat-label">' + escapeHtml(dict.pitStopsLabel) + '</div><div class="kpi-num mono">' + escapeHtml(String(sum.totalStops || 0)) + '</div></div>' +
        '<div><div class="stat-label">' + escapeHtml(dict.totalFuelAddedLabel) + '</div><div class="kpi-num mono">' + escapeHtml((Number(sum.totalFuelAddedLiters) || 0).toFixed(1) + ' L') + '</div></div>' +
        '</div>' +
        '<div class="saved-card-actions">' +
        '<div class="saved-card-actions-left">' +
        '<button type="button" class="btn btn-primary" data-action="load" data-id="' + escapeHtml(item.id) + '">' + escapeHtml(dict.loadInPlannerBtn) + '</button>' +
        '</div>' +
        '<div class="saved-card-actions-right">' + deleteHtml + '</div>' +
        '</div>' +
        '</article>';
    }
    html += '</div>';

    container.innerHTML = html;
  }

  function findItem(id) {
    for (var i = 0; i < localStrategies.length; i++) {
      if (localStrategies[i].id === id) return localStrategies[i];
    }
    return null;
  }

  function bindListeners() {
    var langBtns = document.querySelectorAll('#lang-switch button');
    for (var i = 0; i < langBtns.length; i++) {
      langBtns[i].addEventListener('click', function (ev) {
        state.language = ev.currentTarget.getAttribute('data-lang') === 'en' ? 'en' : 'fr';
        Logic.saveAppState(state);
        applyThemeAndLanguage();
        renderStrategiesList();
      });
    }

    var themeBtns = document.querySelectorAll('#theme-switch button');
    for (var ti = 0; ti < themeBtns.length; ti++) {
      themeBtns[ti].addEventListener('click', function (ev) {
        state.theme = ev.currentTarget.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        Logic.saveAppState(state);
        applyThemeAndLanguage();
      });
    }

    var searchInput = document.getElementById('saved-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function (ev) {
        searchQuery = ev.currentTarget.value;
        renderStrategiesList();
      });
    }

    var listContainer = document.getElementById('saved-strategies-list');
    if (listContainer) {
      listContainer.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button[data-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-action');
        var id = btn.getAttribute('data-id');

        if (action === 'load') {
          var item = findItem(id);
          if (item) {
            Logic.applySavedStrategyToPlanner(item, state.language, state.theme);
            window.location.href = './index.html#step-7';
          }
        } else if (action === 'ask-delete') {
          pendingDeleteId = id;
          renderStrategiesList();
        } else if (action === 'cancel-delete') {
          pendingDeleteId = null;
          renderStrategiesList();
        } else if (action === 'confirm-delete') {
          pendingDeleteId = null;
          localStrategies = Logic.deleteLocalStrategy(id);
          showFeedback(t().deletedOk, 'ok');
          renderStrategiesList();
        }
      });
    }
  }

  applyThemeAndLanguage();
  bindListeners();
  renderStrategiesList();
})();
