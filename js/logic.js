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
  var ACTIVE_STINTS_KEY = 'gt7_endurance_active_stints_v1';

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
      car: {
        name: '',
        category: '',
        bopPowerHp: null,
        bopWeightKg: null,
      },
      pitFuel: {
        pitTransitSeconds: 24,
        tireChangeSeconds: 8,
        refuelRateLps: 4.0,
        fuelPerLapLiters: 7.8,
        fuelMarginLaps: 0.5,
      },
      raceInfo: {
        tireWearMultiplier: 1,
        fuelMultiplier: 1,
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
      var carCfg = cfg.car || {};
      var riCfg = cfg.raceInfo || {};
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
          car: {
            name: typeof carCfg.name === 'string' ? carCfg.name : fallback.config.car.name,
            category: typeof carCfg.category === 'string' ? carCfg.category : fallback.config.car.category,
            bopPowerHp: Number.isFinite(carCfg.bopPowerHp) && carCfg.bopPowerHp > 0
              ? carCfg.bopPowerHp
              : null,
            bopWeightKg: Number.isFinite(carCfg.bopWeightKg) && carCfg.bopWeightKg > 0
              ? carCfg.bopWeightKg
              : null,
          },
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
          raceInfo: {
            tireWearMultiplier: Number.isFinite(riCfg.tireWearMultiplier) && riCfg.tireWearMultiplier >= 0
              ? riCfg.tireWearMultiplier
              : fallback.config.raceInfo.tireWearMultiplier,
            fuelMultiplier: Number.isFinite(riCfg.fuelMultiplier) && riCfg.fuelMultiplier >= 0
              ? riCfg.fuelMultiplier
              : fallback.config.raceInfo.fuelMultiplier,
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

  function loadActiveCustomStints() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      var raw = window.localStorage.getItem(ACTIVE_STINTS_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      var valid = parsed
        .filter(function (s) {
          return (
            s &&
            COMPOUND_ORDER.indexOf(s.compound) !== -1 &&
            Number.isFinite(s.laps) &&
            s.laps >= 1
          );
        })
        .map(function (s, idx) {
          return {
            id: typeof s.id === 'string' && s.id ? s.id : 'stint-' + idx,
            compound: s.compound,
            laps: Math.floor(s.laps),
            changeTires: Boolean(s.changeTires),
          };
        });
      return valid.length > 0 ? valid : null;
    } catch (_e) {
      return null;
    }
  }

  function saveActiveCustomStints(stints) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      if (!stints || !Array.isArray(stints) || stints.length === 0) {
        window.localStorage.removeItem(ACTIVE_STINTS_KEY);
      } else {
        window.localStorage.setItem(ACTIVE_STINTS_KEY, JSON.stringify(stints));
      }
    } catch (_e) {
      // Ignore storage errors
    }
  }

  var LOCAL_SAVED_KEY = 'gt7_endurance_saved_strategies_v1';

  function buildSavedStrategyRecord(params) {
    var cfg = params.config;
    var stints = Array.isArray(params.stints) ? params.stints : [];
    var evaluated = params.evaluated || {};
    var car = cfg.car || {};
    var ri = cfg.raceInfo || {};
    var pf = cfg.pitFuel || {};

    var sanitizedTires = {};
    for (var i = 0; i < COMPOUND_ORDER.length; i++) {
      var cid = COMPOUND_ORDER[i];
      var t = (cfg.tires && cfg.tires[cid]) || {};
      sanitizedTires[cid] = {
        enabled: Boolean(t.enabled),
        lapTimeInput: typeof t.lapTimeInput === 'string' && t.lapTimeInput.trim() ? t.lapTimeInput.trim().slice(0, 20) : '2:00.000',
        maxLaps: Number.isFinite(t.maxLaps) && t.maxLaps >= 1 ? Math.floor(t.maxLaps) : 10,
        mandatory: Boolean(t.mandatory),
      };
    }

    var sanitizedStints = stints.slice(0, 50).map(function (s, idx) {
      var comp = COMPOUND_ORDER.indexOf(s.compound) !== -1 ? s.compound : 'medium';
      return {
        compound: comp,
        laps: Number.isFinite(s.laps) && s.laps >= 1 ? Math.floor(s.laps) : 1,
        changeTires: idx === 0 ? true : Boolean(s.changeTires),
      };
    });
    if (sanitizedStints.length === 0) {
      sanitizedStints.push({ compound: 'medium', laps: 1, changeTires: true });
    }

    var stintsLabel = sanitizedStints
      .map(function (s, idx) {
        var shortMap = { soft: 'S', medium: 'M', hard: 'H', intermediate: 'I', wet: 'W' };
        return (idx > 0 && !s.changeTires ? '↺' : '') + (shortMap[s.compound] || 'M') + s.laps;
      })
      .join(' · ');

    var totalLapsSum = sanitizedStints.reduce(function (acc, s) {
      return acc + s.laps;
    }, 0);

    var title = typeof params.title === 'string' && params.title.trim()
      ? params.title.trim().slice(0, 100)
      : (typeof cfg.trackName === 'string' && cfg.trackName.trim() ? cfg.trackName.trim().slice(0, 100) : 'GT7 Strategy');

    var nowIso = new Date().toISOString();
    return {
      id: 'local_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      title: title,
      trackName: typeof cfg.trackName === 'string' ? cfg.trackName.trim() : '',
      trackLengthKm: typeof cfg.trackLengthKm === 'number' && cfg.trackLengthKm > 0 ? cfg.trackLengthKm : null,
      carName: typeof car.name === 'string' ? car.name.trim() : '',
      carCategory: typeof car.category === 'string' ? car.category.trim() : '',
      bopPowerHp: typeof car.bopPowerHp === 'number' && car.bopPowerHp > 0 ? car.bopPowerHp : null,
      bopWeightKg: typeof car.bopWeightKg === 'number' && car.bopWeightKg > 0 ? car.bopWeightKg : null,
      mode: cfg.mode === 'laps' ? 'laps' : 'duration',
      durationInput: typeof cfg.durationInput === 'string' && cfg.durationInput.trim() ? cfg.durationInput.trim() : '1h00',
      durationMinutes: Number.isFinite(cfg.durationMinutes) && cfg.durationMinutes > 0 ? cfg.durationMinutes : 60,
      totalLaps: Number.isFinite(cfg.totalLaps) && cfg.totalLaps >= 1 ? Math.floor(cfg.totalLaps) : 25,
      tireWearMultiplier: Number.isFinite(ri.tireWearMultiplier) && ri.tireWearMultiplier >= 0 ? ri.tireWearMultiplier : 1,
      fuelMultiplier: Number.isFinite(ri.fuelMultiplier) && ri.fuelMultiplier >= 0 ? ri.fuelMultiplier : 1,
      pitTransitSeconds: Number.isFinite(pf.pitTransitSeconds) && pf.pitTransitSeconds >= 0 ? pf.pitTransitSeconds : 24,
      tireChangeSeconds: Number.isFinite(pf.tireChangeSeconds) && pf.tireChangeSeconds >= 0 ? pf.tireChangeSeconds : 8,
      refuelRateLps: Number.isFinite(pf.refuelRateLps) && pf.refuelRateLps > 0 ? pf.refuelRateLps : 4,
      fuelPerLapLiters: Number.isFinite(pf.fuelPerLapLiters) && pf.fuelPerLapLiters > 0 ? pf.fuelPerLapLiters : 7.8,
      fuelMarginLaps: Number.isFinite(pf.fuelMarginLaps) && pf.fuelMarginLaps >= 0 ? pf.fuelMarginLaps : 0.5,
      tires: sanitizedTires,
      stints: sanitizedStints,
      summary: {
        totalLaps: Number.isFinite(evaluated.totalLaps) ? Math.floor(evaluated.totalLaps) : totalLapsSum,
        totalStops: Number.isFinite(evaluated.totalStops) ? Math.floor(evaluated.totalStops) : Math.max(0, sanitizedStints.length - 1),
        totalTimeSeconds: Number.isFinite(evaluated.totalTimeSeconds) ? evaluated.totalTimeSeconds : 0,
        totalFuelAddedLiters: Number.isFinite(evaluated.totalFuelAddedLiters) ? evaluated.totalFuelAddedLiters : 0,
        stintsLabel: stintsLabel,
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  function listSavedStrategies() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      var raw = window.localStorage.getItem(LOCAL_SAVED_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.sort(function (a, b) {
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      });
    } catch (_e) {
      return [];
    }
  }

  function writeSavedStrategiesList(list) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(LOCAL_SAVED_KEY, JSON.stringify(list));
    } catch (_e) {
      // Ignore storage errors
    }
  }

  function saveStrategyLocally(params) {
    var record = buildSavedStrategyRecord(params);
    var list = listSavedStrategies();
    list.unshift(record);
    writeSavedStrategiesList(list);
    return record;
  }

  function deleteLocalStrategy(id) {
    var list = listSavedStrategies().filter(function (item) {
      return item.id !== id;
    });
    writeSavedStrategiesList(list);
    return list;
  }

  function savedRecordToConfig(record) {
    var fallback = createDefaultConfig();
    var tiresMap = {};
    for (var i = 0; i < COMPOUND_ORDER.length; i++) {
      var cid = COMPOUND_ORDER[i];
      var src = record.tires && record.tires[cid] ? record.tires[cid] : fallback.tires[cid];
      tiresMap[cid] = createTireConfig(
        cid,
        Boolean(src.enabled),
        typeof src.lapTimeInput === 'string' ? src.lapTimeInput : fallback.tires[cid].lapTimeInput,
        Number.isFinite(src.maxLaps) && src.maxLaps >= 1 ? Math.floor(src.maxLaps) : fallback.tires[cid].maxLaps,
        Boolean(src.mandatory)
      );
    }

    var trackLen = typeof record.trackLengthKm === 'number' && record.trackLengthKm > 0 ? record.trackLengthKm : null;
    var config = {
      trackName: typeof record.trackName === 'string' ? record.trackName : '',
      trackLengthInput: trackLen !== null ? String(trackLen) : '',
      trackLengthKm: trackLen,
      mode: record.mode === 'laps' ? 'laps' : 'duration',
      durationInput: typeof record.durationInput === 'string' ? record.durationInput : fallback.durationInput,
      durationMinutes: Number.isFinite(record.durationMinutes) && record.durationMinutes > 0
        ? record.durationMinutes
        : fallback.durationMinutes,
      totalLaps: Number.isFinite(record.totalLaps) && record.totalLaps >= 1
        ? Math.floor(record.totalLaps)
        : fallback.totalLaps,
      car: {
        name: typeof record.carName === 'string' ? record.carName : '',
        category: typeof record.carCategory === 'string' ? record.carCategory : '',
        bopPowerHp: Number.isFinite(record.bopPowerHp) && record.bopPowerHp > 0 ? record.bopPowerHp : null,
        bopWeightKg: Number.isFinite(record.bopWeightKg) && record.bopWeightKg > 0 ? record.bopWeightKg : null,
      },
      pitFuel: {
        pitTransitSeconds: Number.isFinite(record.pitTransitSeconds) ? record.pitTransitSeconds : fallback.pitFuel.pitTransitSeconds,
        tireChangeSeconds: Number.isFinite(record.tireChangeSeconds) ? record.tireChangeSeconds : fallback.pitFuel.tireChangeSeconds,
        refuelRateLps: Number.isFinite(record.refuelRateLps) && record.refuelRateLps > 0 ? record.refuelRateLps : fallback.pitFuel.refuelRateLps,
        fuelPerLapLiters: Number.isFinite(record.fuelPerLapLiters) && record.fuelPerLapLiters > 0 ? record.fuelPerLapLiters : fallback.pitFuel.fuelPerLapLiters,
        fuelMarginLaps: Number.isFinite(record.fuelMarginLaps) && record.fuelMarginLaps >= 0 ? record.fuelMarginLaps : fallback.pitFuel.fuelMarginLaps,
      },
      raceInfo: {
        tireWearMultiplier: Number.isFinite(record.tireWearMultiplier) && record.tireWearMultiplier >= 0 ? record.tireWearMultiplier : 1,
        fuelMultiplier: Number.isFinite(record.fuelMultiplier) && record.fuelMultiplier >= 0 ? record.fuelMultiplier : 1,
      },
      tires: tiresMap,
    };

    var stints = Array.isArray(record.stints)
      ? record.stints.map(function (s, idx) {
          return {
            id: 'loaded-' + idx,
            compound: COMPOUND_ORDER.indexOf(s.compound) !== -1 ? s.compound : 'medium',
            laps: Number.isFinite(s.laps) && s.laps >= 1 ? Math.floor(s.laps) : 1,
            changeTires: idx === 0 ? true : Boolean(s.changeTires),
          };
        })
      : null;

    return { config: config, stints: stints };
  }

  function applySavedStrategyToPlanner(record, currentLang, currentTheme) {
    var reconstructed = savedRecordToConfig(record);
    saveAppState({
      language: currentLang === 'en' ? 'en' : 'fr',
      theme: currentTheme === 'light' ? 'light' : 'dark',
      config: reconstructed.config,
    });
    saveActiveCustomStints(reconstructed.stints);
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
    loadActiveCustomStints: loadActiveCustomStints,
    saveActiveCustomStints: saveActiveCustomStints,
    buildSavedStrategyRecord: buildSavedStrategyRecord,
    listSavedStrategies: listSavedStrategies,
    saveStrategyLocally: saveStrategyLocally,
    deleteLocalStrategy: deleteLocalStrategy,
    savedRecordToConfig: savedRecordToConfig,
    applySavedStrategyToPlanner: applySavedStrategyToPlanner,
  };
});
