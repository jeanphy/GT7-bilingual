(function () {
  'use strict';

  var TRANSLATIONS = window.GT7I18n.TRANSLATIONS;
  var Logic = window.GT7Logic;
  var Strategy = window.GT7Strategy;
  var Db = window.GT7Db;
  var COMPOUND_ORDER = Logic.COMPOUND_ORDER;

  var state = Logic.loadSavedAppState();
  var customStints = Logic.loadActiveCustomStints();
  var lastActiveEval = null;
  var lastEditedStints = null;

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

  function strategyToStintInputs(strategy) {
    if (!strategy || !strategy.stints || strategy.stints.length === 0) {
      return [{ id: 'default-0', compound: 'medium', laps: 10, changeTires: true }];
    }
    return strategy.stints.map(function (s, idx) {
      return {
        id: 'stint-' + idx,
        compound: s.compound,
        laps: s.laps,
        changeTires: s.changeTires,
      };
    });
  }

  function applyThemeAndLanguage() {
    var dict = t();
    var root = document.documentElement;
    root.classList.toggle('dark', state.theme === 'dark');
    root.lang = state.language;
    document.title = dict.documentTitle;

    var nav = document.getElementById('top-nav');
    if (nav) nav.setAttribute('aria-label', dict.stepsNavAria);

    var i18nNodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < i18nNodes.length; i++) {
      var el = i18nNodes[i];
      var key = el.getAttribute('data-i18n');
      if (key && typeof dict[key] === 'string') {
        el.textContent = dict[key];
      }
    }

    document.getElementById('brand-title').textContent = dict.appTitle;
    document.getElementById('track-name-input').placeholder = dict.trackNamePlaceholder;
    document.getElementById('track-length-input').placeholder = dict.trackLengthPlaceholder;
    document.getElementById('track-length-label-text').textContent =
      dict.trackLengthLabel + ' (' + dict.trackLengthUnit + ')';

    document.getElementById('car-name-input').placeholder = dict.carNamePlaceholder;
    document.getElementById('car-category-input').placeholder = dict.carCategoryPlaceholder;
    document.getElementById('car-bop-power-label-text').textContent =
      dict.bopPowerLabel + ' (' + dict.bopPowerUnit + ')';
    document.getElementById('car-bop-power-input').placeholder = dict.bopPowerPlaceholder;
    document.getElementById('car-bop-weight-label-text').textContent =
      dict.bopWeightLabel + ' (' + dict.bopWeightUnit + ')';
    document.getElementById('car-bop-weight-input').placeholder = dict.bopWeightPlaceholder;
    var saveTitleInput = document.getElementById('save-strategy-title');
    if (saveTitleInput) saveTitleInput.placeholder = dict.saveTitlePlaceholder;

    var langBtns = document.querySelectorAll('#lang-switch button');
    for (var li = 0; li < langBtns.length; li++) {
      langBtns[li].classList.toggle('active', langBtns[li].getAttribute('data-lang') === state.language);
    }

    var themeBtns = document.querySelectorAll('#theme-switch button');
    for (var ti = 0; ti < themeBtns.length; ti++) {
      themeBtns[ti].classList.toggle('active', themeBtns[ti].getAttribute('data-theme') === state.theme);
    }

    renderSaveAuthStatus(Db ? Db.getCurrentUser() : null);
  }

  function renderSaveAuthStatus(user) {
    var dict = t();
    var authRow = document.getElementById('save-auth-row');
    var targetSelect = document.getElementById('save-target-select');
    var dot = document.getElementById('save-auth-dot');
    var statusEl = document.getElementById('save-auth-status');
    var btn = document.getElementById('save-auth-btn');
    if (!authRow || !targetSelect || !dot || !statusEl || !btn) return;

    var isShared = targetSelect.value === 'shared';
    authRow.classList.toggle('hidden', !isShared);
    if (!isShared) return;

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

  function showSaveFeedback(message, kind) {
    var el = document.getElementById('save-feedback');
    if (!el) return;
    if (!message) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.className = 'inline-feedback ' + (kind === 'ok' ? 'alert-ok' : 'alert-err');
    el.textContent = message;
  }

  function syncInputsFromState() {
    var cfg = state.config;
    var car = cfg.car || {};
    document.getElementById('track-name-input').value = cfg.trackName;
    document.getElementById('track-length-input').value = cfg.trackLengthInput;
    document.getElementById('duration-input').value = cfg.durationInput;
    document.getElementById('laps-input').value = String(cfg.totalLaps);
    document.getElementById('car-name-input').value = car.name || '';
    document.getElementById('car-category-input').value = car.category || '';
    document.getElementById('car-bop-power-input').value = car.bopPowerHp !== null && car.bopPowerHp !== undefined ? String(car.bopPowerHp) : '';
    document.getElementById('car-bop-weight-input').value = car.bopWeightKg !== null && car.bopWeightKg !== undefined ? String(car.bopWeightKg) : '';
    document.getElementById('pit-transit-input').value = String(cfg.pitFuel.pitTransitSeconds);
    document.getElementById('tire-change-input').value = String(cfg.pitFuel.tireChangeSeconds);
    document.getElementById('refuel-rate-input').value = String(cfg.pitFuel.refuelRateLps);
    document.getElementById('fuel-per-lap-input').value = String(cfg.pitFuel.fuelPerLapLiters);
    document.getElementById('fuel-margin-input').value = String(cfg.pitFuel.fuelMarginLaps);
    var ri = cfg.raceInfo || { tireWearMultiplier: 1, fuelMultiplier: 1 };
    document.getElementById('tire-wear-mult-input').value = String(ri.tireWearMultiplier);
    document.getElementById('fuel-mult-input').value = String(ri.fuelMultiplier);

    buildTiresTable();
  }

  function buildTiresTable() {
    var dict = t();
    var tbody = document.getElementById('tires-table-body');
    tbody.innerHTML = '';

    for (var i = 0; i < COMPOUND_ORDER.length; i++) {
      var id = COMPOUND_ORDER[i];
      var tire = state.config.tires[id];
      var label = dict.compounds[id];

      var tr = document.createElement('tr');
      tr.setAttribute('data-compound-row', id);
      if (!tire.enabled) tr.className = 'tire-row-disabled';

      tr.innerHTML =
        '<td><input type="checkbox" class="checkbox" data-tire-field="enabled" data-compound="' + id + '" ' +
        (tire.enabled ? 'checked' : '') + ' aria-label="' + escapeHtml(dict.activeCol + ' ' + label.name) + '" /></td>' +
        '<td><div class="compound-cell"><span class="compound-badge comp-' + id + '">' + escapeHtml(label.short) +
        '</span><span>' + escapeHtml(label.name) + '</span></div></td>' +
        '<td><input type="text" class="input mono compact-input" data-tire-field="lapTimeInput" data-compound="' + id + '" value="' +
        escapeHtml(tire.lapTimeInput) + '" ' + (tire.enabled ? '' : 'disabled') +
        ' aria-label="' + escapeHtml(dict.lapTimeCol + ' ' + label.name) + '" /></td>' +
        '<td><input type="number" min="1" max="200" step="1" class="input mono small-num-input" data-tire-field="maxLaps" data-compound="' + id + '" value="' +
        tire.maxLaps + '" ' + (tire.enabled ? '' : 'disabled') +
        ' aria-label="' + escapeHtml(dict.maxLapsCol + ' ' + label.name) + '" /></td>' +
        '<td class="center-col"><input type="checkbox" class="checkbox" data-tire-field="mandatory" data-compound="' + id + '" ' +
        (tire.mandatory ? 'checked' : '') + ' aria-label="' + escapeHtml(dict.mandatoryCol + ' ' + label.name) + '" /></td>' +
        '<td class="num-col mono" data-tire-window="' + id + '">—</td>';

      tbody.appendChild(tr);
    }
  }

  function renderIssueText(issue) {
    var dict = t();
    var stintNum = (issue.stintIndex || 0) + 1;
    var compName = issue.compound ? dict.compounds[issue.compound].name : '';
    switch (issue.code) {
      case 'NO_ACTIVE_TIRES':
        return dict.issueMessages.NO_ACTIVE_TIRES();
      case 'INVALID_FUEL_PER_LAP':
        return dict.issueMessages.INVALID_FUEL_PER_LAP();
      case 'STINT_EXCEEDS_TANK':
        return dict.issueMessages.STINT_EXCEEDS_TANK(stintNum, issue.detail || '?');
      case 'TIRE_SET_EXCEEDED': {
        var parts = (issue.detail || '0/0').split('/');
        return dict.issueMessages.TIRE_SET_EXCEEDED(
          stintNum,
          parseInt(parts[0], 10) || 0,
          parseInt(parts[1], 10) || 0
        );
      }
      case 'MANDATORY_COMPOUND_MISSING':
        return dict.issueMessages.MANDATORY_COMPOUND_MISSING(compName);
      case 'COMPOUND_DISABLED':
        return dict.issueMessages.COMPOUND_DISABLED(stintNum, compName);
      case 'LAPS_MISMATCH': {
        var lParts = (issue.detail || '0/0').split('/');
        return dict.issueMessages.LAPS_MISMATCH(
          parseInt(lParts[0], 10) || 0,
          parseInt(lParts[1], 10) || 0
        );
      }
      case 'DURATION_NOT_REACHED': {
        var dParts = (issue.detail || '—/—').split('/');
        return dict.issueMessages.DURATION_NOT_REACHED(
          dParts[0],
          dParts[1] || Logic.formatDurationMinutes(state.config.durationMinutes)
        );
      }
      case 'DURATION_OVERSHOT_EXTRA_LAP':
        return dict.issueMessages.DURATION_OVERSHOT_EXTRA_LAP(stintNum);
      case 'ZERO_LAPS_STINT':
        return dict.issueMessages.ZERO_LAPS_STINT(stintNum);
      default:
        return issue.code;
    }
  }

  function renderAllDynamicOutputs() {
    var dict = t();
    var cfg = state.config;

    // Circuit validation UI
    var nameMissing = cfg.trackName.trim().length === 0;
    var lengthMissing = cfg.trackLengthKm === null || cfg.trackLengthKm <= 0;
    var circuitStatus = document.getElementById('circuit-status');
    circuitStatus.textContent = !nameMissing && !lengthMissing ? dict.circuitConfigured : dict.circuitFieldsRequired;
    circuitStatus.className = 'status-text ' + (!nameMissing && !lengthMissing ? 'status-ok' : 'status-warn');

    document.getElementById('track-name-input').classList.toggle('warn-border', nameMissing);
    document.getElementById('track-name-error').classList.toggle('hidden', !nameMissing);
    document.getElementById('track-length-input').classList.toggle('warn-border', lengthMissing);
    document.getElementById('track-length-error').classList.toggle('hidden', !lengthMissing);

    // Car validation UI
    var car = cfg.car || { name: '', category: '', bopPowerHp: null, bopWeightKg: null };
    var carNameMissing = (car.name || '').trim().length === 0;
    var carCategoryMissing = (car.category || '').trim().length === 0;
    var carStatus = document.getElementById('car-status');
    carStatus.textContent = !carNameMissing && !carCategoryMissing ? dict.carConfigured : dict.carFieldsRequired;
    carStatus.className = 'status-text ' + (!carNameMissing && !carCategoryMissing ? 'status-ok' : 'status-warn');

    document.getElementById('car-name-input').classList.toggle('warn-border', carNameMissing);
    document.getElementById('car-name-error').classList.toggle('hidden', !carNameMissing);
    document.getElementById('car-category-input').classList.toggle('warn-border', carCategoryMissing);
    document.getElementById('car-category-error').classList.toggle('hidden', !carCategoryMissing);

    // Race mode panels
    var modeBtns = document.querySelectorAll('#race-mode-switch button');
    for (var mi = 0; mi < modeBtns.length; mi++) {
      var isActiveMode = modeBtns[mi].getAttribute('data-mode') === cfg.mode;
      modeBtns[mi].classList.toggle('active', isActiveMode);
      modeBtns[mi].setAttribute('aria-selected', isActiveMode ? 'true' : 'false');
    }
    document.getElementById('race-duration-panel').classList.toggle('hidden', cfg.mode !== 'duration');
    document.getElementById('race-laps-panel').classList.toggle('hidden', cfg.mode !== 'laps');
    document.getElementById('duration-input').classList.toggle('invalid', Logic.parseDurationMinutes(cfg.durationInput) === null);

    // Fuel summary
    var ri = cfg.raceInfo || { tireWearMultiplier: 1, fuelMultiplier: 1 };
    var fuelPerLap = cfg.pitFuel.fuelPerLapLiters;
    var maxFuelLaps = fuelPerLap > 0 ? Math.floor(Logic.TANK_CAPACITY_LITERS / fuelPerLap) : 0;
    var fullRefuel = cfg.pitFuel.refuelRateLps > 0 ? Logic.TANK_CAPACITY_LITERS / cfg.pitFuel.refuelRateLps : 0;
    document.getElementById('fuel-autonomy-value').textContent =
      dict.lapsWord(maxFuelLaps) + ' · ' + dict.fullTankRefuelTimeLabel + ': ' + fullRefuel.toFixed(1) + 's';

    // Tire window column updates (without touching inputs)
    for (var ti = 0; ti < COMPOUND_ORDER.length; ti++) {
      var cid = COMPOUND_ORDER[ti];
      var tire = cfg.tires[cid];
      var row = document.querySelector('tr[data-compound-row="' + cid + '"]');
      if (row) row.classList.toggle('tire-row-disabled', !tire.enabled);
      var winCell = document.querySelector('[data-tire-window="' + cid + '"]');
      if (winCell) {
        winCell.textContent = tire.enabled ? Math.min(tire.maxLaps, maxFuelLaps) + ' / ' + tire.maxLaps : '—';
      }
      var timeInput = document.querySelector('input[data-tire-field="lapTimeInput"][data-compound="' + cid + '"]');
      if (timeInput) {
        timeInput.disabled = !tire.enabled;
        timeInput.classList.toggle('invalid', tire.enabled && tire.lapTimeSeconds === null);
      }
      var maxInput = document.querySelector('input[data-tire-field="maxLaps"][data-compound="' + cid + '"]');
      if (maxInput) maxInput.disabled = !tire.enabled;
    }

    // Run optimizer & active strategy evaluation
    var optimizerResult = Strategy.findOptimalStrategies(cfg);
    var optimal = optimizerResult.best;
    var optimalStints = strategyToStintInputs(optimal);
    var editedStints = customStints || optimalStints;
    var isCustomEdited = customStints !== null;
    var activeEval = Strategy.evaluateStrategy(cfg, editedStints);
    lastActiveEval = activeEval;
    lastEditedStints = editedStints;

    // Step 2 live stats
    document.getElementById('parsed-duration-value').textContent =
      Logic.formatDurationMinutes(cfg.durationMinutes) + ' (' + Math.round(cfg.durationMinutes) + ' min)';

    var estLaps = optimal ? optimal.totalLaps : null;
    document.getElementById('estimated-laps-value').textContent =
      estLaps !== null
        ? cfg.trackLengthKm !== null
          ? dict.lapsWord(estLaps) + ' · ' + (estLaps * cfg.trackLengthKm).toFixed(1) + ' ' + dict.trackLengthUnit
          : dict.lapsWord(estLaps)
        : '—';

    document.getElementById('total-distance-value').textContent =
      cfg.trackLengthKm !== null
        ? (cfg.totalLaps * cfg.trackLengthKm).toFixed(2) + ' ' + dict.trackLengthUnit
        : '—';

    // Apply Optimal button visibility
    var applyOptBtn = document.getElementById('apply-optimal-btn');
    applyOptBtn.classList.toggle('hidden', !(optimal && isCustomEdited));

    // Print summary header
    var trackLabel = cfg.trackName.trim() || dict.unnamedTrackFallback;
    var trackLenStr = cfg.trackLengthKm !== null ? ' (' + cfg.trackLengthKm.toFixed(3) + ' ' + dict.trackLengthUnit + ')' : '';
    var raceStr = cfg.mode === 'duration' ? Logic.formatDurationMinutes(cfg.durationMinutes) : dict.lapsWord(cfg.totalLaps);
    var carLabel = (car.name || '').trim() || dict.unnamedCarFallback;
    var carCatStr = (car.category || '').trim() ? ' (' + car.category.trim() + ')' : '';
    var bopParts = [];
    if (car.bopPowerHp !== null) bopParts.push(car.bopPowerHp + ' ' + dict.bopPowerUnit);
    if (car.bopWeightKg !== null) bopParts.push(car.bopWeightKg + ' ' + dict.bopWeightUnit);
    var bopStr = bopParts.length > 0 ? ' · BoP: ' + bopParts.join(' / ') : '';

    document.getElementById('print-race-summary').innerHTML =
      '<div><strong>' + escapeHtml(dict.trackNameLabel) + ':</strong> ' + escapeHtml(trackLabel + trackLenStr) + '</div>' +
      '<div><strong>' + escapeHtml(dict.navCar) + ':</strong> ' + escapeHtml(carLabel + carCatStr + bopStr) + '</div>' +
      '<div><strong>' + escapeHtml(dict.navRace) + ':</strong> <span class="mono">' + escapeHtml(raceStr) +
      ' · ×' + ri.tireWearMultiplier + ' / ×' + ri.fuelMultiplier + '</span></div>' +
      '<div><strong>' + escapeHtml(dict.navPitFuel) + ':</strong> <span class="mono">' +
      cfg.pitFuel.pitTransitSeconds + 's + ' + cfg.pitFuel.tireChangeSeconds + 's · ' +
      cfg.pitFuel.refuelRateLps + ' L/s · ' + cfg.pitFuel.fuelPerLapLiters + ' L' + escapeHtml(dict.perLapShort) +
      '</span></div>';

    // Delta vs optimal text
    var deltaText = '—';
    var deltaClass = 'status-ok';
    if (optimal) {
      if (!isCustomEdited) {
        deltaText = dict.identicalToOptimal;
        deltaClass = 'status-ok';
      } else {
        var lapDiff = activeEval.totalLaps - optimal.totalLaps;
        var timeDiff = activeEval.totalTimeSeconds - optimal.totalTimeSeconds;
        if (cfg.mode === 'duration' && lapDiff !== 0) {
          deltaText = (lapDiff > 0 ? '+' + lapDiff : String(lapDiff)) + ' ' + (lapDiff > 0 ? dict.moreLaps : dict.fewerLaps);
          deltaClass = activeEval.isValid ? 'status-warn' : 'status-err';
        } else if (Math.abs(timeDiff) < 0.05) {
          deltaText = dict.identicalToOptimal;
          deltaClass = 'status-ok';
        } else {
          var absStr = Math.abs(timeDiff).toFixed(1) + 's';
          deltaText = timeDiff < 0 ? '-' + absStr + ' (' + dict.fasterBy + ')' : '+' + absStr + ' (' + dict.slowerBy + ')';
          deltaClass = activeEval.isValid ? 'status-warn' : 'status-err';
        }
      }
    }

    // Build Step 5 HTML
    var html = '';

    if (!optimal) {
      html += '<div class="alert-box alert-warn" style="margin-bottom: 12px">' + escapeHtml(dict.noValidStrategy) + '</div>';
    }

    html +=
      '<div class="kpi-grid">' +
      '<div><div class="stat-label">' + escapeHtml(dict.totalTimeLabel) + '</div>' +
      '<div class="kpi-value mono">' + escapeHtml(Logic.formatRaceTime(activeEval.totalTimeSeconds)) + '</div>' +
      (optimal && isCustomEdited
        ? '<div class="stat-sub mono">' + escapeHtml(dict.optimalShort) + ': ' + escapeHtml(Logic.formatRaceTime(optimal.totalTimeSeconds)) + '</div>'
        : '') +
      '</div>' +
      '<div><div class="stat-label">' + escapeHtml(dict.totalLapsLabel) + '</div>' +
      '<div class="kpi-value mono">' + escapeHtml(dict.lapsWord(activeEval.totalLaps)) + '</div>' +
      (optimal && isCustomEdited
        ? '<div class="stat-sub mono">' + escapeHtml(dict.optimalShort) + ': ' + escapeHtml(dict.lapsWord(optimal.totalLaps)) + '</div>'
        : '') +
      '</div>' +
      '<div><div class="stat-label">' + escapeHtml(dict.pitStopsLabel) + '</div>' +
      '<div class="kpi-value mono">' + escapeHtml(dict.stopsWord(activeEval.totalStops)) + '</div>' +
      '<div class="stat-sub mono">' + activeEval.totalPitSeconds.toFixed(1) + 's ' + escapeHtml(dict.pitShort) + '</div>' +
      '</div>' +
      '<div><div class="stat-label">' + escapeHtml(dict.totalFuelAddedLabel) + '</div>' +
      '<div class="kpi-value mono">' + activeEval.totalFuelAddedLiters.toFixed(1) + ' L</div>' +
      '<div class="stat-sub mono">' + activeEval.totalFuelUsedLiters.toFixed(1) + ' L ' + escapeHtml(dict.usedShort) + '</div>' +
      '</div>' +
      '<div><div class="stat-label">' + escapeHtml(dict.deltaVsOptimalLabel) + '</div>' +
      '<div class="kpi-value mono ' + deltaClass + '" style="font-size: 0.95rem">' + escapeHtml(deltaText) + '</div>' +
      '</div>' +
      '</div>';

    // Validation banner
    if (activeEval.isValid) {
      html += '<div class="alert-box alert-ok">' + escapeHtml(dict.validationOk) + '</div>';
    } else {
      html += '<div class="alert-box alert-err"><ul>';
      for (var ii = 0; ii < activeEval.issues.length; ii++) {
        html += '<li>' + escapeHtml(renderIssueText(activeEval.issues[ii])) + '</li>';
      }
      html += '</ul></div>';
    }

    // Visual Stint Timeline
    if (activeEval.stints.length > 0) {
      var totalBarLaps = Math.max(1, activeEval.totalLaps);
      var shortSummary = activeEval.stints
        .map(function (st) {
          return dict.compounds[st.compound].short + st.laps;
        })
        .join(' · ');

      html +=
        '<div class="timeline-section">' +
        '<div class="timeline-head"><strong>' + escapeHtml(dict.stintTimelineTitle) + '</strong>' +
        '<span class="mono">' + escapeHtml(shortSummary) + '</span></div>' +
        '<div class="timeline-bar">';

      for (var bi = 0; bi < activeEval.stints.length; bi++) {
        var st = activeEval.stints[bi];
        var pct = Math.max((st.laps / totalBarLaps) * 100, 6);
        var cShort = dict.compounds[st.compound].short;
        html +=
          '<div class="timeline-segment comp-' + st.compound + '" style="width:' + pct.toFixed(2) + '%" title="' +
          escapeHtml(dict.stintCol + ' ' + (bi + 1) + ': ' + dict.compounds[st.compound].name + ' · ' + dict.lapsWord(st.laps)) + '">' +
          escapeHtml(cShort + '·' + st.laps) + '</div>';
      }
      html += '</div></div>';
    }

    // Editable Stints Table
    html +=
      '<div class="table-wrap"><table><thead><tr>' +
      '<th>#</th>' +
      '<th>' + escapeHtml(dict.tireCol) + '</th>' +
      '<th>' + escapeHtml(dict.lapsCol) + '</th>' +
      '<th>' + escapeHtml(dict.tireActionCol) + '</th>' +
      '<th class="num-col">' + escapeHtml(dict.tireWearCol) + '</th>' +
      '<th class="num-col">' + escapeHtml(dict.fuelInOutCol) + '</th>' +
      '<th class="num-col">' + escapeHtml(dict.pitAddedCol) + '</th>' +
      '<th class="num-col">' + escapeHtml(dict.pitTimeCol) + '</th>' +
      '<th class="num-col">' + escapeHtml(dict.stintTimeCol) + '</th>' +
      '<th class="num-col no-print"></th>' +
      '</tr></thead><tbody>';

    for (var si = 0; si < activeEval.stints.length; si++) {
      var evSt = activeEval.stints[si];
      var rawSt = editedStints[si];
      var canKeep = si > 0 && editedStints[si - 1].compound === rawSt.compound;
      var tireOver = evSt.tireLapsEnd > evSt.tireMaxLaps;
      var fuelOver = evSt.fuelEndLiters < -1e-6;

      var optionsHtml = '';
      for (var oi = 0; oi < COMPOUND_ORDER.length; oi++) {
        var oc = COMPOUND_ORDER[oi];
        var ocSpec = cfg.tires[oc];
        if (!ocSpec.enabled && oc !== rawSt.compound) continue;
        optionsHtml +=
          '<option value="' + oc + '" ' + (oc === rawSt.compound ? 'selected' : '') + '>' +
          escapeHtml(dict.compounds[oc].short + ' — ' + dict.compounds[oc].name) + '</option>';
      }

      var tireActionHtml = '';
      if (si === 0) {
        tireActionHtml = '<span class="stat-sub">' + escapeHtml(dict.raceStartLabel) + '</span>';
      } else if (canKeep) {
        tireActionHtml =
          '<span class="print-only">' + escapeHtml(evSt.changeTires ? dict.newTireSet : dict.keepTireSet) + '</span>' +
          '<button type="button" class="no-print tire-toggle ' + (evSt.changeTires ? '' : 'keep') + '" data-stint-action="toggle-tires" data-stint-idx="' + si + '">' +
          escapeHtml(evSt.changeTires ? dict.newTireSet : dict.keepTireSet) + '</button>';
      } else {
        tireActionHtml = '<span>' + escapeHtml(dict.newTireSet) + '</span>';
      }

      var orderCellHtml = editedStints.length > 1
        ? '<div class="order-cell">' +
          '<span class="drag-handle no-print" draggable="true" data-drag-idx="' + si + '" title="' + escapeHtml(dict.dragStintHint) + '">⋮⋮</span>' +
          '<span class="mono">' + (si + 1) + '</span>' +
          '<div class="order-btns no-print">' +
          '<button type="button" class="btn btn-icon btn-order" data-stint-action="move-up" data-stint-idx="' + si + '" ' +
          (si === 0 ? 'disabled' : '') + ' aria-label="' + escapeHtml(dict.moveStintUp) + '" title="' + escapeHtml(dict.moveStintUp) + '">↑</button>' +
          '<button type="button" class="btn btn-icon btn-order" data-stint-action="move-down" data-stint-idx="' + si + '" ' +
          (si === editedStints.length - 1 ? 'disabled' : '') + ' aria-label="' + escapeHtml(dict.moveStintDown) + '" title="' + escapeHtml(dict.moveStintDown) + '">↓</button>' +
          '</div></div>'
        : '<span class="mono">' + (si + 1) + '</span>';

      html +=
        '<tr class="stint-row" data-row-idx="' + si + '">' +
        '<td>' + orderCellHtml + '</td>' +
        '<td><span class="print-only text-' + rawSt.compound + '" style="font-weight:600">' +
        escapeHtml(dict.compounds[rawSt.compound].short + ' — ' + dict.compounds[rawSt.compound].name) + '</span>' +
        '<select class="select stint-select no-print text-' + rawSt.compound + '" data-stint-action="compound" data-stint-idx="' + si + '">' +
        optionsHtml + '</select></td>' +
        '<td><span class="print-only mono">' + rawSt.laps + '</span>' +
        '<div class="stepper no-print">' +
        '<button type="button" class="btn btn-icon" data-stint-action="dec-laps" data-stint-idx="' + si + '" ' + (rawSt.laps <= 1 ? 'disabled' : '') + '>-</button>' +
        '<input type="number" min="1" max="500" class="input mono laps-input" data-stint-action="laps-input" data-stint-idx="' + si + '" value="' + rawSt.laps + '" />' +
        '<button type="button" class="btn btn-icon" data-stint-action="inc-laps" data-stint-idx="' + si + '">+</button>' +
        '</div></td>' +
        '<td>' + tireActionHtml + '</td>' +
        '<td class="num-col mono ' + (tireOver ? 'status-err' : '') + '">' + evSt.tireLapsEnd + ' / ' + evSt.tireMaxLaps + '</td>' +
        '<td class="num-col mono ' + (fuelOver ? 'status-err' : '') + '">' + evSt.fuelStartLiters.toFixed(1) + ' → ' + evSt.fuelEndLiters.toFixed(1) + ' L</td>' +
        '<td class="num-col mono">' + (si === 0 ? '—' : '+' + evSt.fuelAddedBeforeStint.toFixed(1) + ' L') + '</td>' +
        '<td class="num-col mono">' + (si === 0 ? '—' : evSt.pitDurationBeforeStint.toFixed(1) + 's') + '</td>' +
        '<td class="num-col mono">' + escapeHtml(Logic.formatRaceTime(evSt.drivingSeconds)) +
        '<div class="stat-sub">' + escapeHtml(Logic.formatLapTime(evSt.lapTimeSeconds) + dict.perLapShort) + '</div></td>' +
        '<td class="num-col no-print">' +
        (editedStints.length > 1
          ? '<button type="button" class="btn-remove" data-stint-action="remove" data-stint-idx="' + si + '">' + escapeHtml(dict.removeStintBtn) + '</button>'
          : '') +
        '</td></tr>';
    }

    html += '</tbody></table></div>';

    // Alternative Strategies Comparison
    if (optimizerResult.alternatives.length > 0) {
      html +=
        '<div class="sub-section"><h3 class="sub-title">' + escapeHtml(dict.alternativesTitle) + '</h3>' +
        '<div class="table-wrap"><table><thead><tr>' +
        '<th>' + escapeHtml(dict.pitStopsLabel) + '</th>' +
        '<th>' + escapeHtml(dict.stintTimelineTitle) + '</th>' +
        '<th class="num-col">' + escapeHtml(dict.totalLapsLabel) + '</th>' +
        '<th class="num-col">' + escapeHtml(dict.totalTimeLabel) + '</th>' +
        '<th class="num-col">' + escapeHtml(dict.deltaVsOptimalLabel) + '</th>' +
        '<th class="num-col no-print"></th>' +
        '</tr></thead><tbody>';

      for (var ai = 0; ai < optimizerResult.alternatives.length; ai++) {
        var alt = optimizerResult.alternatives[ai];
        var isBest = ai === 0;
        var dSec = optimal ? alt.totalTimeSeconds - optimal.totalTimeSeconds : 0;
        var lDiff = optimal ? alt.totalLaps - optimal.totalLaps : 0;
        var seq = alt.stints
          .map(function (s, idx) {
            return (idx > 0 && !s.changeTires ? '↺' : '') + dict.compounds[s.compound].short + s.laps;
          })
          .join(' → ');

        var matchesActive = !isCustomEdited && isBest
          ? true
          : alt.stints.length === editedStints.length &&
            alt.stints.every(function (s, idx) {
              return (
                s.compound === editedStints[idx].compound &&
                s.laps === editedStints[idx].laps &&
                s.changeTires === editedStints[idx].changeTires
              );
            });

        var deltaCell = isBest
          ? '<span class="status-ok">' + escapeHtml(dict.bestLabel) + '</span>'
          : lDiff !== 0
            ? '<span class="status-warn">' + lDiff + ' ' + escapeHtml(dict.lapsCol.toLowerCase()) + '</span>'
            : '+' + dSec.toFixed(1) + 's';

        html +=
          '<tr>' +
          '<td><strong>' + escapeHtml(dict.stopsWord(alt.totalStops)) + '</strong></td>' +
          '<td class="mono">' + escapeHtml(seq) + '</td>' +
          '<td class="num-col mono">' + alt.totalLaps + '</td>' +
          '<td class="num-col mono"><strong>' + escapeHtml(Logic.formatRaceTime(alt.totalTimeSeconds)) + '</strong></td>' +
          '<td class="num-col mono">' + deltaCell + '</td>' +
          '<td class="num-col no-print">' +
          (matchesActive
            ? '<span class="status-err" style="font-weight:600;font-size:0.75rem">' + escapeHtml(dict.activeLabel) + '</span>'
            : '<button type="button" class="btn btn-secondary" style="height:28px;padding:0 10px" data-load-alt="' + ai + '">' + escapeHtml(dict.loadPlanBtn) + '</button>') +
          '</td></tr>';
      }

      html += '</tbody></table></div></div>';
    }

    // Assumptions
    html +=
      '<div class="sub-section"><h3 class="sub-title" style="font-size:0.75rem">' + escapeHtml(dict.assumptionsTitle) + '</h3>' +
      '<ul class="assumptions-list">';
    for (var asi = 0; asi < dict.assumptionsList.length; asi++) {
      html += '<li>' + escapeHtml(dict.assumptionsList[asi]) + '</li>';
    }
    html += '</ul></div>';

    var outputContainer = document.getElementById('strategy-output');
    outputContainer.innerHTML = html;

    // Bind dynamic strategy output buttons/inputs
    var altBtns = outputContainer.querySelectorAll('[data-load-alt]');
    for (var ab = 0; ab < altBtns.length; ab++) {
      altBtns[ab].addEventListener('click', function (ev) {
        var idx = parseInt(ev.currentTarget.getAttribute('data-load-alt'), 10);
        if (idx === 0) {
          customStints = null;
        } else if (optimizerResult.alternatives[idx]) {
          customStints = strategyToStintInputs(optimizerResult.alternatives[idx]);
        }
        Logic.saveActiveCustomStints(customStints);
        renderAllDynamicOutputs();
      });
    }

    var actionNodes = outputContainer.querySelectorAll('[data-stint-action]');
    for (var an = 0; an < actionNodes.length; an++) {
      var node = actionNodes[an];
      var action = node.getAttribute('data-stint-action');
      var eventName = action === 'compound' || action === 'laps-input' ? 'change' : 'click';
      node.addEventListener(eventName, function (ev) {
        var el = ev.currentTarget;
        var act = el.getAttribute('data-stint-action');
        var idx = parseInt(el.getAttribute('data-stint-idx'), 10);
        var currentList = (customStints || optimalStints).map(function (s) {
          return Object.assign({}, s);
        });

        if (act === 'compound') {
          currentList[idx].compound = el.value;
          customStints = Strategy.normalizeStintTireFlags(currentList);
        } else if (act === 'move-up' && idx > 0) {
          customStints = Strategy.reorderStints(currentList, idx, idx - 1);
        } else if (act === 'move-down' && idx < currentList.length - 1) {
          customStints = Strategy.reorderStints(currentList, idx, idx + 1);
        } else if (act === 'dec-laps') {
          currentList[idx].laps = Math.max(1, currentList[idx].laps - 1);
          customStints = currentList;
        } else if (act === 'inc-laps') {
          currentList[idx].laps = Math.min(500, currentList[idx].laps + 1);
          customStints = currentList;
        } else if (act === 'laps-input') {
          var val = parseInt(el.value, 10);
          if (Number.isFinite(val)) {
            currentList[idx].laps = Math.max(1, Math.min(500, val));
            customStints = currentList;
          }
        } else if (act === 'toggle-tires' && idx > 0) {
          currentList[idx].changeTires = !currentList[idx].changeTires;
          customStints = currentList;
        } else if (act === 'remove' && currentList.length > 1) {
          currentList.splice(idx, 1);
          customStints = Strategy.normalizeStintTireFlags(currentList);
        }
        Logic.saveActiveCustomStints(customStints);
        renderAllDynamicOutputs();
      });
    }

    // Drag-and-drop stint reordering
    var dragFromIdx = null;
    var dragHandles = outputContainer.querySelectorAll('[data-drag-idx]');
    for (var dh = 0; dh < dragHandles.length; dh++) {
      dragHandles[dh].addEventListener('dragstart', function (ev) {
        dragFromIdx = parseInt(ev.currentTarget.getAttribute('data-drag-idx'), 10);
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = 'move';
          ev.dataTransfer.setData('text/plain', String(dragFromIdx));
        }
        var row = ev.currentTarget.closest('tr');
        if (row) row.classList.add('dragging');
      });
      dragHandles[dh].addEventListener('dragend', function () {
        dragFromIdx = null;
        var rows = outputContainer.querySelectorAll('tr.stint-row');
        for (var r = 0; r < rows.length; r++) {
          rows[r].classList.remove('dragging', 'drag-over');
        }
      });
    }

    var stintRows = outputContainer.querySelectorAll('tr.stint-row');
    for (var sr = 0; sr < stintRows.length; sr++) {
      stintRows[sr].addEventListener('dragover', function (ev) {
        if (dragFromIdx === null) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
        ev.currentTarget.classList.add('drag-over');
      });
      stintRows[sr].addEventListener('dragleave', function (ev) {
        ev.currentTarget.classList.remove('drag-over');
      });
      stintRows[sr].addEventListener('drop', function (ev) {
        if (dragFromIdx === null) return;
        ev.preventDefault();
        var toIdx = parseInt(ev.currentTarget.getAttribute('data-row-idx'), 10);
        ev.currentTarget.classList.remove('drag-over');
        if (Number.isFinite(toIdx) && dragFromIdx !== toIdx) {
          var currentList = (customStints || optimalStints).map(function (s) {
            return Object.assign({}, s);
          });
          customStints = Strategy.reorderStints(currentList, dragFromIdx, toIdx);
          Logic.saveActiveCustomStints(customStints);
          dragFromIdx = null;
          renderAllDynamicOutputs();
        }
      });
    }
  }

  function persistAndUpdate() {
    Logic.saveAppState(state);
    renderAllDynamicOutputs();
  }

  function bindStaticListeners() {
    // Language switcher
    var langBtns = document.querySelectorAll('#lang-switch button');
    for (var i = 0; i < langBtns.length; i++) {
      langBtns[i].addEventListener('click', function (ev) {
        state.language = ev.currentTarget.getAttribute('data-lang') === 'en' ? 'en' : 'fr';
        applyThemeAndLanguage();
        buildTiresTable();
        persistAndUpdate();
      });
    }

    // Theme switcher
    var themeBtns = document.querySelectorAll('#theme-switch button');
    for (var ti = 0; ti < themeBtns.length; ti++) {
      themeBtns[ti].addEventListener('click', function (ev) {
        state.theme = ev.currentTarget.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        applyThemeAndLanguage();
        Logic.saveAppState(state);
      });
    }

    // Reset defaults
    document.getElementById('reset-defaults-btn').addEventListener('click', function () {
      var defaults = Logic.createDefaultAppState();
      state.config = defaults.config;
      customStints = null;
      Logic.saveActiveCustomStints(null);
      syncInputsFromState();
      persistAndUpdate();
    });

    // Step 1 inputs
    document.getElementById('track-name-input').addEventListener('input', function (ev) {
      state.config.trackName = ev.currentTarget.value;
      persistAndUpdate();
    });

    document.getElementById('track-length-input').addEventListener('input', function (ev) {
      state.config.trackLengthInput = ev.currentTarget.value;
      state.config.trackLengthKm = Logic.parseTrackLengthKm(ev.currentTarget.value);
      persistAndUpdate();
    });

    // Step 2 race mode & inputs
    var modeBtns = document.querySelectorAll('#race-mode-switch button');
    for (var mi = 0; mi < modeBtns.length; mi++) {
      modeBtns[mi].addEventListener('click', function (ev) {
        state.config.mode = ev.currentTarget.getAttribute('data-mode') === 'laps' ? 'laps' : 'duration';
        persistAndUpdate();
      });
    }

    document.getElementById('duration-input').addEventListener('input', function (ev) {
      var val = ev.currentTarget.value;
      state.config.durationInput = val;
      var parsed = Logic.parseDurationMinutes(val);
      if (parsed !== null) state.config.durationMinutes = parsed;
      persistAndUpdate();
    });

    document.getElementById('laps-input').addEventListener('input', function (ev) {
      var val = parseInt(ev.currentTarget.value, 10);
      if (Number.isFinite(val) && val >= 1) {
        state.config.totalLaps = val;
        persistAndUpdate();
      }
    });

    // Step 3 car inputs
    document.getElementById('car-name-input').addEventListener('input', function (ev) {
      state.config.car.name = ev.currentTarget.value;
      persistAndUpdate();
    });

    document.getElementById('car-category-input').addEventListener('input', function (ev) {
      state.config.car.category = ev.currentTarget.value;
      persistAndUpdate();
    });

    document.getElementById('car-bop-power-input').addEventListener('input', function (ev) {
      var raw = String(ev.currentTarget.value).trim();
      if (!raw) {
        state.config.car.bopPowerHp = null;
      } else {
        var num = parseFloat(raw.replace(',', '.'));
        state.config.car.bopPowerHp = Number.isFinite(num) && num > 0 ? num : null;
      }
      persistAndUpdate();
    });

    document.getElementById('car-bop-weight-input').addEventListener('input', function (ev) {
      var raw = String(ev.currentTarget.value).trim();
      if (!raw) {
        state.config.car.bopWeightKg = null;
      } else {
        var num = parseFloat(raw.replace(',', '.'));
        state.config.car.bopWeightKg = Number.isFinite(num) && num > 0 ? num : null;
      }
      persistAndUpdate();
    });

    // Step 4 pit & fuel inputs
    var pitBindings = [
      ['pit-transit-input', 'pitTransitSeconds', 0],
      ['tire-change-input', 'tireChangeSeconds', 0],
      ['refuel-rate-input', 'refuelRateLps', 0.1],
      ['fuel-per-lap-input', 'fuelPerLapLiters', 0.1],
      ['fuel-margin-input', 'fuelMarginLaps', 0],
    ];
    for (var pi = 0; pi < pitBindings.length; pi++) {
      (function (elId, field, minVal) {
        document.getElementById(elId).addEventListener('input', function (ev) {
          var num = parseFloat(String(ev.currentTarget.value).replace(',', '.'));
          if (Number.isFinite(num)) {
            state.config.pitFuel[field] = Math.max(minVal, num);
            persistAndUpdate();
          }
        });
      })(pitBindings[pi][0], pitBindings[pi][1], pitBindings[pi][2]);
    }

    // Step 5 race information multipliers (informational only)
    var raceInfoBindings = [
      ['tire-wear-mult-input', 'tireWearMultiplier'],
      ['fuel-mult-input', 'fuelMultiplier'],
    ];
    for (var rii = 0; rii < raceInfoBindings.length; rii++) {
      (function (elId, field) {
        document.getElementById(elId).addEventListener('input', function (ev) {
          var num = parseFloat(String(ev.currentTarget.value).replace(',', '.'));
          if (Number.isFinite(num) && num >= 0) {
            state.config.raceInfo[field] = Math.max(0, Math.min(50, num));
            persistAndUpdate();
          }
        });
      })(raceInfoBindings[rii][0], raceInfoBindings[rii][1]);
    }

    // Step 6 delegated events on tires tbody
    document.getElementById('tires-table-body').addEventListener('input', handleTireEvent);
    document.getElementById('tires-table-body').addEventListener('change', handleTireEvent);

    // Step 7 top actions
    document.getElementById('apply-optimal-btn').addEventListener('click', function () {
      customStints = null;
      Logic.saveActiveCustomStints(null);
      renderAllDynamicOutputs();
    });

    document.getElementById('add-stint-btn').addEventListener('click', function () {
      var optRes = Strategy.findOptimalStrategies(state.config);
      var base = customStints || strategyToStintInputs(optRes.best);
      var enabled = COMPOUND_ORDER.filter(function (id) {
        return state.config.tires[id].enabled && state.config.tires[id].lapTimeSeconds !== null;
      });
      var comp = enabled[0] || 'medium';
      var maxFuelLaps = state.config.pitFuel.fuelPerLapLiters > 0
        ? Math.max(1, Math.floor(100 / state.config.pitFuel.fuelPerLapLiters))
        : 5;
      var laps = Math.max(1, Math.min(maxFuelLaps, state.config.tires[comp].maxLaps, 10));
      customStints = base.concat([{
        id: 'stint-' + Date.now(),
        compound: comp,
        laps: laps,
        changeTires: true,
      }]);
      Logic.saveActiveCustomStints(customStints);
      renderAllDynamicOutputs();
    });

    document.getElementById('print-pdf-btn').addEventListener('click', function () {
      window.print();
    });

    // Save Strategy controls
    var targetSelect = document.getElementById('save-target-select');
    if (targetSelect && Db) {
      targetSelect.value = Db.getStorageMode();
      targetSelect.addEventListener('change', function () {
        Db.setStorageMode(targetSelect.value);
        renderSaveAuthStatus(Db.getCurrentUser());
        showSaveFeedback('', 'ok');
      });
    }

    var authBtn = document.getElementById('save-auth-btn');
    if (authBtn && Db) {
      authBtn.addEventListener('click', async function () {
        showSaveFeedback('', 'ok');
        try {
          if (Db.getCurrentUser()) {
            await Db.signOutUser();
          } else {
            await Db.signInWithGoogle();
          }
        } catch (_err) {
          showSaveFeedback(t().saveErrorAuth, 'err');
        }
      });
    }

    var saveBtn = document.getElementById('save-strategy-btn');
    if (saveBtn && Db) {
      saveBtn.addEventListener('click', async function () {
        var dict = t();
        var titleInput = document.getElementById('save-strategy-title');
        var rawTitle = titleInput ? titleInput.value.trim() : '';
        var defaultTitle = [
          state.config.trackName.trim() || dict.unnamedTrackFallback,
          state.config.car && state.config.car.name ? state.config.car.name.trim() : '',
        ].filter(Boolean).join(' · ');

        var chosenTarget = targetSelect ? targetSelect.value : 'shared';
        saveBtn.disabled = true;
        saveBtn.textContent = dict.savingBtn;
        showSaveFeedback('', 'ok');

        try {
          var result = await Db.saveStrategy({
            target: chosenTarget,
            title: rawTitle || defaultTitle,
            config: state.config,
            stints: lastEditedStints || [],
            evaluated: lastActiveEval || {},
            localAuthorName: dict.badgeLocal,
          });
          if (titleInput && !rawTitle) titleInput.value = '';
          showSaveFeedback(
            result.target === 'shared' ? dict.saveSuccessShared : dict.saveSuccessLocal,
            'ok'
          );
        } catch (err) {
          var msg = err instanceof Error ? err.message : String(err);
          if (msg.indexOf('SHARED_DB_UNAVAILABLE') !== -1) {
            showSaveFeedback(dict.saveErrorUnavailable, 'err');
          } else if (msg.indexOf('AUTH_REQUIRED') !== -1 || msg.indexOf('popup') !== -1 || msg.indexOf('auth/') !== -1) {
            showSaveFeedback(dict.saveErrorAuth, 'err');
          } else {
            showSaveFeedback(dict.saveErrorGeneric, 'err');
          }
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = t().saveStrategyBtn;
        }
      });
    }
  }

  function handleTireEvent(ev) {
    var target = ev.target;
    var field = target.getAttribute('data-tire-field');
    var cid = target.getAttribute('data-compound');
    if (!field || !cid) return;

    var tire = state.config.tires[cid];
    if (field === 'enabled') {
      tire.enabled = target.checked;
      if (!tire.enabled) {
        tire.mandatory = false;
        var mBox = document.querySelector('input[data-tire-field="mandatory"][data-compound="' + cid + '"]');
        if (mBox) mBox.checked = false;
      }
    } else if (field === 'lapTimeInput') {
      tire.lapTimeInput = target.value;
      tire.lapTimeSeconds = Logic.parseLapTimeSeconds(target.value);
    } else if (field === 'maxLaps') {
      var val = parseInt(target.value, 10);
      if (Number.isFinite(val) && val >= 1) tire.maxLaps = val;
    } else if (field === 'mandatory') {
      tire.mandatory = target.checked;
      if (tire.mandatory && !tire.enabled) {
        tire.enabled = true;
        var eBox = document.querySelector('input[data-tire-field="enabled"][data-compound="' + cid + '"]');
        if (eBox) eBox.checked = true;
      }
    }

    persistAndUpdate();
  }

  applyThemeAndLanguage();
  syncInputsFromState();
  bindStaticListeners();
  renderAllDynamicOutputs();

  if (Db) {
    Db.onAuthChange(function (user) {
      renderSaveAuthStatus(user);
    });
    Db.init().then(function () {
      renderSaveAuthStatus(Db.getCurrentUser());
    });
  }
})();
