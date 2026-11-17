(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./logic.js'));
  } else {
    root.GT7Db = factory(root.GT7Logic);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Logic) {
  'use strict';

  var STORAGE_MODE_KEY = 'gt7_endurance_storage_mode_v1';
  var LOCAL_SAVED_KEY = 'gt7_endurance_saved_strategies_v1';
  var RETENTION_DAYS = 10;
  var RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  var CLOCK_SKEW_BUFFER_MS = 5 * 60 * 1000;
  var FIREBASE_SDK_BASE = 'https://www.gstatic.com/firebasejs/11.6.0/';

  var OperationType = {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  };

  var firebaseState = {
    initialized: false,
    available: false,
    initPromise: null,
    app: null,
    db: null,
    auth: null,
    fsMod: null,
    authMod: null,
    user: null,
    authListeners: [],
    pendingExpiredIds: [],
    lastError: null,
  };

  function purgeExpiredSharedDocs() {
    var activeUser = firebaseState.auth ? firebaseState.auth.currentUser : null;
    if (!firebaseState.available || !firebaseState.db || !firebaseState.fsMod) return;
    if (!activeUser || !activeUser.emailVerified || firebaseState.pendingExpiredIds.length === 0) return;

    var ids = firebaseState.pendingExpiredIds.slice();
    firebaseState.pendingExpiredIds = [];
    for (var i = 0; i < ids.length; i++) {
      (function (expiredId) {
        firebaseState.fsMod
          .deleteDoc(firebaseState.fsMod.doc(firebaseState.db, 'strategies', expiredId))
          .catch(function () {
            // Ignore if already deleted or rule rejects
          });
      })(ids[i]);
    }
  }

  function clampString(val, maxLen, fallback) {
    var s = typeof val === 'string' ? val.trim() : '';
    if (!s && typeof fallback === 'string') s = fallback;
    if (s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }

  function clampNumber(val, minVal, maxVal, fallback) {
    var n = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
    if (n < minVal) n = minVal;
    if (n > maxVal) n = maxVal;
    return n;
  }

  function clampInt(val, minVal, maxVal, fallback) {
    return Math.round(clampNumber(val, minVal, maxVal, fallback));
  }

  function getStorageMode() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return 'shared';
      var saved = window.localStorage.getItem(STORAGE_MODE_KEY);
      return saved === 'local' ? 'local' : 'shared';
    } catch (_e) {
      return 'shared';
    }
  }

  function setStorageMode(mode) {
    var normalized = mode === 'local' ? 'local' : 'shared';
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_MODE_KEY, normalized);
      }
    } catch (_e) {
      // Ignore storage errors
    }
    return normalized;
  }

  function generateDocId() {
    var rand = Math.random().toString(36).slice(2, 9);
    return 'strat_' + Date.now().toString(36) + '_' + rand;
  }

  function toMillis(val) {
    if (!val) return 0;
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (typeof val === 'string') {
      var parsed = new Date(val).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  function getExpiresAtMs(record) {
    if (!record) return 0;
    if (typeof record.expiresAtMs === 'number' && record.expiresAtMs > 0) return record.expiresAtMs;
    var exp = toMillis(record.expiresAt);
    if (exp > 0) return exp;
    var created = toMillis(record.createdAt) || toMillis(record.updatedAt);
    return created > 0 ? created + RETENTION_MS : 0;
  }

  function isExpiredRecord(record, nowMs) {
    var now = typeof nowMs === 'number' ? nowMs : Date.now();
    var exp = getExpiresAtMs(record);
    return exp > 0 && exp <= now;
  }

  function getDaysRemaining(record, nowMs) {
    var now = typeof nowMs === 'number' ? nowMs : Date.now();
    var exp = getExpiresAtMs(record);
    if (!exp) return RETENTION_DAYS;
    var diff = exp - now;
    if (diff <= 0) return 0;
    return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }

  function handleFirestoreError(error, operationType, path) {
    var user = firebaseState.auth ? firebaseState.auth.currentUser : null;
    var errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: user ? user.uid : null,
        email: user ? user.email : null,
        emailVerified: user ? user.emailVerified : null,
        isAnonymous: user ? user.isAnonymous : null,
        tenantId: user ? user.tenantId : null,
        providerInfo: user && Array.isArray(user.providerData)
          ? user.providerData.map(function (provider) {
              return {
                providerId: provider.providerId,
                email: provider.email,
              };
            })
          : [],
      },
      operationType: operationType,
      path: path,
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }

  function notifyAuthListeners() {
    for (var i = 0; i < firebaseState.authListeners.length; i++) {
      try {
        firebaseState.authListeners[i](firebaseState.user);
      } catch (_e) {
        // Ignore listener errors
      }
    }
  }

  function init() {
    if (firebaseState.initPromise) return firebaseState.initPromise;

    firebaseState.initPromise = (async function () {
      if (typeof window === 'undefined' || typeof fetch !== 'function') {
        firebaseState.initialized = true;
        firebaseState.available = false;
        return false;
      }

      try {
        var res = await fetch('./firebase-applet-config.json', { cache: 'no-store' });
        if (!res.ok) {
          firebaseState.initialized = true;
          firebaseState.available = false;
          return false;
        }
        var fbConfig = await res.json();
        if (!fbConfig || !fbConfig.projectId || fbConfig.projectId === 'remixed-project-id') {
          firebaseState.initialized = true;
          firebaseState.available = false;
          return false;
        }

        var mods = await Promise.all([
          import(FIREBASE_SDK_BASE + 'firebase-app.js'),
          import(FIREBASE_SDK_BASE + 'firebase-firestore.js'),
          import(FIREBASE_SDK_BASE + 'firebase-auth.js'),
        ]);

        var appMod = mods[0];
        var fsMod = mods[1];
        var authMod = mods[2];

        var app = appMod.initializeApp(fbConfig);
        var db = fbConfig.firestoreDatabaseId
          ? fsMod.getFirestore(app, fbConfig.firestoreDatabaseId)
          : fsMod.getFirestore(app);
        var auth = authMod.getAuth(app);

        firebaseState.app = app;
        firebaseState.db = db;
        firebaseState.auth = auth;
        firebaseState.fsMod = fsMod;
        firebaseState.authMod = authMod;
        firebaseState.available = true;
        firebaseState.initialized = true;

        // Startup connection validation check
        try {
          await fsMod.getDocFromServer(fsMod.doc(db, 'test', 'connection'));
        } catch (connErr) {
          if (connErr instanceof Error && connErr.message.indexOf('the client is offline') !== -1) {
            console.error('Please check your Firebase configuration.');
          }
        }

        authMod.onAuthStateChanged(auth, function (user) {
          firebaseState.user = user || null;
          notifyAuthListeners();
          purgeExpiredSharedDocs();
        });

        return true;
      } catch (err) {
        firebaseState.lastError = err;
        firebaseState.initialized = true;
        firebaseState.available = false;
        return false;
      }
    })();

    return firebaseState.initPromise;
  }

  function isFirebaseAvailable() {
    return firebaseState.available;
  }

  function getCurrentUser() {
    return firebaseState.user;
  }

  function onAuthChange(cb) {
    if (typeof cb !== 'function') return function () {};
    firebaseState.authListeners.push(cb);
    if (firebaseState.initialized) {
      cb(firebaseState.user);
    }
    return function () {
      firebaseState.authListeners = firebaseState.authListeners.filter(function (fn) {
        return fn !== cb;
      });
    };
  }

  async function signInWithGoogle() {
    await init();
    if (!firebaseState.available || !firebaseState.auth || !firebaseState.authMod) {
      throw new Error('Firebase is not available in this environment.');
    }
    var provider = new firebaseState.authMod.GoogleAuthProvider();
    var cred = await firebaseState.authMod.signInWithPopup(firebaseState.auth, provider);
    firebaseState.user = cred.user || null;
    notifyAuthListeners();
    return firebaseState.user;
  }

  async function signOutUser() {
    await init();
    if (!firebaseState.available || !firebaseState.auth || !firebaseState.authMod) return;
    await firebaseState.authMod.signOut(firebaseState.auth);
    firebaseState.user = null;
    notifyAuthListeners();
  }

  function buildStrategyPayload(params) {
    var cfg = params.config;
    var stints = Array.isArray(params.stints) ? params.stints : [];
    var evaluated = params.evaluated || {};
    var car = cfg.car || {};
    var ri = cfg.raceInfo || {};
    var pf = cfg.pitFuel || {};

    var sanitizedTires = {};
    for (var i = 0; i < Logic.COMPOUND_ORDER.length; i++) {
      var cid = Logic.COMPOUND_ORDER[i];
      var t = (cfg.tires && cfg.tires[cid]) || {};
      sanitizedTires[cid] = {
        enabled: Boolean(t.enabled),
        lapTimeInput: clampString(t.lapTimeInput, 20, '2:00.000'),
        maxLaps: clampInt(t.maxLaps, 1, 500, 10),
        mandatory: Boolean(t.mandatory),
      };
    }

    var sanitizedStints = stints.slice(0, 50).map(function (s, idx) {
      var comp = Logic.COMPOUND_ORDER.indexOf(s.compound) !== -1 ? s.compound : 'medium';
      return {
        compound: comp,
        laps: clampInt(s.laps, 1, 1000, 1),
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

    var payload = {
      title: clampString(params.title, 100, clampString(cfg.trackName, 100, 'GT7 Strategy')),
      visibility: 'public',
      authorUid: clampString(params.authorUid, 128, 'local'),
      authorName: clampString(params.authorName, 80, 'GT7 Driver'),
      trackName: clampString(cfg.trackName, 120, 'Custom Circuit'),
      trackLengthKm: clampNumber(cfg.trackLengthKm, 0, 1000, 0),
      carName: clampString(car.name, 120, ''),
      carCategory: clampString(car.category, 60, ''),
      bopPowerHp: clampNumber(car.bopPowerHp, 0, 3000, 0),
      bopWeightKg: clampNumber(car.bopWeightKg, 0, 5000, 0),
      mode: cfg.mode === 'laps' ? 'laps' : 'duration',
      durationInput: clampString(cfg.durationInput, 30, '1h00'),
      durationMinutes: clampNumber(cfg.durationMinutes, 0.1, 2000, 60),
      totalLaps: clampInt(cfg.totalLaps, 1, 1000, 25),
      tireWearMultiplier: clampNumber(ri.tireWearMultiplier, 0, 50, 1),
      fuelMultiplier: clampNumber(ri.fuelMultiplier, 0, 50, 1),
      pitTransitSeconds: clampNumber(pf.pitTransitSeconds, 0, 600, 24),
      tireChangeSeconds: clampNumber(pf.tireChangeSeconds, 0, 600, 8),
      refuelRateLps: clampNumber(pf.refuelRateLps, 0.1, 100, 4),
      fuelPerLapLiters: clampNumber(pf.fuelPerLapLiters, 0.1, 100, 7.8),
      fuelMarginLaps: clampNumber(pf.fuelMarginLaps, 0, 10, 0.5),
      tires: sanitizedTires,
      stints: sanitizedStints,
      summary: {
        totalLaps: clampInt(evaluated.totalLaps, 0, 5000, totalLapsSum),
        totalStops: clampInt(evaluated.totalStops, 0, 50, Math.max(0, sanitizedStints.length - 1)),
        totalTimeSeconds: clampNumber(evaluated.totalTimeSeconds, 0, 2000000, 0),
        totalFuelAddedLiters: clampNumber(evaluated.totalFuelAddedLiters, 0, 100000, 0),
        stintsLabel: clampString(stintsLabel, 300, ''),
      },
    };

    var nowMs = Date.now();
    if (params.forFirestore && firebaseState.fsMod) {
      payload.createdAt = firebaseState.fsMod.serverTimestamp();
      payload.updatedAt = firebaseState.fsMod.serverTimestamp();
      payload.expiresAt = firebaseState.fsMod.Timestamp.fromMillis(nowMs + RETENTION_MS - CLOCK_SKEW_BUFFER_MS);
    } else {
      var nowIso = new Date(nowMs).toISOString();
      payload.createdAt = nowIso;
      payload.updatedAt = nowIso;
      payload.expiresAt = new Date(nowMs + RETENTION_MS).toISOString();
    }

    return payload;
  }

  function listLocalStrategies() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return [];
      var raw = window.localStorage.getItem(LOCAL_SAVED_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var nowMs = Date.now();
      var active = [];
      var removedAny = false;
      for (var i = 0; i < parsed.length; i++) {
        var item = parsed[i];
        if (isExpiredRecord(item, nowMs)) {
          removedAny = true;
          continue;
        }
        active.push(Object.assign({}, item, {
          source: 'local',
          expiresAtMs: getExpiresAtMs(item),
        }));
      }
      if (removedAny) {
        saveLocalStrategiesList(active);
      }
      return active.sort(function (a, b) {
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      });
    } catch (_e) {
      return [];
    }
  }

  function saveLocalStrategiesList(list) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(LOCAL_SAVED_KEY, JSON.stringify(list));
    } catch (_e) {
      // Ignore storage errors
    }
  }

  function deleteLocalStrategy(id) {
    var list = listLocalStrategies().filter(function (item) {
      return item.id !== id;
    });
    saveLocalStrategiesList(list);
    return list;
  }

  async function saveStrategy(params) {
    var target = params.target === 'local' ? 'local' : 'shared';

    if (target === 'local') {
      var localId = 'local_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      var localRecord = buildStrategyPayload({
        title: params.title,
        config: params.config,
        stints: params.stints,
        evaluated: params.evaluated,
        authorUid: 'local',
        authorName: params.localAuthorName || 'Local',
        forFirestore: false,
      });
      localRecord.id = localId;
      localRecord.source = 'local';
      var list = listLocalStrategies();
      list.unshift(localRecord);
      saveLocalStrategiesList(list);
      return { id: localId, target: 'local', record: localRecord };
    }

    await init();
    if (!firebaseState.available || !firebaseState.db || !firebaseState.fsMod) {
      throw new Error('SHARED_DB_UNAVAILABLE');
    }

    var user = firebaseState.auth.currentUser;
    if (!user) {
      user = await signInWithGoogle();
    }
    if (!user) {
      throw new Error('AUTH_REQUIRED');
    }

    var docId = generateDocId();
    var docPath = 'strategies/' + docId;
    var authorLabel = user.displayName || 'GT7 Driver';
    var fsPayload = buildStrategyPayload({
      title: params.title,
      config: params.config,
      stints: params.stints,
      evaluated: params.evaluated,
      authorUid: user.uid,
      authorName: authorLabel,
      forFirestore: true,
    });

    try {
      await firebaseState.fsMod.setDoc(firebaseState.fsMod.doc(firebaseState.db, 'strategies', docId), fsPayload);
      return { id: docId, target: 'shared', record: Object.assign({ id: docId, source: 'shared' }, fsPayload) };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, docPath);
    }
  }

  async function publishLocalToShared(localItem) {
    await init();
    if (!firebaseState.available || !firebaseState.db || !firebaseState.fsMod) {
      throw new Error('SHARED_DB_UNAVAILABLE');
    }

    var user = firebaseState.auth.currentUser;
    if (!user) {
      user = await signInWithGoogle();
    }
    if (!user) {
      throw new Error('AUTH_REQUIRED');
    }

    var docId = generateDocId();
    var docPath = 'strategies/' + docId;
    var reconstructed = savedRecordToConfig(localItem);
    var fsPayload = buildStrategyPayload({
      title: localItem.title,
      config: reconstructed.config,
      stints: reconstructed.stints,
      evaluated: localItem.summary,
      authorUid: user.uid,
      authorName: user.displayName || 'GT7 Driver',
      forFirestore: true,
    });

    try {
      await firebaseState.fsMod.setDoc(firebaseState.fsMod.doc(firebaseState.db, 'strategies', docId), fsPayload);
      return docId;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, docPath);
    }
  }

  async function deleteSharedStrategy(docId) {
    await init();
    if (!firebaseState.available || !firebaseState.db || !firebaseState.fsMod) {
      throw new Error('SHARED_DB_UNAVAILABLE');
    }
    var docPath = 'strategies/' + docId;
    try {
      await firebaseState.fsMod.deleteDoc(firebaseState.fsMod.doc(firebaseState.db, 'strategies', docId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  }

  async function subscribeSharedStrategies(onData, onError) {
    await init();
    if (!firebaseState.available || !firebaseState.db || !firebaseState.fsMod) {
      onData([]);
      return function () {};
    }

    var fsMod = firebaseState.fsMod;
    var colPath = 'strategies';
    var q = fsMod.query(
      fsMod.collection(firebaseState.db, colPath),
      fsMod.where('visibility', '==', 'public'),
      fsMod.limit(100)
    );

    return fsMod.onSnapshot(
      q,
      function (snapshot) {
        var items = [];
        var expiredIds = [];
        var nowMs = Date.now();

        snapshot.forEach(function (docSnap) {
          var data = docSnap.data();
          var updatedMs = toMillis(data.updatedAt);
          var expiresAtMs = getExpiresAtMs(data);
          if (expiresAtMs > 0 && expiresAtMs <= nowMs) {
            expiredIds.push(docSnap.id);
            return;
          }
          items.push(
            Object.assign({}, data, {
              id: docSnap.id,
              source: 'shared',
              updatedAtMs: updatedMs,
              expiresAtMs: expiresAtMs,
            })
          );
        });

        items.sort(function (a, b) {
          return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
        });
        onData(items);

        if (expiredIds.length > 0) {
          firebaseState.pendingExpiredIds = expiredIds;
          purgeExpiredSharedDocs();
        }
      },
      function (error) {
        try {
          handleFirestoreError(error, OperationType.LIST, colPath);
        } catch (wrappedErr) {
          if (typeof onError === 'function') {
            onError(wrappedErr);
          }
        }
      }
    );
  }

  function savedRecordToConfig(record) {
    var fallback = Logic.createDefaultConfig();
    var tiresMap = {};
    for (var i = 0; i < Logic.COMPOUND_ORDER.length; i++) {
      var cid = Logic.COMPOUND_ORDER[i];
      var src = record.tires && record.tires[cid] ? record.tires[cid] : fallback.tires[cid];
      tiresMap[cid] = Logic.createTireConfig(
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
            compound: Logic.COMPOUND_ORDER.indexOf(s.compound) !== -1 ? s.compound : 'medium',
            laps: Number.isFinite(s.laps) && s.laps >= 1 ? Math.floor(s.laps) : 1,
            changeTires: idx === 0 ? true : Boolean(s.changeTires),
          };
        })
      : null;

    return { config: config, stints: stints };
  }

  function applySavedStrategyToPlanner(record, currentLang, currentTheme) {
    var reconstructed = savedRecordToConfig(record);
    Logic.saveAppState({
      language: currentLang === 'en' ? 'en' : 'fr',
      theme: currentTheme === 'light' ? 'light' : 'dark',
      config: reconstructed.config,
    });
    Logic.saveActiveCustomStints(reconstructed.stints);
  }

  return {
    OperationType: OperationType,
    RETENTION_DAYS: RETENTION_DAYS,
    RETENTION_MS: RETENTION_MS,
    getExpiresAtMs: getExpiresAtMs,
    isExpiredRecord: isExpiredRecord,
    getDaysRemaining: getDaysRemaining,
    init: init,
    isFirebaseAvailable: isFirebaseAvailable,
    getStorageMode: getStorageMode,
    setStorageMode: setStorageMode,
    getCurrentUser: getCurrentUser,
    onAuthChange: onAuthChange,
    signInWithGoogle: signInWithGoogle,
    signOutUser: signOutUser,
    buildStrategyPayload: buildStrategyPayload,
    listLocalStrategies: listLocalStrategies,
    deleteLocalStrategy: deleteLocalStrategy,
    saveStrategy: saveStrategy,
    publishLocalToShared: publishLocalToShared,
    deleteSharedStrategy: deleteSharedStrategy,
    subscribeSharedStrategies: subscribeSharedStrategies,
    savedRecordToConfig: savedRecordToConfig,
    applySavedStrategyToPlanner: applySavedStrategyToPlanner,
  };
});
