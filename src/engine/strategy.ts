import {
  EvaluatedStint,
  EvaluatedStrategy,
  OptimizerResult,
  RaceConfig,
  RaceMode,
  StintInput,
  TireCompoundId,
  ValidationIssue,
} from '../types/strategy';
import { COMPOUND_ORDER, TANK_CAPACITY_LITERS, formatRaceTime } from './logic';

const EPS = 1e-6;

export function isBetterStrategy(
  candidate: EvaluatedStrategy,
  incumbent: EvaluatedStrategy,
  mode: RaceMode
): boolean {
  if (mode === 'duration') {
    if (candidate.totalLaps !== incumbent.totalLaps) {
      return candidate.totalLaps > incumbent.totalLaps;
    }
    return candidate.totalTimeSeconds < incumbent.totalTimeSeconds - EPS;
  }
  return candidate.totalTimeSeconds < incumbent.totalTimeSeconds - EPS;
}

export function evaluateStrategy(
  config: RaceConfig,
  stintsInput: StintInput[]
): EvaluatedStrategy {
  const issues: ValidationIssue[] = [];
  const { pitFuel, tires, mode } = config;
  const fuelPerLap = pitFuel.fuelPerLapLiters;
  const marginLaps = pitFuel.fuelMarginLaps;
  const refuelRate = pitFuel.refuelRateLps;

  if (!Number.isFinite(fuelPerLap) || fuelPerLap <= 0 || fuelPerLap > TANK_CAPACITY_LITERS) {
    issues.push({ code: 'INVALID_FUEL_PER_LAP', severity: 'error' });
  }

  const activeTires = COMPOUND_ORDER.filter(
    (id) => tires[id].enabled && tires[id].lapTimeSeconds !== null && tires[id].lapTimeSeconds! > 0
  );

  if (activeTires.length === 0) {
    issues.push({ code: 'NO_ACTIVE_TIRES', severity: 'error' });
  }

  const evaluatedStints: EvaluatedStint[] = [];
  const compoundsUsedSet = new Set<TireCompoundId>();

  let prevFuelEnd = TANK_CAPACITY_LITERS;
  let prevCompound: TireCompoundId | null = null;
  let prevTireLapsEnd = 0;
  let tireSetNumber = 0;
  let cumulativeTime = 0;
  let cumulativeLaps = 0;
  let totalDrivingSeconds = 0;
  let totalPitSeconds = 0;
  let totalFuelUsedLiters = 0;
  let totalFuelAddedLiters = 0;

  const targetSeconds = config.durationMinutes * 60;

  for (let i = 0; i < stintsInput.length; i++) {
    const stint = stintsInput[i];
    const tireSpec = tires[stint.compound];
    const lapTime = tireSpec.lapTimeSeconds ?? 0;

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

    const isFirst = i === 0;
    const actualChangeTires = isFirst
      ? true
      : stint.compound !== prevCompound
        ? true
        : stint.changeTires;

    let fuelAdded = 0;
    let fuelStart = TANK_CAPACITY_LITERS;
    let pitDuration = 0;

    if (!isFirst) {
      const neededFuel = (stint.laps + marginLaps) * fuelPerLap;
      const targetFuel = Math.min(TANK_CAPACITY_LITERS, Math.max(0, neededFuel));
      fuelAdded = Math.max(0, targetFuel - prevFuelEnd);
      fuelStart = prevFuelEnd + fuelAdded;
      const refuelTime = refuelRate > 0 ? fuelAdded / refuelRate : 0;
      pitDuration =
        pitFuel.pitTransitSeconds +
        (actualChangeTires ? pitFuel.tireChangeSeconds : 0) +
        refuelTime;
    }

    const fuelUsed = stint.laps * fuelPerLap;
    const fuelEnd = fuelStart - fuelUsed;

    if (fuelEnd < -EPS) {
      issues.push({
        code: 'STINT_EXCEEDS_TANK',
        severity: 'error',
        stintIndex: i,
        detail: fuelUsed.toFixed(1),
      });
    }

    let tireLapsStart = 0;
    if (isFirst || actualChangeTires) {
      tireSetNumber += 1;
      tireLapsStart = 0;
    } else {
      tireLapsStart = prevTireLapsEnd;
    }
    const tireLapsEnd = tireLapsStart + stint.laps;

    if (tireLapsEnd > tireSpec.maxLaps) {
      issues.push({
        code: 'TIRE_SET_EXCEEDED',
        severity: 'error',
        stintIndex: i,
        compound: stint.compound,
        detail: `${tireLapsEnd}/${tireSpec.maxLaps}`,
      });
    }

    const drivingSeconds = stint.laps * lapTime;
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
      tireSetNumber,
      tireLapsStart,
      tireLapsEnd,
      tireMaxLaps: tireSpec.maxLaps,
      fuelStartLiters: fuelStart,
      fuelUsedLiters: fuelUsed,
      fuelEndLiters: fuelEnd,
      fuelAddedBeforeStint: fuelAdded,
      pitDurationBeforeStint: pitDuration,
      lapTimeSeconds: lapTime,
      drivingSeconds,
      cumulativeTimeEndSeconds: cumulativeTime,
      cumulativeLapsEnd: cumulativeLaps,
    });

    prevFuelEnd = fuelEnd;
    prevCompound = stint.compound;
    prevTireLapsEnd = tireLapsEnd;
  }

  // Check race finish criteria
  if (mode === 'laps') {
    if (cumulativeLaps !== config.totalLaps) {
      issues.push({
        code: 'LAPS_MISMATCH',
        severity: 'error',
        detail: `${cumulativeLaps}/${config.totalLaps}`,
      });
    }
  } else {
    if (cumulativeTime < targetSeconds - EPS) {
      issues.push({
        code: 'DURATION_NOT_REACHED',
        severity: 'error',
        detail: `${formatRaceTime(cumulativeTime)}/${formatRaceTime(targetSeconds)}`,
      });
    }
  }

  // Check mandatory compounds
  for (const id of COMPOUND_ORDER) {
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
    totalDrivingSeconds,
    totalPitSeconds,
    totalFuelUsedLiters,
    totalFuelAddedLiters,
    compoundsUsed: Array.from(compoundsUsedSet),
    tireSetsUsed: tireSetNumber,
    isValid: issues.filter((x) => x.severity === 'error').length === 0,
    issues,
  };
}

