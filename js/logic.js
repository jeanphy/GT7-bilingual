(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GT7Logic = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TANK_CAPACITY_LITERS = 100;
  var COMPOUND_ORDER = ['soft', 'medium', 'hard', 'intermediate', 'wet'];
  var STORAGE_KEY = 'gt7_endurance_strategy_v1';

  function parseDurationMinutes(raw) {
    if (typeof raw !== 'string') return null;
    var cleaned = raw.trim().toLowerCase().replace(/,/g, '.');
    if (!cleaned) return null;

    var hMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+(?:\.\d+)?)\s*(?:m|min)?)?$/);
    if (hMatch) {
      var hours = parseFloat(hMatch[1]);
      var mins = hMatch[2] ? parseFloat(hMatch[2]) : 0;
      if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
      var totalH = hours * 60 + mins;
      return totalH > 0 ? totalH : null;
    }

    var colonMatch = cleaned.match(/^(\d+)\s*:\s*(\d{1,2})$/);
    if (colonMatch) {
      var cHours = parseInt(colonMatch[1], 10);
      var cMins = parseInt(colonMatch[2], 10);
      if (!Number.isFinite(cHours) || !Number.isFinite(cMins) || cMins >= 60) return null;
      var totalC = cHours * 60 + cMins;
      return totalC > 0 ? totalC : null;
    }

    var minMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes?)?$/);
    if (minMatch) {
      var onlyMins = parseFloat(minMatch[1]);
      return Number.isFinite(onlyMins) && onlyMins > 0 ? onlyMins : null;
    }

    return null;
  }

  function parseLapTimeSeconds(raw) {
    if (typeof raw !== 'string') return null;
    var cleaned = raw.trim().toLowerCase().replace(/,/g, '.');
    if (!cleaned) return null;

    var colonMatch = cleaned.match(/^(\d+)\s*:\s*(\d{1,2}(?:\.\d+)?)$/);
    if (colonMatch) {
      var mins = parseInt(colonMatch[1], 10);
      var secs = parseFloat(colonMatch[2]);
      if (!Number.isFinite(mins) || !Number.isFinite(secs) || secs >= 60) return null;
      var total = mins * 60 + secs;
      return total > 0 ? total : null;
    }

    var mMatch = cleaned.match(/^(\d+)\s*m\s*(\d{1,2}(?:\.\d+)?)\s*s?$/);
    if (mMatch) {
      var mMins = parseInt(mMatch[1], 10);
      var mSecs = parseFloat(mMatch[2]);
      if (!Number.isFinite(mMins) || !Number.isFinite(mSecs) || mSecs >= 60) return null;
      var totalM = mMins * 60 + mSecs;
      return totalM > 0 ? totalM : null;
    }

    var secMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*s?$/);
    if (secMatch) {
      var onlySecs = parseFloat(secMatch[1]);
      return Number.isFinite(onlySecs) && onlySecs > 0 ? onlySecs : null;
    }

    return null;
  }

  function parseTrackLengthKm(raw) {
    if (typeof raw !== 'string') return null;
    var cleaned = raw.trim().replace(/,/g, '.').replace(/\s*km$/i, '');
    if (!cleaned) return null;
    var val = parseFloat(cleaned);
    return Number.isFinite(val) && val > 0 ? val : null;
  }

  function formatLapTime(seconds) {
    if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '—';
    var mins = Math.floor(seconds / 60);
    var rem = seconds - mins * 60;
    var remFixed = rem.toFixed(3).padStart(6, '0');
    return mins > 0 ? mins + ':' + remFixed : rem.toFixed(3) + 's';
  }

  function formatRaceTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '—';
    var rounded = Math.round(seconds * 10) / 10;
    var hours = Math.floor(rounded / 3600);
    var mins = Math.floor((rounded % 3600) / 60);
    var secs = rounded % 60;
    var secStr = secs.toFixed(1).padStart(4, '0');
    if (hours > 0) {
      return hours + 'h ' + String(mins).padStart(2, '0') + 'm ' + secStr + 's';
    }
    return mins + 'm ' + secStr + 's';
  }

  function formatDurationMinutes(minutes) {
    if (!Number.isFinite(minutes) || minutes <= 0) return '—';
    var totalMins = Math.round(minutes * 10) / 10;
    if (totalMins >= 60) {
      var h = Math.floor(totalMins / 60);
      var m = Math.round((totalMins - h * 60) * 10) / 10;
      return m > 0 ? h + 'h' + String(m).padStart(2, '0') : h + 'h00';
    }
    return totalMins + ' min';
  }

  function createTireConfig(id, enabled, lapTimeInput, maxLaps, mandatory) {
    return {
      id: id,
      enabled: Boolean(enabled),
      lapTimeInput: lapTimeInput,
      lapTimeSeconds: parseLapTimeSeconds(lapTimeInput),
      maxLaps: maxLaps,
      mandatory: Boolean(mandatory),
    };
  }

  function createDefaultConfig() {
    return {
      trackName: '',
      trackLengthInput: '',
      trackLengthKm: null,
      mode: 'duration',
      durationInput: '1h00',
      durationMinutes: 60,
      totalLaps: 25,
      pitFuel: {
        pitTransitSeconds: 24,
        tireChangeSeconds: 8,
        refuelRateLps: 4.0,
        fuelPerLapLiters: 7.8,
        fuelMarginLaps: 0.5,
      },
      tires: {
        soft: createTireConfig('soft', true, '2:16.200', 8, false),
        medium: createTireConfig('medium', true, '2:17.800', 14, true),
        hard: createTireConfig('hard', true, '2:19.600', 22, false),
        intermediate: createTireConfig('intermediate', false, '2:26.000', 16, false),
        wet: createTireConfig('wet', false, '2:34.000', 18, false),
      },
    };
  }

  function createDefaultAppState() {
    return {
      language: 'fr',
      theme: 'dark',
      config: createDefaultConfig(),
    };
  }

  function loadSavedAppState() {
    var fallback = createDefaultAppState();
    try {
      if (typeof window === 'undefined' || !window.localStorage) return fallback;
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      var language = parsed && parsed.language === 'en' ? 'en' : 'fr';
      var theme = parsed && parsed.theme === 'light' ? 'light' : 'dark';
      var cfg = parsed && parsed.config;
      if (!cfg || typeof cfg !== 'object') {
        return { language: language, theme: theme, config: fallback.config };
      }

      var mergedTires = Object.assign({}, fallback.config.tires);
      if (cfg.tires) {
        for (var i = 0; i < COMPOUND_ORDER.length; i++) {
          var id = COMPOUND_ORDER[i];
          var t = cfg.tires[id];
          if (t) {
            var inputStr = typeof t.lapTimeInput === 'string'
              ? t.lapTimeInput
              : fallback.config.tires[id].lapTimeInput;
            mergedTires[id] = {
              id: id,
              enabled: Boolean(t.enabled),
              lapTimeInput: inputStr,
              lapTimeSeconds: parseLapTimeSeconds(inputStr),
              maxLaps: Number.isFinite(t.maxLaps) && t.maxLaps >= 1
                ? Math.floor(t.maxLaps)
                : fallback.config.tires[id].maxLaps,
              mandatory: Boolean(t.mandatory),
            };
          }
        }
      }

      var durationInput = typeof cfg.durationInput === 'string'
        ? cfg.durationInput
        : fallback.config.durationInput;
      var parsedDur = parseDurationMinutes(durationInput) || fallback.config.durationMinutes;

      var trackName = typeof cfg.trackName === 'string' ? cfg.trackName : fallback.config.trackName;
      var trackLengthInput = typeof cfg.trackLengthInput === 'string'
        ? cfg.trackLengthInput
        : typeof cfg.customLengthKm === 'number' && Number.isFinite(cfg.customLengthKm) && cfg.customLengthKm > 0
          ? String(cfg.customLengthKm)
          : fallback.config.trackLengthInput;
      var trackLengthKm = parseTrackLengthKm(trackLengthInput);

      var pf = cfg.pitFuel || {};
      return {
        language: language,
        theme: theme,
        config: {
          trackName: trackName,
          trackLengthInput: trackLengthInput,
          trackLengthKm: trackLengthKm,
          mode: cfg.mode === 'laps' ? 'laps' : 'duration',
          durationInput: durationInput,
          durationMinutes: parsedDur,
          totalLaps: Number.isFinite(cfg.totalLaps) && cfg.totalLaps >= 1
            ? Math.floor(cfg.totalLaps)
            : fallback.config.totalLaps,
          pitFuel: {
            pitTransitSeconds: Number.isFinite(pf.pitTransitSeconds) && pf.pitTransitSeconds >= 0
              ? pf.pitTransitSeconds
              : fallback.config.pitFuel.pitTransitSeconds,
            tireChangeSeconds: Number.isFinite(pf.tireChangeSeconds) && pf.tireChangeSeconds >= 0
              ? pf.tireChangeSeconds
              : fallback.config.pitFuel.tireChangeSeconds,
            refuelRateLps: Number.isFinite(pf.refuelRateLps) && pf.refuelRateLps > 0
              ? pf.refuelRateLps
              : fallback.config.pitFuel.refuelRateLps,
            fuelPerLapLiters: Number.isFinite(pf.fuelPerLapLiters) && pf.fuelPerLapLiters > 0
              ? pf.fuelPerLapLiters
              : fallback.config.pitFuel.fuelPerLapLiters,
            fuelMarginLaps: Number.isFinite(pf.fuelMarginLaps) && pf.fuelMarginLaps >= 0
              ? pf.fuelMarginLaps
              : fallback.config.pitFuel.fuelMarginLaps,
          },
          tires: mergedTires,
        },
      };
    } catch (_e) {
      return fallback;
    }
  }

  function saveAppState(state) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_e) {
      // Ignore storage errors
    }
  }

  return {
    TANK_CAPACITY_LITERS: TANK_CAPACITY_LITERS,
    COMPOUND_ORDER: COMPOUND_ORDER,
    parseDurationMinutes: parseDurationMinutes,
    parseLapTimeSeconds: parseLapTimeSeconds,
    parseTrackLengthKm: parseTrackLengthKm,
    formatLapTime: formatLapTime,
    formatRaceTime: formatRaceTime,
    formatDurationMinutes: formatDurationMinutes,
    createTireConfig: createTireConfig,
    createDefaultConfig: createDefaultConfig,
    createDefaultAppState: createDefaultAppState,
    loadSavedAppState: loadSavedAppState,
    saveAppState: saveAppState,
  };
});
