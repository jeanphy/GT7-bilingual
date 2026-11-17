'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var Logic = require('../js/logic.js');
var Strategy = require('../js/strategy.js');

test('parseDurationMinutes parses minutes, hours, and 1h30 formats', function () {
  assert.equal(Logic.parseDurationMinutes('90'), 90);
  assert.equal(Logic.parseDurationMinutes('90m'), 90);
  assert.equal(Logic.parseDurationMinutes('1h30'), 90);
  assert.equal(Logic.parseDurationMinutes('1h 30'), 90);
  assert.equal(Logic.parseDurationMinutes('1:30'), 90);
  assert.equal(Logic.parseDurationMinutes('2h'), 120);
  assert.equal(Logic.parseDurationMinutes('1,5h'), 90);
  assert.equal(Logic.parseDurationMinutes('0'), null);
  assert.equal(Logic.parseDurationMinutes('abc'), null);
});

test('parseLapTimeSeconds parses mm:ss.sss and seconds', function () {
  assert.equal(Logic.parseLapTimeSeconds('1:48.500'), 108.5);
  assert.equal(Logic.parseLapTimeSeconds('1:48,5'), 108.5);
  assert.equal(Logic.parseLapTimeSeconds('1m48.5'), 108.5);
  assert.equal(Logic.parseLapTimeSeconds('108.5'), 108.5);
  assert.equal(Logic.parseLapTimeSeconds('2:17'), 137);
  assert.equal(Logic.formatLapTime(108.5), '1:48.500');
});

test('parseTrackLengthKm parses decimal dot, comma, and km suffix', function () {
  assert.equal(Logic.parseTrackLengthKm('7.004'), 7.004);
  assert.equal(Logic.parseTrackLengthKm('7,004'), 7.004);
  assert.equal(Logic.parseTrackLengthKm('5.807 km'), 5.807);
  assert.equal(Logic.parseTrackLengthKm(''), null);
  assert.equal(Logic.parseTrackLengthKm('0'), null);
  assert.equal(Logic.parseTrackLengthKm('-3'), null);
});

test('Matches exhaustive brute force in Laps mode with mandatory compound', function () {
  var cfg = Logic.createDefaultConfig();
  cfg.mode = 'laps';
  cfg.totalLaps = 11;
  cfg.pitFuel = {
    pitTransitSeconds: 18,
    tireChangeSeconds: 10,
    refuelRateLps: 5,
    fuelPerLapLiters: 20,
    fuelMarginLaps: 0.5,
  };
  cfg.tires = {
    soft: Logic.createTireConfig('soft', true, '1:30.000', 4, false),
    medium: Logic.createTireConfig('medium', true, '1:31.200', 7, true),
    hard: Logic.createTireConfig('hard', true, '1:33.000', 12, false),
    intermediate: Logic.createTireConfig('intermediate', false, '1:40.000', 10, false),
    wet: Logic.createTireConfig('wet', false, '1:45.000', 10, false),
  };

  var dp = Strategy.findOptimalStrategies(cfg);
  var bf = Strategy.solveBruteForce(cfg, 4);

  assert.ok(dp.best);
  assert.ok(bf);
  assert.ok(Math.abs(dp.best.totalTimeSeconds - bf.totalTimeSeconds) < 1e-4);
});

test('Matches exhaustive brute force when keeping tires saves tire-change time', function () {
  var cfg = Logic.createDefaultConfig();
  cfg.mode = 'laps';
  cfg.totalLaps = 10;
  cfg.pitFuel = {
    pitTransitSeconds: 15,
    tireChangeSeconds: 12,
    refuelRateLps: 5,
    fuelPerLapLiters: 20,
    fuelMarginLaps: 0.5,
  };
  cfg.tires = {
    soft: Logic.createTireConfig('soft', true, '1:30.000', 4, false),
    medium: Logic.createTireConfig('medium', true, '1:30.500', 10, false),
    hard: Logic.createTireConfig('hard', false, '1:33.000', 15, false),
    intermediate: Logic.createTireConfig('intermediate', false, '1:40.000', 10, false),
    wet: Logic.createTireConfig('wet', false, '1:45.000', 10, false),
  };

  var dp = Strategy.findOptimalStrategies(cfg);
  var bf = Strategy.solveBruteForce(cfg, 3);

  assert.ok(dp.best);
  assert.ok(bf);
  assert.equal(dp.best.tireSetsUsed, 1);
  assert.ok(Math.abs(dp.best.totalTimeSeconds - bf.totalTimeSeconds) < 1e-4);
});

