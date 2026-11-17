(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./logic.js'));
  } else {
    root.GT7Strategy = factory(root.GT7Logic);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Logic) {
  'use strict';

  var COMPOUND_ORDER = Logic.COMPOUND_ORDER;
  var TANK_CAPACITY_LITERS = Logic.TANK_CAPACITY_LITERS;
  var formatRaceTime = Logic.formatRaceTime;
  var EPS = 1e-6;

  function isBetterStrategy(candidate, incumbent, mode) {
    if (mode === 'duration') {
      if (candidate.totalLaps !== incumbent.totalLaps) {
        return candidate.totalLaps > incumbent.totalLaps;
      }
      return candidate.totalTimeSeconds < incumbent.totalTimeSeconds - EPS;
    }
    return candidate.totalTimeSeconds < incumbent.totalTimeSeconds - EPS;
  }

  function normalizeStintTireFlags(stintsInput) {
    return stintsInput.map(function (s, idx) {
      var copy = Object.assign({}, s);
      if (idx === 0) {
        copy.changeTires = true;
      } else if (copy.compound !== stintsInput[idx - 1].compound) {
        copy.changeTires = true;
      }
      return copy;
    });
  }

  function reorderStints(stintsInput, fromIndex, toIndex) {
    if (
      !Array.isArray(stintsInput) ||
      fromIndex < 0 ||
      fromIndex >= stintsInput.length ||
      toIndex < 0 ||
      toIndex >= stintsInput.length ||
      fromIndex === toIndex
    ) {
      return stintsInput ? stintsInput.slice() : [];
    }
    var list = stintsInput.map(function (s) {
      return Object.assign({}, s);
    });
    var moved = list.splice(fromIndex, 1)[0];
    list.splice(toIndex, 0, moved);
    return normalizeStintTireFlags(list);
  }

  function evaluateStrategy(config, stintsInput) {
    var issues = [];
    var pitFuel = config.pitFuel;
    var tires = config.tires;
    var mode = config.mode;
    var fuelPerLap = pitFuel.fuelPerLapLiters;
    var marginLaps = pitFuel.fuelMarginLaps;
    var refuelRate = pitFuel.refuelRateLps;

    if (!Number.isFinite(fuelPerLap) || fuelPerLap <= 0 || fuelPerLap > TANK_CAPACITY_LITERS) {
      issues.push({ code: 'INVALID_FUEL_PER_LAP', severity: 'error' });
    }

    var activeTires = COMPOUND_ORDER.filter(function (id) {
      return tires[id].enabled && tires[id].lapTimeSeconds !== null && tires[id].lapTimeSeconds > 0;
    });

    if (activeTires.length === 0) {
      issues.push({ code: 'NO_ACTIVE_TIRES', severity: 'error' });
    }

    var evaluatedStints = [];
    var compoundsUsedSet = new Set();

    var prevFuelEnd = TANK_CAPACITY_LITERS;
    var prevCompound = null;
    var prevTireLapsEnd = 0;
    var tireSetNumber = 0;
    var cumulativeTime = 0;
    var cumulativeLaps = 0;
    var totalDrivingSeconds = 0;
    var totalPitSeconds = 0;
    var totalFuelUsedLiters = 0;
    var totalFuelAddedLiters = 0;

    var targetSeconds = config.durationMinutes * 60;

    for (var i = 0; i < stintsInput.length; i++) {
      var stint = stintsInput[i];
      var tireSpec = tires[stint.compound];
      var lapTime = tireSpec.lapTimeSeconds || 0;

      if (!tireSpec.enabled || lapTime <= 0) {
        issues.push({
          code: 'COMPOUND_DISABLED',
          severity: 'error',
          stintIndex: i,
          compound: stint.compound,
        });
      }

      if (stint.laps < 1) {
        issues.push({
          code: 'ZERO_LAPS_STINT',
          severity: 'error',
          stintIndex: i,
        });
      }

      var isFirst = i === 0;
      var actualChangeTires = isFirst
        ? true
        : stint.compound !== prevCompound
          ? true
          : Boolean(stint.changeTires);

      var fuelAdded = 0;
      var fuelStart = TANK_CAPACITY_LITERS;
      var pitDuration = 0;

      if (!isFirst) {
        var neededFuel = (stint.laps + marginLaps) * fuelPerLap;
        var targetFuel = Math.min(TANK_CAPACITY_LITERS, Math.max(0, neededFuel));
        fuelAdded = Math.max(0, targetFuel - prevFuelEnd);
        fuelStart = prevFuelEnd + fuelAdded;
        var refuelTime = refuelRate > 0 ? fuelAdded / refuelRate : 0;
        pitDuration =
          pitFuel.pitTransitSeconds +
          (actualChangeTires ? pitFuel.tireChangeSeconds : 0) +
          refuelTime;
      }

      var fuelUsed = stint.laps * fuelPerLap;
      var fuelEnd = fuelStart - fuelUsed;

      if (fuelEnd < -EPS) {
        issues.push({
          code: 'STINT_EXCEEDS_TANK',
          severity: 'error',
          stintIndex: i,
          detail: fuelUsed.toFixed(1),
        });
      }

      var tireLapsStart = 0;
      if (isFirst || actualChangeTires) {
        tireSetNumber += 1;
        tireLapsStart = 0;
      } else {
        tireLapsStart = prevTireLapsEnd;
      }
      var tireLapsEnd = tireLapsStart + stint.laps;

      if (tireLapsEnd > tireSpec.maxLaps) {
        issues.push({
          code: 'TIRE_SET_EXCEEDED',
          severity: 'error',
          stintIndex: i,
          compound: stint.compound,
          detail: tireLapsEnd + '/' + tireSpec.maxLaps,
        });
      }

      var drivingSeconds = stint.laps * lapTime;
      cumulativeTime += pitDuration + drivingSeconds;
      cumulativeLaps += stint.laps;
      totalDrivingSeconds += drivingSeconds;
      totalPitSeconds += pitDuration;
      totalFuelUsedLiters += fuelUsed;
      totalFuelAddedLiters += fuelAdded;

      compoundsUsedSet.add(stint.compound);

      if (mode === 'duration' && lapTime > 0 && stint.laps >= 1) {
        if (i < stintsInput.length - 1) {
          if (cumulativeTime >= targetSeconds - EPS) {
            issues.push({
              code: 'DURATION_OVERSHOT_EXTRA_LAP',
              severity: 'error',
              stintIndex: i,
            });
          }
        } else {
          if (cumulativeTime - lapTime >= targetSeconds - EPS) {
            issues.push({
              code: 'DURATION_OVERSHOT_EXTRA_LAP',
              severity: 'error',
              stintIndex: i,
            });
          }
        }
      }

      evaluatedStints.push({
        index: i,
        compound: stint.compound,
        laps: stint.laps,
        changeTires: isFirst ? true : actualChangeTires,
        tireSetNumber: tireSetNumber,
        tireLapsStart: tireLapsStart,
        tireLapsEnd: tireLapsEnd,
        tireMaxLaps: tireSpec.maxLaps,
        fuelStartLiters: fuelStart,
        fuelUsedLiters: fuelUsed,
        fuelEndLiters: fuelEnd,
        fuelAddedBeforeStint: fuelAdded,
        pitDurationBeforeStint: pitDuration,
        lapTimeSeconds: lapTime,
        drivingSeconds: drivingSeconds,
        cumulativeTimeEndSeconds: cumulativeTime,
        cumulativeLapsEnd: cumulativeLaps,
      });

      prevFuelEnd = fuelEnd;
      prevCompound = stint.compound;
      prevTireLapsEnd = tireLapsEnd;
    }

    if (mode === 'laps') {
      if (cumulativeLaps !== config.totalLaps) {
        issues.push({
          code: 'LAPS_MISMATCH',
          severity: 'error',
          detail: cumulativeLaps + '/' + config.totalLaps,
        });
      }
    } else {
      if (cumulativeTime < targetSeconds - EPS) {
        issues.push({
          code: 'DURATION_NOT_REACHED',
          severity: 'error',
          detail: formatRaceTime(cumulativeTime) + '/' + formatRaceTime(targetSeconds),
        });
      }
    }

    for (var m = 0; m < COMPOUND_ORDER.length; m++) {
      var id = COMPOUND_ORDER[m];
      if (tires[id].mandatory && !compoundsUsedSet.has(id)) {
        issues.push({
          code: 'MANDATORY_COMPOUND_MISSING',
          severity: 'error',
          compound: id,
        });
      }
    }

    return {
      stints: evaluatedStints,
      totalLaps: cumulativeLaps,
      totalStops: Math.max(0, evaluatedStints.length - 1),
      totalTimeSeconds: cumulativeTime,
      totalDrivingSeconds: totalDrivingSeconds,
      totalPitSeconds: totalPitSeconds,
      totalFuelUsedLiters: totalFuelUsedLiters,
      totalFuelAddedLiters: totalFuelAddedLiters,
      compoundsUsed: Array.from(compoundsUsedSet),
      tireSetsUsed: tireSetNumber,
      isValid: issues.filter(function (x) { return x.severity === 'error'; }).length === 0,
      issues: issues,
    };
  }

  function insertPareto(list, candidate) {
    for (var i = 0; i < list.length; i++) {
      var existing = list[i];
      if (existing.time <= candidate.time + EPS && existing.fuel >= candidate.fuel - EPS) {
        return;
      }
    }
    for (var j = list.length - 1; j >= 0; j--) {
      var ex = list[j];
      if (candidate.time <= ex.time + EPS && candidate.fuel >= ex.fuel - EPS) {
        list.splice(j, 1);
      }
    }
    list.push(candidate);
  }

  function buildEvaluatedFromSteps(config, activeCompounds, steps) {
    var stintInputs = steps.map(function (s, idx) {
      return {
        id: 'opt-' + idx,
        compound: activeCompounds[s.compIdx],
        laps: s.laps,
        changeTires: s.changeTires,
      };
    });
    return evaluateStrategy(config, stintInputs);
  }

  function findOptimalStrategies(config) {
    var pitFuel = config.pitFuel;
    var tires = config.tires;
    var mode = config.mode;
    var fuelPerLap = pitFuel.fuelPerLapLiters;
    var marginLaps = pitFuel.fuelMarginLaps;
    var refuelRate = pitFuel.refuelRateLps;

    if (!Number.isFinite(fuelPerLap) || fuelPerLap <= 0 || fuelPerLap > TANK_CAPACITY_LITERS) {
      return { best: null, alternatives: [], error: 'INVALID_FUEL_PER_LAP' };
    }
    if (!Number.isFinite(refuelRate) || refuelRate <= 0) {
      return { best: null, alternatives: [], error: 'INVALID_REFUEL_RATE' };
    }

    for (var k = 0; k < COMPOUND_ORDER.length; k++) {
      var cid = COMPOUND_ORDER[k];
      if (tires[cid].mandatory && (!tires[cid].enabled || !tires[cid].lapTimeSeconds || tires[cid].lapTimeSeconds <= 0)) {
        return { best: null, alternatives: [], error: 'MANDATORY_COMPOUND_DISABLED' };
      }
    }

    var activeCompounds = COMPOUND_ORDER.filter(function (id) {
      return (
        tires[id].enabled &&
        tires[id].lapTimeSeconds !== null &&
        tires[id].lapTimeSeconds > 0 &&
        tires[id].maxLaps >= 1
      );
    });

    if (activeCompounds.length === 0) {
      return { best: null, alternatives: [], error: 'NO_ACTIVE_TIRES' };
    }

    var maxFuelLaps = Math.floor((TANK_CAPACITY_LITERS + EPS) / fuelPerLap);
    if (maxFuelLaps < 1) {
      return { best: null, alternatives: [], error: 'STINT_EXCEEDS_TANK' };
    }

    var lapTimes = activeCompounds.map(function (id) { return tires[id].lapTimeSeconds; });
    var maxLapsArr = activeCompounds.map(function (id) { return tires[id].maxLaps; });
    var mandatoryFlags = activeCompounds.map(function (id) { return tires[id].mandatory ? 1 : 0; });

    var fullMandatoryMask = 0;
    var mandatoryCount = 0;
    var mandatoryBitForComp = activeCompounds.map(function (_, idx) {
      if (mandatoryFlags[idx]) {
        var bit = 1 << mandatoryCount;
        fullMandatoryMask |= bit;
        mandatoryCount++;
        return bit;
      }
      return 0;
    });

    var minLapTime = Math.min.apply(null, lapTimes);
    var targetLaps = mode === 'laps' ? config.totalLaps : 0;
    var targetSeconds = mode === 'duration' ? config.durationMinutes * 60 : 0;

    if (mode === 'laps' && targetLaps < 1) {
      return { best: null, alternatives: [], error: 'INVALID_LAPS' };
    }
    if (mode === 'duration' && targetSeconds <= 0) {
      return { best: null, alternatives: [], error: 'INVALID_DURATION' };
    }

    var estLaps = mode === 'laps' ? targetLaps : Math.ceil(targetSeconds / minLapTime);
    var minStopsEstimate = Math.max(Math.ceil(estLaps / maxFuelLaps) - 1, Math.max(0, mandatoryCount - 1));
    var maxStops = mode === 'laps'
      ? Math.min(targetLaps - 1, minStopsEstimate + 4)
      : Math.min(estLaps + 2, minStopsEstimate + 4);

    var useBeam = minStopsEstimate > 12;
    var BEAM_PER_BUCKET = 40;

    var bestByStops = new Map();
    var bestHolder = { current: null };

    function recordTerminal(stops, state) {
      if (state.mask !== fullMandatoryMask) return;
      var evaluated = buildEvaluatedFromSteps(config, activeCompounds, state.stints);
      if (!evaluated.isValid) return;

      var prevForStops = bestByStops.get(stops);
      if (!prevForStops || isBetterStrategy(evaluated, prevForStops, mode)) {
        bestByStops.set(stops, evaluated);
      }
      if (!bestHolder.current || isBetterStrategy(evaluated, bestHolder.current, mode)) {
        bestHolder.current = evaluated;
      }
    }

    var currentLayer = new Map();

    for (var c = 0; c < activeCompounds.length; c++) {
      var maxAllowedStint = Math.min(maxFuelLaps, maxLapsArr[c]);
      var upperL = mode === 'laps' ? Math.min(maxAllowedStint, targetLaps) : maxAllowedStint;

      for (var L = 1; L <= upperL; L++) {
        var t = L * lapTimes[c];
        var fuel = TANK_CAPACITY_LITERS - L * fuelPerLap;
        var mask = mandatoryBitForComp[c];

        if (mode === 'laps') {
          var nextState = {
            lapsDone: L,
            time: t,
            fuel: fuel,
            mask: mask,
            compIdx: c,
            tireLaps: L >= maxLapsArr[c] ? maxLapsArr[c] : L,
            stints: [{ compIdx: c, laps: L, changeTires: true }],
          };
          if (L === targetLaps) {
            recordTerminal(0, nextState);
          } else {
            var remaining = targetLaps - L;
            if (remaining <= maxStops * maxFuelLaps) {
              var key = L + '|' + mask + '|' + c + '|' + nextState.tireLaps;
              var bucket = currentLayer.get(key);
              if (!bucket) {
                bucket = [];
                currentLayer.set(key, bucket);
              }
              insertPareto(bucket, nextState);
            }
          }
        } else {
          if (t >= targetSeconds - EPS) {
            if (t - lapTimes[c] < targetSeconds - EPS) {
              recordTerminal(0, {
                lapsDone: L,
                time: t,
                fuel: fuel,
                mask: mask,
                compIdx: c,
                tireLaps: L,
                stints: [{ compIdx: c, laps: L, changeTires: true }],
              });
            }
            break;
          } else {
            var durState = {
              lapsDone: L,
              time: t,
              fuel: fuel,
              mask: mask,
              compIdx: c,
              tireLaps: L >= maxLapsArr[c] ? maxLapsArr[c] : L,
              stints: [{ compIdx: c, laps: L, changeTires: true }],
            };
            var dKey = L + '|' + mask + '|' + c + '|' + durState.tireLaps;
            var dBucket = currentLayer.get(dKey);
            if (!dBucket) {
              dBucket = [];
              currentLayer.set(dKey, dBucket);
            }
            insertPareto(dBucket, durState);
          }
        }
      }
    }

    for (var s = 1; s <= maxStops; s++) {
      if (currentLayer.size === 0) break;

      var statesToExpand = [];
      currentLayer.forEach(function (list) {
        for (var idx = 0; idx < list.length; idx++) {
          statesToExpand.push(list[idx]);
        }
      });

      if (useBeam && statesToExpand.length > BEAM_PER_BUCKET * 20) {
        var byMask = new Map();
        for (var bi = 0; bi < statesToExpand.length; bi++) {
          var bst = statesToExpand[bi];
          var group = byMask.get(bst.mask);
          if (!group) {
            group = [];
            byMask.set(bst.mask, group);
          }
          group.push(bst);
        }
        var perMaskQuota = Math.max(20, Math.floor((BEAM_PER_BUCKET * 20) / Math.max(1, byMask.size)));
        var kept = [];
        byMask.forEach(function (grp) {
          grp.sort(function (a, b) {
            return a.time / a.lapsDone - b.time / b.lapsDone;
          });
          for (var ki = 0; ki < Math.min(grp.length, perMaskQuota); ki++) {
            kept.push(grp[ki]);
          }
        });
        statesToExpand = kept;
      }

      var nextLayer = new Map();

      for (var pi = 0; pi < statesToExpand.length; pi++) {
        var prev = statesToExpand[pi];
        if (mode === 'laps' && bestHolder.current && s === maxStops) {
          var remLaps = targetLaps - prev.lapsDone;
          var optimisticMinEnd = prev.time + pitFuel.pitTransitSeconds + remLaps * minLapTime;
          if (optimisticMinEnd >= bestHolder.current.totalTimeSeconds - EPS && bestByStops.has(s)) {
            var prevStopsBest = bestByStops.get(s);
            if (optimisticMinEnd >= prevStopsBest.totalTimeSeconds - EPS) {
              continue;
            }
          }
        }

        for (var comp = 0; comp < activeCompounds.length; comp++) {
          var lapTime = lapTimes[comp];
          var compMaxLaps = maxLapsArr[comp];
          var nextMask = prev.mask | mandatoryBitForComp[comp];

          var tireOptions = [{ changeTires: true, maxStintByTires: compMaxLaps }];
          if (comp === prev.compIdx && prev.tireLaps < compMaxLaps) {
            tireOptions.push({
              changeTires: false,
              maxStintByTires: compMaxLaps - prev.tireLaps,
            });
          }

          for (var oi = 0; oi < tireOptions.length; oi++) {
            var opt = tireOptions[oi];
            var maxStint = Math.min(maxFuelLaps, opt.maxStintByTires);
            var upper = mode === 'laps' ? Math.min(maxStint, targetLaps - prev.lapsDone) : maxStint;

            for (var stintL = 1; stintL <= upper; stintL++) {
              var neededFuel = (stintL + marginLaps) * fuelPerLap;
              var targetFuel = Math.min(TANK_CAPACITY_LITERS, neededFuel);
              var fuelAdded = Math.max(0, targetFuel - prev.fuel);
              var nextFuel = prev.fuel + fuelAdded - stintL * fuelPerLap;
              var pitTime =
                pitFuel.pitTransitSeconds +
                (opt.changeTires ? pitFuel.tireChangeSeconds : 0) +
                fuelAdded / refuelRate;
              var nextTime = prev.time + pitTime + stintL * lapTime;
              var nextLapsDone = prev.lapsDone + stintL;
              var nextTireLapsRaw = opt.changeTires ? stintL : prev.tireLaps + stintL;
              var nextTireLaps = nextTireLapsRaw >= compMaxLaps ? compMaxLaps : nextTireLapsRaw;

              if (mode === 'laps') {
                var rem = targetLaps - nextLapsDone;
                if (rem > (maxStops - s) * maxFuelLaps) {
                  continue;
                }

                var nextStints = prev.stints.concat([{ compIdx: comp, laps: stintL, changeTires: opt.changeTires }]);

                if (nextLapsDone === targetLaps) {
                  recordTerminal(s, {
                    lapsDone: nextLapsDone,
                    time: nextTime,
                    fuel: nextFuel,
                    mask: nextMask,
                    compIdx: comp,
                    tireLaps: nextTireLaps,
                    stints: nextStints,
                  });
                } else if (s < maxStops) {
                  var nKey = nextLapsDone + '|' + nextMask + '|' + comp + '|' + nextTireLaps;
                  var nBucket = nextLayer.get(nKey);
                  if (!nBucket) {
                    nBucket = [];
                    nextLayer.set(nKey, nBucket);
                  }
                  insertPareto(nBucket, {
                    lapsDone: nextLapsDone,
                    time: nextTime,
                    fuel: nextFuel,
                    mask: nextMask,
                    compIdx: comp,
                    tireLaps: nextTireLaps,
                    stints: nextStints,
                  });
                }
              } else {
                if (nextTime >= targetSeconds - EPS) {
                  if (nextTime - lapTime < targetSeconds - EPS) {
                    recordTerminal(s, {
                      lapsDone: nextLapsDone,
                      time: nextTime,
                      fuel: nextFuel,
                      mask: nextMask,
                      compIdx: comp,
                      tireLaps: nextTireLaps,
                      stints: prev.stints.concat([{ compIdx: comp, laps: stintL, changeTires: opt.changeTires }]),
                    });
                  }
                  break;
                } else if (s < maxStops) {
                  var dnKey = nextLapsDone + '|' + nextMask + '|' + comp + '|' + nextTireLaps;
                  var dnBucket = nextLayer.get(dnKey);
                  if (!dnBucket) {
                    dnBucket = [];
                    nextLayer.set(dnKey, dnBucket);
                  }
                  insertPareto(dnBucket, {
                    lapsDone: nextLapsDone,
                    time: nextTime,
                    fuel: nextFuel,
                    mask: nextMask,
                    compIdx: comp,
                    tireLaps: nextTireLaps,
                    stints: prev.stints.concat([{ compIdx: comp, laps: stintL, changeTires: opt.changeTires }]),
                  });
                }
              }
            }
          }
        }
      }

      currentLayer = nextLayer;
    }

    var alternatives = Array.from(bestByStops.values()).sort(function (a, b) {
      if (isBetterStrategy(a, b, mode)) return -1;
      if (isBetterStrategy(b, a, mode)) return 1;
      return a.totalStops - b.totalStops;
    });

    return {
      best: bestHolder.current,
      alternatives: alternatives,
    };
  }

  function solveBruteForce(config, maxStops) {
    var activeCompounds = COMPOUND_ORDER.filter(function (id) {
      return (
        config.tires[id].enabled &&
        config.tires[id].lapTimeSeconds !== null &&
        config.tires[id].lapTimeSeconds > 0 &&
        config.tires[id].maxLaps >= 1
      );
    });
    if (activeCompounds.length === 0) return null;

    var maxFuelLaps = Math.floor((TANK_CAPACITY_LITERS + EPS) / config.pitFuel.fuelPerLapLiters);
    if (maxFuelLaps < 1) return null;

    var best = null;
    var targetSeconds = config.durationMinutes * 60;

    function dfs(current, lapsSoFar) {
      if (current.length > 0) {
        var evaluated = evaluateStrategy(config, current);
        if (evaluated.isValid) {
          if (!best || isBetterStrategy(evaluated, best, config.mode)) {
            best = evaluated;
          }
        }
        if (config.mode === 'laps' && lapsSoFar >= config.totalLaps) return;
        if (config.mode === 'duration' && evaluated.totalTimeSeconds >= targetSeconds - EPS) return;
      }

      if (current.length > maxStops) return;

      var isFirst = current.length === 0;
      var prevComp = isFirst ? null : current[current.length - 1].compound;

      for (var i = 0; i < activeCompounds.length; i++) {
        var comp = activeCompounds[i];
        var tireLimit = config.tires[comp].maxLaps;
        var maxStint = Math.min(maxFuelLaps, tireLimit);
        var upperL = config.mode === 'laps'
          ? Math.min(maxStint, config.totalLaps - lapsSoFar)
          : maxStint;

        var changeOptions = isFirst ? [true] : comp === prevComp ? [true, false] : [true];
        for (var j = 0; j < changeOptions.length; j++) {
          var changeTires = changeOptions[j];
          for (var L = 1; L <= upperL; L++) {
            dfs(
              current.concat([{
                id: 'bf-' + current.length,
                compound: comp,
                laps: L,
                changeTires: changeTires,
              }]),
              lapsSoFar + L
            );
          }
        }
      }
    }

    dfs([], 0);
    return best;
  }

  return {
    isBetterStrategy: isBetterStrategy,
    normalizeStintTireFlags: normalizeStintTireFlags,
    reorderStints: reorderStints,
    evaluateStrategy: evaluateStrategy,
    findOptimalStrategies: findOptimalStrategies,
    solveBruteForce: solveBruteForce,
  };
});
