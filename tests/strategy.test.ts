import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultConfig,
  createTireConfig,
  formatLapTime,
  parseDurationMinutes,
  parseLapTimeSeconds,
  parseTrackLengthKm,
} from '../src/engine/logic';
import {
  evaluateStrategy,
  findOptimalStrategies,
  solveBruteForce,
} from '../src/engine/strategy';
import { RaceConfig } from '../src/types/strategy';

test('parseDurationMinutes parses minutes, hours, and 1h30 formats', () => {
  assert.equal(parseDurationMinutes('90'), 90);
  assert.equal(parseDurationMinutes('90m'), 90);
  assert.equal(parseDurationMinutes('1h30'), 90);
  assert.equal(parseDurationMinutes('1h 30'), 90);
  assert.equal(parseDurationMinutes('1:30'), 90);
  assert.equal(parseDurationMinutes('2h'), 120);
  assert.equal(parseDurationMinutes('1,5h'), 90);
  assert.equal(parseDurationMinutes('0'), null);
  assert.equal(parseDurationMinutes('abc'), null);
});

test('parseLapTimeSeconds parses mm:ss.sss and seconds', () => {
  assert.equal(parseLapTimeSeconds('1:48.500'), 108.5);
  assert.equal(parseLapTimeSeconds('1:48,5'), 108.5);
  assert.equal(parseLapTimeSeconds('1m48.5'), 108.5);
  assert.equal(parseLapTimeSeconds('108.5'), 108.5);
  assert.equal(parseLapTimeSeconds('2:17'), 137);
  assert.equal(formatLapTime(108.5), '1:48.500');
});

test('parseTrackLengthKm parses decimal dot, comma, and km suffix', () => {
  assert.equal(parseTrackLengthKm('7.004'), 7.004);
  assert.equal(parseTrackLengthKm('7,004'), 7.004);
  assert.equal(parseTrackLengthKm('5.807 km'), 5.807);
  assert.equal(parseTrackLengthKm(''), null);
  assert.equal(parseTrackLengthKm('0'), null);
  assert.equal(parseTrackLengthKm('-3'), null);
});

test('Matches exhaustive brute force in Laps mode with mandatory compound', () => {
  const cfg = createDefaultConfig();
  cfg.mode = 'laps';
  cfg.totalLaps = 11;
  cfg.pitFuel = {
    pitTransitSeconds: 18,
    tireChangeSeconds: 10,
    refuelRateLps: 5,
    fuelPerLapLiters: 20, // max 5 laps on 100L tank
    fuelMarginLaps: 0.5,
  };
  cfg.tires = {
    soft: createTireConfig('soft', true, '1:30.000', 4, false),
    medium: createTireConfig('medium', true, '1:31.200', 7, true),
    hard: createTireConfig('hard', true, '1:33.000', 12, false),
    intermediate: createTireConfig('intermediate', false, '1:40.000', 10, false),
    wet: createTireConfig('wet', false, '1:45.000', 10, false),
  };

  const dp = findOptimalStrategies(cfg);
  const bf = solveBruteForce(cfg, 4);

  assert.ok(dp.best, 'DP should find an optimal strategy');
  assert.ok(bf, 'Brute force should find an optimal strategy');
  assert.ok(Math.abs(dp.best.totalTimeSeconds - bf.totalTimeSeconds) < 1e-4,
    `Expected DP ${dp.best.totalTimeSeconds} == BF ${bf.totalTimeSeconds}`);
});