test('Matches exhaustive brute force in Timed (duration) mode with mandatory compounds', function () {
  var cfg = Logic.createDefaultConfig();
  cfg.mode = 'duration';
  cfg.durationInput = '12';
  cfg.durationMinutes = 12;
  cfg.pitFuel = {
    pitTransitSeconds: 20,
    tireChangeSeconds: 8,
    refuelRateLps: 4,
    fuelPerLapLiters: 18,
    fuelMarginLaps: 0.5,
  };
  cfg.tires = {
    soft: Logic.createTireConfig('soft', true, '1:30.000', 3, true),
    medium: Logic.createTireConfig('medium', true, '1:32.000', 6, false),
    hard: Logic.createTireConfig('hard', true, '1:35.000', 10, false),
    intermediate: Logic.createTireConfig('intermediate', false, '1:40.000', 10, false),
    wet: Logic.createTireConfig('wet', false, '1:45.000', 10, false),
  };

  var dp = Strategy.findOptimalStrategies(cfg);
  var bf = Strategy.solveBruteForce(cfg, 3);

  assert.ok(dp.best);
  assert.ok(bf);
  assert.equal(dp.best.totalLaps, bf.totalLaps);
  assert.ok(Math.abs(dp.best.totalTimeSeconds - bf.totalTimeSeconds) < 1e-4);
});

test('Validation catches tank overflow, tire wear overflow, and missing mandatory compound', function () {
  var cfg = Logic.createDefaultConfig();
  cfg.mode = 'laps';
  cfg.totalLaps = 10;
  cfg.pitFuel.fuelPerLapLiters = 20;
  cfg.tires.soft.maxLaps = 4;
  cfg.tires.medium.mandatory = true;

  var evaluated = Strategy.evaluateStrategy(cfg, [
    { id: '1', compound: 'soft', laps: 6, changeTires: true },
    { id: '2', compound: 'soft', laps: 4, changeTires: false },
  ]);

  assert.equal(evaluated.isValid, false);
  var codes = new Set(evaluated.issues.map(function (i) { return i.code; }));
  assert.ok(codes.has('STINT_EXCEEDS_TANK'));
  assert.ok(codes.has('TIRE_SET_EXCEEDED'));
  assert.ok(codes.has('MANDATORY_COMPOUND_MISSING'));
});

test('Solves 1h Spa default preset quickly', function () {
  var cfg = Logic.createDefaultConfig();
  var start = performance.now();
  var result = Strategy.findOptimalStrategies(cfg);
  var elapsed = performance.now() - start;

  assert.ok(result.best);
  assert.ok(result.best.isValid);
  assert.ok(result.best.compoundsUsed.includes('medium'));
  assert.ok(elapsed < 500);
});

test('Mandatory slow compound is always used even when a single faster compound could finish on 0 stops', function () {
  var cfg = Logic.createDefaultConfig();
  cfg.mode = 'laps';
  cfg.totalLaps = 6;
  cfg.pitFuel = {
    pitTransitSeconds: 20,
    tireChangeSeconds: 8,
    refuelRateLps: 5,
    fuelPerLapLiters: 10,
    fuelMarginLaps: 0.5,
  };
  cfg.tires = {
    soft: Logic.createTireConfig('soft', true, '1:30.000', 10, false),
    medium: Logic.createTireConfig('medium', true, '1:33.000', 12, false),
    hard: Logic.createTireConfig('hard', true, '1:38.000', 15, true),
    intermediate: Logic.createTireConfig('intermediate', false, '1:45.000', 10, false),
    wet: Logic.createTireConfig('wet', false, '1:50.000', 10, false),
  };

  var result = Strategy.findOptimalStrategies(cfg);
  assert.ok(result.best);
  assert.ok(result.best.isValid);
  assert.ok(result.best.compoundsUsed.includes('hard'));
  assert.ok(result.best.totalStops >= 1);
  for (var i = 0; i < result.alternatives.length; i++) {
    assert.ok(result.alternatives[i].compoundsUsed.includes('hard'));
  }
});

test('Multiple mandatory compounds (Soft, Medium, Hard) are all included in both Laps and Duration modes', function () {
  var cfg = Logic.createDefaultConfig();
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
    soft: Logic.createTireConfig('soft', true, '1:30.000', 6, true),
    medium: Logic.createTireConfig('medium', true, '1:32.000', 10, true),
    hard: Logic.createTireConfig('hard', true, '1:35.000', 14, true),
    intermediate: Logic.createTireConfig('intermediate', false, '1:40.000', 10, false),
    wet: Logic.createTireConfig('wet', false, '1:45.000', 10, false),
  };

  var lapsRes = Strategy.findOptimalStrategies(cfg);
  assert.ok(lapsRes.best);
  assert.ok(lapsRes.best.isValid);
  assert.ok(lapsRes.best.compoundsUsed.includes('soft'));
  assert.ok(lapsRes.best.compoundsUsed.includes('medium'));
  assert.ok(lapsRes.best.compoundsUsed.includes('hard'));

  cfg.mode = 'duration';
  cfg.durationInput = '18';
  cfg.durationMinutes = 18;
  var durRes = Strategy.findOptimalStrategies(cfg);
  assert.ok(durRes.best);
  assert.ok(durRes.best.isValid);
  assert.ok(durRes.best.compoundsUsed.includes('soft'));
  assert.ok(durRes.best.compoundsUsed.includes('medium'));
  assert.ok(durRes.best.compoundsUsed.includes('hard'));
});