interface DPState {
  lapsDone: number;
  time: number;
  fuel: number;
  mask: number;
  compIdx: number;
  tireLaps: number;
  stints: Array<{ compIdx: number; laps: number; changeTires: boolean }>;
}

function insertPareto(list: DPState[], candidate: DPState): void {
  for (let i = 0; i < list.length; i++) {
    const existing = list[i];
    if (existing.time <= candidate.time + EPS && existing.fuel >= candidate.fuel - EPS) {
      return; // Dominated by existing
    }
  }
  for (let i = list.length - 1; i >= 0; i--) {
    const existing = list[i];
    if (candidate.time <= existing.time + EPS && candidate.fuel >= existing.fuel - EPS) {
      list.splice(i, 1);
    }
  }
  list.push(candidate);
}

function buildEvaluatedFromSteps(
  config: RaceConfig,
  activeCompounds: TireCompoundId[],
  steps: Array<{ compIdx: number; laps: number; changeTires: boolean }>
): EvaluatedStrategy {
  const stintInputs: StintInput[] = steps.map((s, idx) => ({
    id: `opt-${idx}`,
    compound: activeCompounds[s.compIdx],
    laps: s.laps,
    changeTires: s.changeTires,
  }));
  return evaluateStrategy(config, stintInputs);
}