test('Matches exhaustive brute force when keeping tires saves tire-change time', () => {
  const cfg = createDefaultConfig();
  cfg.mode = 'laps';
  cfg.totalLaps = 10;
  cfg.pitFuel = {
    pitTransitSeconds: 15,
    tireChangeSeconds: 12,
    refuelRateLps: 5,
    fuelPerLapLiters: 20, // max 5 laps fuel
    fuelMarginLaps: 0.5,
  };
  cfg.tires = {
    soft: createTireConfig('soft', true, '1:30.000', 4, false),
    medium: createTireConfig('medium', true, '1:30.500', 10, false), // 10 cumulative laps across 2 stints!
    hard: createTireConfig('hard', false, '1:33.000', 15, false),
    intermediate: createTireConfig('intermediate', false, '1:40.000', 10, false),
    wet: createTireConfig('wet', false, '1:45.000', 10, false),
  };

  const dp = findOptimalStrategies(cfg);
  const bf = solveBruteForce(cfg, 3);

  assert.ok(dp.best);
  assert.ok(bf);
  assert.equal(dp.best.tireSetsUsed, 1, 'Optimal strategy should keep the Medium tire set across the fuel-only stop');
  assert.ok(Math.abs(dp.best.totalTimeSeconds - bf.totalTimeSeconds) < 1e-4);
});

test('Matches exhaustive brute force in Timed (duration) mode with mandatory compounds', () => {
  const cfg: RaceConfig = createDefaultConfig();
  cfg.mode = 'duration';
  cfg.durationInput = '12';
  cfg.durationMinutes = 12; // 720 seconds
  cfg.pitFuel = {
    pitTransitSeconds: 20,
    tireChangeSeconds: 8,
    refuelRateLps: 4,
    fuelPerLapLiters: 18, // max 5 laps fuel
    fuelMarginLaps: 0.5,
  };
  cfg.tires = {
    soft: createTireConfig('soft', true, '1:30.000', 3, true), // 90s
    medium: createTireConfig('medium', true, '1:32.000', 6, false), // 92s
    hard: createTireConfig('hard', true, '1:35.000', 10, false), // 95s
    intermediate: createTireConfig('intermediate', false, '1:40.000', 10, false),
    wet: createTireConfig('wet', false, '1:45.000', 10, false),
  };

  const dp = findOptimalStrategies(cfg);
  const bf = solveBruteForce(cfg, 3);

  assert.ok(dp.best);
  assert.ok(bf);
  assert.equal(dp.best.totalLaps, bf.totalLaps, 'Total laps in duration mode should match brute force');
  assert.ok(Math.abs(dp.best.totalTimeSeconds - bf.totalTimeSeconds) < 1e-4,
    `Expected DP ${dp.best.totalTimeSeconds} == BF ${bf.totalTimeSeconds}`);
});

test('Validation catches tank overflow, tire wear overflow, and missing mandatory compound', () => {
  const cfg = createDefaultConfig();
  cfg.mode = 'laps';
  cfg.totalLaps = 10;
  cfg.pitFuel.fuelPerLapLiters = 20; // max 5 laps fuel
  cfg.tires.soft.maxLaps = 4;
  cfg.tires.medium.mandatory = true;

  const evaluated = evaluateStrategy(cfg, [
    { id: '1', compound: 'soft', laps: 6, changeTires: true },
    { id: '2', compound: 'soft', laps: 4, changeTires: false },
  ]);

  assert.equal(evaluated.isValid, false);
  const codes = new Set(evaluated.issues.map((i) => i.code));
  assert.ok(codes.has('STINT_EXCEEDS_TANK'));
  assert.ok(codes.has('TIRE_SET_EXCEEDED'));
  assert.ok(codes.has('MANDATORY_COMPOUND_MISSING'));
});

test('Solves 1h Spa default preset quickly', () => {
  const cfg = createDefaultConfig();
  const start = performance.now();
  const result = findOptimalStrategies(cfg);
  const elapsed = performance.now() - start;

  assert.ok(result.best, 'Default Spa 1h strategy should exist');
  assert.ok(result.best.isValid);
  assert.ok(result.best.compoundsUsed.includes('medium'));
  assert.ok(elapsed < 200, `Solver took ${elapsed.toFixed(1)}ms, expected < 200ms`);
});