test('Long endurance race with beam pruning still enforces slow mandatory compound', function () {
  var cfg = Logic.createDefaultConfig();
  cfg.mode = 'laps';
  cfg.totalLaps = 160;
  cfg.pitFuel = {
    pitTransitSeconds: 20,
    tireChangeSeconds: 8,
    refuelRateLps: 5,
    fuelPerLapLiters: 10,
    fuelMarginLaps: 0.5,
  };
  cfg.tires = {
    soft: Logic.createTireConfig('soft', true, '1:30.000', 10, false),
    medium: Logic.createTireConfig('medium', true, '1:32.000', 12, false),
    hard: Logic.createTireConfig('hard', true, '1:42.000', 20, true),
    intermediate: Logic.createTireConfig('intermediate', false, '1:48.000', 15, false),
    wet: Logic.createTireConfig('wet', false, '1:55.000', 15, false),
  };

  var res = Strategy.findOptimalStrategies(cfg);
  assert.ok(res.best);
  assert.ok(res.best.isValid);
  assert.ok(res.best.compoundsUsed.includes('hard'));
});

test('createDefaultConfig includes car name, category, and optional BoP power/weight defaults', function () {
  var cfg = Logic.createDefaultConfig();
  assert.equal(cfg.car.name, '');
  assert.equal(cfg.car.category, '');
  assert.equal(cfg.car.bopPowerHp, null);
  assert.equal(cfg.car.bopWeightKg, null);
  assert.equal(cfg.raceInfo.tireWearMultiplier, 1);
  assert.equal(cfg.raceInfo.fuelMultiplier, 1);
});

test('Race information tire wear and fuel multipliers do not impact strategy calculations', function () {
  var cfgBase = Logic.createDefaultConfig();
  var cfgWithMultipliers = Logic.createDefaultConfig();
  cfgWithMultipliers.raceInfo = {
    tireWearMultiplier: 5,
    fuelMultiplier: 4,
  };

  var resBase = Strategy.findOptimalStrategies(cfgBase);
  var resMult = Strategy.findOptimalStrategies(cfgWithMultipliers);

  assert.ok(resBase.best);
  assert.ok(resMult.best);
  assert.equal(resMult.best.totalLaps, resBase.best.totalLaps);
  assert.equal(resMult.best.totalTimeSeconds, resBase.best.totalTimeSeconds);
  assert.equal(resMult.best.totalFuelUsedLiters, resBase.best.totalFuelUsedLiters);
  assert.deepEqual(
    resMult.best.stints.map(function (s) { return s.compound + ':' + s.laps; }),
    resBase.best.stints.map(function (s) { return s.compound + ':' + s.laps; })
  );
});

test('Reordering stints recalculates refuel amounts and normalizes tire change flags', function () {
  var cfg = Logic.createDefaultConfig();
  cfg.mode = 'laps';
  cfg.totalLaps = 22;
  cfg.pitFuel = {
    pitTransitSeconds: 20,
    tireChangeSeconds: 8,
    refuelRateLps: 5,
    fuelPerLapLiters: 10,
    fuelMarginLaps: 0.5,
  };

  var initial = [
    { id: 's1', compound: 'medium', laps: 8, changeTires: true },
    { id: 's2', compound: 'soft', laps: 5, changeTires: true },
    { id: 's3', compound: 'soft', laps: 9, changeTires: false },
  ];

  var evalBefore = Strategy.evaluateStrategy(cfg, initial);
  // Stint 0: 8 laps -> 20L left. Stint 1 (5 laps): needs 55L -> +35L, 5L left. Stint 2 (9 laps): needs 95L -> +90L
  assert.equal(evalBefore.stints[1].fuelAddedBeforeStint, 35);
  assert.equal(evalBefore.stints[2].fuelAddedBeforeStint, 90);

  // Move stint 2 (9 laps) ahead of stint 1 (5 laps)
  var reordered = Strategy.reorderStints(initial, 2, 1);
  assert.deepEqual(
    reordered.map(function (s) { return s.compound + ':' + s.laps; }),
    ['medium:8', 'soft:9', 'soft:5']
  );
  // First soft stint after medium must change tires
  assert.equal(reordered[1].changeTires, true);

  var evalAfter = Strategy.evaluateStrategy(cfg, reordered);
  // Stint 0: 8 laps -> 20L left. Stint 1 (9 laps): needs 95L -> +75L, 5L left. Stint 2 (5 laps): needs 55L -> +50L
  assert.equal(evalAfter.stints[1].fuelAddedBeforeStint, 75);
  assert.equal(evalAfter.stints[2].fuelAddedBeforeStint, 50);

  // Move stint 1 (9 laps) to grid start (index 0): total fuel added changes because start tank is 100L
  var reorderedStart = Strategy.reorderStints(reordered, 1, 0);
  var evalStart = Strategy.evaluateStrategy(cfg, reorderedStart);
  assert.equal(reorderedStart[0].changeTires, true);
  assert.equal(evalStart.stints[0].fuelStartLiters, 100);
  assert.equal(evalStart.stints[0].fuelEndLiters, 10);
  assert.equal(evalStart.stints[1].fuelAddedBeforeStint, 75);
});