export function findOptimalStrategies(config: RaceConfig): OptimizerResult {
  const { pitFuel, tires, mode } = config;
  const fuelPerLap = pitFuel.fuelPerLapLiters;
  const marginLaps = pitFuel.fuelMarginLaps;
  const refuelRate = pitFuel.refuelRateLps;

  if (!Number.isFinite(fuelPerLap) || fuelPerLap <= 0 || fuelPerLap > TANK_CAPACITY_LITERS) {
    return { best: null, alternatives: [], error: 'INVALID_FUEL_PER_LAP' };
  }
  if (!Number.isFinite(refuelRate) || refuelRate <= 0) {
    return { best: null, alternatives: [], error: 'INVALID_REFUEL_RATE' };
  }

  // Verify mandatory compounds are enabled and valid
  for (const id of COMPOUND_ORDER) {
    if (tires[id].mandatory && (!tires[id].enabled || !tires[id].lapTimeSeconds || tires[id].lapTimeSeconds! <= 0)) {
      return { best: null, alternatives: [], error: 'MANDATORY_COMPOUND_DISABLED' };
    }
  }

  const activeCompounds = COMPOUND_ORDER.filter(
    (id) =>
      tires[id].enabled &&
      tires[id].lapTimeSeconds !== null &&
      tires[id].lapTimeSeconds! > 0 &&
      tires[id].maxLaps >= 1
  );

  if (activeCompounds.length === 0) {
    return { best: null, alternatives: [], error: 'NO_ACTIVE_TIRES' };
  }

  const maxFuelLaps = Math.floor((TANK_CAPACITY_LITERS + EPS) / fuelPerLap);
  if (maxFuelLaps < 1) {
    return { best: null, alternatives: [], error: 'STINT_EXCEEDS_TANK' };
  }

  const lapTimes = activeCompounds.map((id) => tires[id].lapTimeSeconds!);
  const maxLapsArr = activeCompounds.map((id) => tires[id].maxLaps);
  const mandatoryFlags = activeCompounds.map((id) => (tires[id].mandatory ? 1 : 0));

  let fullMandatoryMask = 0;
  let mandatoryCount = 0;
  const mandatoryBitForComp = activeCompounds.map((_, idx) => {
    if (mandatoryFlags[idx]) {
      const bit = 1 << mandatoryCount;
      fullMandatoryMask |= bit;
      mandatoryCount++;
      return bit;
    }
    return 0;
  });

  const minLapTime = Math.min(...lapTimes);
  const targetLaps = mode === 'laps' ? config.totalLaps : 0;
  const targetSeconds = mode === 'duration' ? config.durationMinutes * 60 : 0;

  if (mode === 'laps' && targetLaps < 1) {
    return { best: null, alternatives: [], error: 'INVALID_LAPS' };
  }
  if (mode === 'duration' && targetSeconds <= 0) {
    return { best: null, alternatives: [], error: 'INVALID_DURATION' };
  }

  // Estimate stop bounds
  const estLaps = mode === 'laps' ? targetLaps : Math.ceil(targetSeconds / minLapTime);
  const minStopsEstimate = Math.max(Math.ceil(estLaps / maxFuelLaps) - 1, Math.max(0, mandatoryCount - 1));
  const maxStops = mode === 'laps'
    ? Math.min(targetLaps - 1, minStopsEstimate + 4)
    : Math.min(estLaps + 2, minStopsEstimate + 4);

  // Use beam pruning only for ultra-long endurance races (e.g. 24h) to guarantee <50ms responsiveness
  const useBeam = minStopsEstimate > 12;
  const BEAM_PER_BUCKET = 40;

  const bestByStops = new Map<number, EvaluatedStrategy>();
  const bestHolder: { current: EvaluatedStrategy | null } = { current: null };

  const recordTerminal = (stops: number, state: DPState) => {
    if (state.mask !== fullMandatoryMask) return;
    const evaluated = buildEvaluatedFromSteps(config, activeCompounds, state.stints);
    if (!evaluated.isValid) return;

    const prevForStops = bestByStops.get(stops);
    if (!prevForStops || isBetterStrategy(evaluated, prevForStops, mode)) {
      bestByStops.set(stops, evaluated);
    }
    if (!bestHolder.current || isBetterStrategy(evaluated, bestHolder.current, mode)) {
      bestHolder.current = evaluated;
    }
  };

  // Layer 0: First stint (starts full tank 100 L, no pit stop before stint 1)
  let currentLayer = new Map<string, DPState[]>();

  for (let c = 0; c < activeCompounds.length; c++) {
    const maxAllowedStint = Math.min(maxFuelLaps, maxLapsArr[c]);
    const upperL = mode === 'laps' ? Math.min(maxAllowedStint, targetLaps) : maxAllowedStint;

    for (let L = 1; L <= upperL; L++) {
      const t = L * lapTimes[c];
      const fuel = TANK_CAPACITY_LITERS - L * fuelPerLap;
      const mask = mandatoryBitForComp[c];

      if (mode === 'laps') {
        const nextState: DPState = {
          lapsDone: L,
          time: t,
          fuel,
          mask,
          compIdx: c,
          tireLaps: L >= maxLapsArr[c] ? maxLapsArr[c] : L,
          stints: [{ compIdx: c, laps: L, changeTires: true }],
        };
        if (L === targetLaps) {
          recordTerminal(0, nextState);
        } else {
          // Prune if remaining laps cannot fit in remaining stops
          const remaining = targetLaps - L;
          if (remaining <= maxStops * maxFuelLaps) {
            const key = `${L}|${mask}|${c}|${nextState.tireLaps}`;
            let bucket = currentLayer.get(key);
            if (!bucket) {
              bucket = [];
              currentLayer.set(key, bucket);
            }
            insertPareto(bucket, nextState);
          }
        }
      } else {
        // Duration mode
        if (t >= targetSeconds - EPS) {
          if (t - lapTimes[c] < targetSeconds - EPS) {
            recordTerminal(0, {
              lapsDone: L,
              time: t,
              fuel,
              mask,
              compIdx: c,
              tireLaps: L,
              stints: [{ compIdx: c, laps: L, changeTires: true }],
            });
          }
          break; // Any longer L will also have already finished earlier
        } else {
          const nextState: DPState = {
            lapsDone: L,
            time: t,
            fuel,
            mask,
            compIdx: c,
            tireLaps: L >= maxLapsArr[c] ? maxLapsArr[c] : L,
            stints: [{ compIdx: c, laps: L, changeTires: true }],
          };
          const key = `${L}|${mask}|${c}|${nextState.tireLaps}`;
          let bucket = currentLayer.get(key);
          if (!bucket) {
            bucket = [];
            currentLayer.set(key, bucket);
          }
          insertPareto(bucket, nextState);
        }
      }
    }
  }

  // Subsequent stops: s = 1 .. maxStops
  for (let s = 1; s <= maxStops; s++) {
    if (currentLayer.size === 0) break;

    let statesToExpand: DPState[] = [];
    for (const list of currentLayer.values()) {
      for (const st of list) {
        statesToExpand.push(st);
      }
    }

    if (useBeam && statesToExpand.length > BEAM_PER_BUCKET * 20) {
      const byMask = new Map<number, DPState[]>();
      for (const st of statesToExpand) {
        let group = byMask.get(st.mask);
        if (!group) {
          group = [];
          byMask.set(st.mask, group);
        }
        group.push(st);
      }
      const perMaskQuota = Math.max(20, Math.floor((BEAM_PER_BUCKET * 20) / Math.max(1, byMask.size)));
      const kept: DPState[] = [];
      for (const group of byMask.values()) {
        group.sort((a, b) => a.time / a.lapsDone - b.time / b.lapsDone);
        kept.push(...group.slice(0, perMaskQuota));
      }
      statesToExpand = kept;
    }

    const nextLayer = new Map<string, DPState[]>();

    for (const prev of statesToExpand) {
      if (mode === 'laps' && bestHolder.current && s === maxStops) {
        const remainingLaps = targetLaps - prev.lapsDone;
        const optimisticMinEnd =
          prev.time + pitFuel.pitTransitSeconds + remainingLaps * minLapTime;
        if (optimisticMinEnd >= bestHolder.current.totalTimeSeconds - EPS && bestByStops.has(s)) {
          const prevStopsBest = bestByStops.get(s)!;
          if (optimisticMinEnd >= prevStopsBest.totalTimeSeconds - EPS) {
            continue;
          }
        }
      }

      for (let c = 0; c < activeCompounds.length; c++) {
        const lapTime = lapTimes[c];
        const compMaxLaps = maxLapsArr[c];
        const nextMask = prev.mask | mandatoryBitForComp[c];

        // Can we keep tires (only if same compound and prev.tireLaps < compMaxLaps)?
        const tireOptions: Array<{ changeTires: boolean; maxStintByTires: number }> = [
          { changeTires: true, maxStintByTires: compMaxLaps },
        ];
        if (c === prev.compIdx && prev.tireLaps < compMaxLaps) {
          tireOptions.push({
            changeTires: false,
            maxStintByTires: compMaxLaps - prev.tireLaps,
          });
        }

        for (const opt of tireOptions) {
          const maxStint = Math.min(maxFuelLaps, opt.maxStintByTires);
          const upperL =
            mode === 'laps' ? Math.min(maxStint, targetLaps - prev.lapsDone) : maxStint;

          for (let L = 1; L <= upperL; L++) {
            const neededFuel = (L + marginLaps) * fuelPerLap;
            const targetFuel = Math.min(TANK_CAPACITY_LITERS, neededFuel);
            const fuelAdded = Math.max(0, targetFuel - prev.fuel);
            const nextFuel = prev.fuel + fuelAdded - L * fuelPerLap;
            const pitTime =
              pitFuel.pitTransitSeconds +
              (opt.changeTires ? pitFuel.tireChangeSeconds : 0) +
              fuelAdded / refuelRate;
            const nextTime = prev.time + pitTime + L * lapTime;
            const nextLapsDone = prev.lapsDone + L;
            const nextTireLapsRaw = opt.changeTires ? L : prev.tireLaps + L;
            const nextTireLaps = nextTireLapsRaw >= compMaxLaps ? compMaxLaps : nextTireLapsRaw;

            if (mode === 'laps') {
              const remaining = targetLaps - nextLapsDone;
              if (remaining > (maxStops - s) * maxFuelLaps) {
                continue;
              }

              const nextStints = [
                ...prev.stints,
                { compIdx: c, laps: L, changeTires: opt.changeTires },
              ];

              if (nextLapsDone === targetLaps) {
                recordTerminal(s, {
                  lapsDone: nextLapsDone,
                  time: nextTime,
                  fuel: nextFuel,
                  mask: nextMask,
                  compIdx: c,
                  tireLaps: nextTireLaps,
                  stints: nextStints,
                });
              } else if (s < maxStops) {
                const key = `${nextLapsDone}|${nextMask}|${c}|${nextTireLaps}`;
                let bucket = nextLayer.get(key);
                if (!bucket) {
                  bucket = [];
                  nextLayer.set(key, bucket);
                }
                insertPareto(bucket, {
                  lapsDone: nextLapsDone,
                  time: nextTime,
                  fuel: nextFuel,
                  mask: nextMask,
                  compIdx: c,
                  tireLaps: nextTireLaps,
                  stints: nextStints,
                });
              }
            } else {
              // Duration mode
              if (nextTime >= targetSeconds - EPS) {
                if (nextTime - lapTime < targetSeconds - EPS) {
                  recordTerminal(s, {
                    lapsDone: nextLapsDone,
                    time: nextTime,
                    fuel: nextFuel,
                    mask: nextMask,
                    compIdx: c,
                    tireLaps: nextTireLaps,
                    stints: [
                      ...prev.stints,
                      { compIdx: c, laps: L, changeTires: opt.changeTires },
                    ],
                  });
                }
                break;
              } else if (s < maxStops) {
                const key = `${nextLapsDone}|${nextMask}|${c}|${nextTireLaps}`;
                let bucket = nextLayer.get(key);
                if (!bucket) {
                  bucket = [];
                  nextLayer.set(key, bucket);
                }
                insertPareto(bucket, {
                  lapsDone: nextLapsDone,
                  time: nextTime,
                  fuel: nextFuel,
                  mask: nextMask,
                  compIdx: c,
                  tireLaps: nextTireLaps,
                  stints: [
                    ...prev.stints,
                    { compIdx: c, laps: L, changeTires: opt.changeTires },
                  ],
                });
              }
            }
          }
        }
      }
    }

    currentLayer = nextLayer;
  }

  const alternatives = Array.from(bestByStops.values()).sort((a, b) => {
    if (isBetterStrategy(a, b, mode)) return -1;
    if (isBetterStrategy(b, a, mode)) return 1;
    return a.totalStops - b.totalStops;
  });

  return {
    best: bestHolder.current,
    alternatives,
  };
}