test('Mandatory slow compound is always used even when a single faster compound could finish on 0 stops', () => {
  const cfg = createDefaultConfig();
  cfg.mode = 'laps';
  cfg.totalLaps = 6;
  cfg.pitFuel = {
    pitTransitSeconds: 20,
    tireChangeSeconds: 8,
    refuelRateLps: 5,
    fuelPerLapLiters: 10, // 10 laps fuel -> 0 stops possible on Soft alone
    fuelMarginLaps: 0.5,
  };
  cfg.tires = {
    soft: createTireConfig('soft', true, '1:30.000', 10, false),
    medium: createTireConfig('medium', true, '1:33.000', 12, false),
    hard: createTireConfig('hard', true, '1:38.000', 15, true), // Much slower, but MANDATORY!
    intermediate: createTireConfig('intermediate', false, '1:45.000', 10, false),
    wet: createTireConfig('wet', false, '1:50.000', 10, false),
  };

  const result = findOptimalStrategies(cfg);
  assert.ok(result.best, 'Strategy forcing mandatory Hard should exist');
  assert.ok(result.best.isValid);
  assert.ok(result.best.compoundsUsed.includes('hard'), 'Mandatory Hard must be used');
  assert.ok(result.best.totalStops >= 1, 'Must pit at least once if using both Soft and Hard');
  for (const alt of result.alternatives) {
    assert.ok(alt.compoundsUsed.includes('hard'), 'Every returned alternative must include mandatory Hard');
  }
});

test('Multiple mandatory compounds (Soft, Medium, Hard) are all included in both Laps and Duration modes', () => {
  const cfg = createDefaultConfig();
  cfg.mode = 'laps';
  cfg.totalLaps = 10;
  cfg.pitFuel = {
    pitTransitSeconds: 15,
    tireChangeSeconds: 8,
    refuelRateLps: 5,
    fuelPerLapLiters: 12,
    fuelMarginLaps: 0.5,
  };
  cfg.tires = {
    soft: createTireConfig('soft', true, '1:30.000', 6, true),
    medium: createTireConfig('medium', true, '1:32.000', 10, true),
    hard: createTireConfig('hard', true, '1:35.000', 14, true),
    intermediate: createTireConfig('intermediate', false, '1:40.000', 10, false),
    wet: createTireConfig('wet', false, '1:45.000', 10, false),
  };

  const lapsRes = findOptimalStrategies(cfg);
  assert.ok(lapsRes.best);
  assert.ok(lapsRes.best.isValid);
  assert.ok(lapsRes.best.compoundsUsed.includes('soft'));
  assert.ok(lapsRes.best.compoundsUsed.includes('medium'));
  assert.ok(lapsRes.best.compoundsUsed.includes('hard'));

  cfg.mode = 'duration';
  cfg.durationInput = '18';
  cfg.durationMinutes = 18;
  const durRes = findOptimalStrategies(cfg);
  assert.ok(durRes.best);
  assert.ok(durRes.best.isValid);
  assert.ok(durRes.best.compoundsUsed.includes('soft'));
  assert.ok(durRes.best.compoundsUsed.includes('medium'));
  assert.ok(durRes.best.compoundsUsed.includes('hard'));
});

test('Long endurance race with beam pruning still enforces slow mandatory compound', () => {
  const cfg = createDefaultConfig();
  cfg.mode = 'laps';
  cfg.totalLaps = 160; // >14 stints -> triggers useBeam
  cfg.pitFuel = {
    pitTransitSeconds: 20,
    tireChangeSeconds: 8,
    refuelRateLps: 5,
    fuelPerLapLiters: 10, // 10 laps max fuel -> ~15 stops
    fuelMarginLaps: 0.5,
  };
  cfg.tires = {
    soft: createTireConfig('soft', true, '1:30.000', 10, false),
    medium: createTireConfig('medium', true, '1:32.000', 12, false),
    hard: createTireConfig('hard', true, '1:42.000', 20, true), // Very slow mandatory compound
    intermediate: createTireConfig('intermediate', false, '1:48.000', 15, false),
    wet: createTireConfig('wet', false, '1:55.000', 15, false),
  };

  const res = findOptimalStrategies(cfg);
  assert.ok(res.best, 'Beam-pruned long race must still find a valid mandatory strategy');
  assert.ok(res.best.isValid);
  assert.ok(res.best.compoundsUsed.includes('hard'));
});

