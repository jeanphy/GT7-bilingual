(function () {
  'use strict';

  var TRANSLATIONS = window.GT7I18n.TRANSLATIONS;
  var Logic = window.GT7Logic;
  var Db = window.GT7Db;

  var state = Logic.loadSavedAppState();
  var sharedStrategies = [];
  var localStrategies = Db ? Db.listLocalStrategies() : [];
  var loadingShared = true;
  var sharedLoadError = false;
  var activeFilter = 'all';
  var searchQuery = '';
  var pendingDeleteKey = null;
  var unsubscribeShared = null;

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
    var ms = 0;
    if (typeof item.updatedAtMs === 'number' && item.updatedAtMs > 0) {
      ms = item.updatedAtMs;
    } else if (item.updatedAt && typeof item.updatedAt.toMillis === 'function') {
      ms = item.updatedAt.toMillis();
    } else if (typeof item.updatedAt === 'string') {
      ms = new Date(item.updatedAt).getTime() || 0;
    }
    if (!ms) return '';
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

    renderAuthStatus(Db ? Db.getCurrentUser() : null);
  }

  function renderStorageModeCards() {
    var mode = Db ? Db.getStorageMode() : 'local';
    var sharedCard = document.getElementById('db-opt-shared-card');
    var localCard = document.getElementById('db-opt-local-card');
    if (sharedCard) {
      sharedCard.classList.toggle('active', mode === 'shared');
      var r1 = sharedCard.querySelector('input[type="radio"]');
      if (r1) r1.checked = mode === 'shared';
    }
    if (localCard) {
      localCard.classList.toggle('active', mode === 'local');
      var r2 = localCard.querySelector('input[type="radio"]');
      if (r2) r2.checked = mode === 'local';
    }
  }

  function renderAuthStatus(user) {
    var dict = t();
    var dot = document.getElementById('saved-auth-dot');
    var statusEl = document.getElementById('saved-auth-status');
    var btn = document.getElementById('saved-auth-btn');
    if (!dot || !statusEl || !btn) return;

    if (user) {
      dot.classList.add('online');
      statusEl.textContent = dict.signedInAs + ' ' + (user.displayName || 'Google');
      btn.textContent = dict.signOutBtn;
    } else {
      dot.classList.remove('online');
      statusEl.textContent = dict.sharedDbPublicHint;
      btn.textContent = dict.signInGoogleBtn;
    }
  }

  function getFilteredStrategies() {
    var combined = [];
    if (activeFilter === 'all' || activeFilter === 'shared') {
      combined = combined.concat(sharedStrategies);
    }
    if (activeFilter === 'all' || activeFilter === 'local') {
      combined = combined.concat(localStrategies);
    }

    var q = searchQuery.trim().toLowerCase();
    if (!q) return combined;

    return combined.filter(function (item) {
      var haystack = [
        item.title,
        item.trackName,
        item.carName,
        item.carCategory,
        item.authorName,
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

    var currentUser = Db ? Db.getCurrentUser() : null;
    var items = getFilteredStrategies();
    var html = '';

    if (loadingShared && (activeFilter === 'all' || activeFilter === 'shared')) {
      html += '<p class="field-hint" style="margin-bottom:12px">' + escapeHtml(dict.loadingShared) + '</p>';
    }
    if (sharedLoadError && (activeFilter === 'all' || activeFilter === 'shared')) {
      html += '<div class="alert-box alert-warn" style="margin-top:0;margin-bottom:14px">' + escapeHtml(dict.sharedErrorLoading) + '</div>';
    }

    if (items.length === 0) {
      html +=
        '<div class="empty-state">' +
        '<h3 class="panel-title">' + escapeHtml(dict.emptySavedTitle) + '</h3>' +
        '<p class="panel-subtitle">' + escapeHtml(dict.emptySavedDesc) + '</p>' +
        '<a href="./index.html" class="btn btn-primary" style="margin-top:6px">' + escapeHtml(dict.goToPlannerBtn) + '</a>' +
        '</div>';
      container.innerHTML = html;
      return;
    }

    html += '<div class="saved-grid">';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var key = item.source + ':' + item.id;
      var isShared = item.source === 'shared';
      var canDelete = !isShared || (currentUser && item.authorUid === currentUser.uid);

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
      var daysLeft = Db ? Db.getDaysRemaining(item) : 10;
      var expiryStr = dict.expiresInWord(daysLeft);
      var metaParts = [];
      if (isShared) metaParts.push(dict.authorBy + ' ' + (item.authorName || 'GT7 Driver'));
      if (dateStr) metaParts.push(dateStr);
      metaParts.push(expiryStr);
      var authorMeta = metaParts.join(' · ');

      var deleteHtml = '';
      if (canDelete) {
        if (pendingDeleteKey === key) {
          deleteHtml =
            '<button type="button" class="btn btn-danger-outline" data-action="confirm-delete" data-source="' + item.source + '" data-id="' + escapeHtml(item.id) + '">' + escapeHtml(dict.confirmDeleteBtn) + '</button>' +
            '<button type="button" class="btn btn-secondary" data-action="cancel-delete">' + escapeHtml(dict.cancelBtn) + '</button>';
        } else {
          deleteHtml =
            '<button type="button" class="btn btn-danger-outline" data-action="ask-delete" data-key="' + escapeHtml(key) + '">' + escapeHtml(dict.deleteBtn) + '</button>';
        }
      }

      html +=
        '<article class="saved-card">' +
        '<div class="saved-card-head">' +
        '<div>' +
        '<h3 class="saved-card-title">' + escapeHtml(item.title || trackStr) + '</h3>' +
        (authorMeta ? '<div class="saved-card-submeta">' + escapeHtml(authorMeta) + '</div>' : '') +
        '</div>' +
        '<span class="source-badge ' + (isShared ? 'shared' : 'local') + '">' +
        escapeHtml(isShared ? dict.badgeShared : dict.badgeLocal) + '</span>' +
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
        '<button type="button" class="btn btn-primary" data-action="load" data-source="' + item.source + '" data-id="' + escapeHtml(item.id) + '">' + escapeHtml(dict.loadInPlannerBtn) + '</button>' +
        (!isShared
          ? '<button type="button" class="btn btn-secondary" data-action="publish" data-id="' + escapeHtml(item.id) + '">' + escapeHtml(dict.publishToDbBtn) + '</button>'
          : '') +
        '</div>' +
        '<div class="saved-card-actions-right">' + deleteHtml + '</div>' +
        '</div>' +
        '</article>';
    }
    html += '</div>';

    container.innerHTML = html;
  }

  function findItem(source, id) {
    var list = source === 'shared' ? sharedStrategies : localStrategies;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
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

    var modeRadios = document.querySelectorAll('input[name="storage-mode"]');
    for (var mr = 0; mr < modeRadios.length; mr++) {
      modeRadios[mr].addEventListener('change', function (ev) {
        if (Db) {
          Db.setStorageMode(ev.currentTarget.value);
          renderStorageModeCards();
        }
      });
    }

    var authBtn = document.getElementById('saved-auth-btn');
    if (authBtn && Db) {
      authBtn.addEventListener('click', async function () {
        showFeedback('', 'ok');
        try {
          if (Db.getCurrentUser()) {
            await Db.signOutUser();
          } else {
            await Db.signInWithGoogle();
          }
        } catch (_err) {
          showFeedback(t().saveErrorAuth, 'err');
        }
      });
    }

    var searchInput = document.getElementById('saved-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function (ev) {
        searchQuery = ev.currentTarget.value;
        renderStrategiesList();
      });
    }

    var filterBtns = document.querySelectorAll('#source-filter-switch button');
    for (var fb = 0; fb < filterBtns.length; fb++) {
      filterBtns[fb].addEventListener('click', function (ev) {
        activeFilter = ev.currentTarget.getAttribute('data-filter') || 'all';
        for (var k = 0; k < filterBtns.length; k++) {
          var active = filterBtns[k] === ev.currentTarget;
          filterBtns[k].classList.toggle('active', active);
          filterBtns[k].setAttribute('aria-selected', active ? 'true' : 'false');
        }
        renderStrategiesList();
      });
    }

    var listContainer = document.getElementById('saved-strategies-list');
    if (listContainer) {
      listContainer.addEventListener('click', async function (ev) {
        var btn = ev.target.closest('button[data-action]');
        if (!btn || !Db) return;
        var action = btn.getAttribute('data-action');
        var source = btn.getAttribute('data-source');
        var id = btn.getAttribute('data-id');

        if (action === 'load') {
          var item = findItem(source, id);
          if (item) {
            Db.applySavedStrategyToPlanner(item, state.language, state.theme);
            window.location.href = './index.html#step-7';
          }
        } else if (action === 'publish') {
          var localItem = findItem('local', id);
          if (!localItem) return;
          btn.disabled = true;
          btn.textContent = t().publishingBtn;
          showFeedback('', 'ok');
          try {
            await Db.publishLocalToShared(localItem);
            showFeedback(t().publishedOk, 'ok');
          } catch (err) {
            var msg = err instanceof Error ? err.message : String(err);
            if (msg.indexOf('SHARED_DB_UNAVAILABLE') !== -1) {
              showFeedback(t().saveErrorUnavailable, 'err');
            } else if (msg.indexOf('AUTH_REQUIRED') !== -1 || msg.indexOf('popup') !== -1 || msg.indexOf('auth/') !== -1) {
              showFeedback(t().saveErrorAuth, 'err');
            } else {
              showFeedback(t().saveErrorGeneric, 'err');
            }
          } finally {
            btn.disabled = false;
            btn.textContent = t().publishToDbBtn;
          }
        } else if (action === 'ask-delete') {
          pendingDeleteKey = btn.getAttribute('data-key');
          renderStrategiesList();
        } else if (action === 'cancel-delete') {
          pendingDeleteKey = null;
          renderStrategiesList();
        } else if (action === 'confirm-delete') {
          pendingDeleteKey = null;
          showFeedback('', 'ok');
          if (source === 'local') {
            localStrategies = Db.deleteLocalStrategy(id);
            showFeedback(t().deletedOk, 'ok');
            renderStrategiesList();
          } else if (source === 'shared') {
            try {
              await Db.deleteSharedStrategy(id);
              showFeedback(t().deletedOk, 'ok');
            } catch (_err) {
              showFeedback(t().deleteErrorGeneric, 'err');
            }
          }
        }
      });
    }
  }

  applyThemeAndLanguage();
  renderStorageModeCards();
  bindListeners();
  renderStrategiesList();

  if (Db) {
    Db.onAuthChange(function (user) {
      renderAuthStatus(user);
      renderStrategiesList();
    });

    Db.init().then(function (available) {
      renderAuthStatus(Db.getCurrentUser());
      if (!available) {
        loadingShared = false;
        renderStrategiesList();
        return;
      }
      Db.subscribeSharedStrategies(
        function (items) {
          loadingShared = false;
          sharedLoadError = false;
          sharedStrategies = items;
          renderStrategiesList();
        },
        function () {
          loadingShared = false;
          sharedLoadError = true;
          renderStrategiesList();
        }
      ).then(function (unsub) {
        unsubscribeShared = unsub;
      });
    });
  } else {
    loadingShared = false;
    renderStrategiesList();
  }

  window.addEventListener('beforeunload', function () {
    if (typeof unsubscribeShared === 'function') unsubscribeShared();
  });
})();