/**
 * Exhaustive brute-force reference solver for small races (used in automated unit tests
 * to verify exact optimality of findOptimalStrategies across laps & duration modes).
 */
export function solveBruteForce(
  config: RaceConfig,
  maxStops: number
): EvaluatedStrategy | null {
  const activeCompounds = COMPOUND_ORDER.filter(
    (id) =>
      config.tires[id].enabled &&
      config.tires[id].lapTimeSeconds !== null &&
      config.tires[id].lapTimeSeconds! > 0 &&
      config.tires[id].maxLaps >= 1
  );
  if (activeCompounds.length === 0) return null;

  const maxFuelLaps = Math.floor((TANK_CAPACITY_LITERS + EPS) / config.pitFuel.fuelPerLapLiters);
  if (maxFuelLaps < 1) return null;

  let best: EvaluatedStrategy | null = null;
  const targetSeconds = config.durationMinutes * 60;

  function dfs(current: StintInput[], lapsSoFar: number) {
    if (current.length > 0) {
      const evaluated = evaluateStrategy(config, current);
      if (evaluated.isValid) {
        if (!best || isBetterStrategy(evaluated, best, config.mode)) {
          best = evaluated;
        }
      }
      if (config.mode === 'laps' && lapsSoFar >= config.totalLaps) {
        return;
      }
      if (config.mode === 'duration' && evaluated.totalTimeSeconds >= targetSeconds - EPS) {
        return;
      }
    }

    if (current.length > maxStops) return;

    const isFirst = current.length === 0;
    const prevComp = isFirst ? null : current[current.length - 1].compound;

    for (const comp of activeCompounds) {
      const tireLimit = config.tires[comp].maxLaps;
      const maxStint = Math.min(maxFuelLaps, tireLimit);
      const upperL =
        config.mode === 'laps'
          ? Math.min(maxStint, config.totalLaps - lapsSoFar)
          : maxStint;

      const changeOptions = isFirst
        ? [true]
        : comp === prevComp
          ? [true, false]
          : [true];

      for (const changeTires of changeOptions) {
        for (let L = 1; L <= upperL; L++) {
          const nextStint: StintInput = {
            id: `bf-${current.length}`,
            compound: comp,
            laps: L,
            changeTires,
          };
          dfs([...current, nextStint], lapsSoFar + L);
        }
      }
    }
  }

  dfs([], 0);
  return best;
}
