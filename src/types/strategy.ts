export type Language = 'fr' | 'en';

export type ThemeMode = 'dark' | 'light';

export type RaceMode = 'duration' | 'laps';

export type TireCompoundId = 'soft' | 'medium' | 'hard' | 'intermediate' | 'wet';

export interface Track {
  id: string;
  name: string;
  layout: string;
  country: string;
  lengthKm: number;
  confirmed: boolean;
}

export interface TireConfig {
  id: TireCompoundId;
  enabled: boolean;
  lapTimeInput: string;
  lapTimeSeconds: number | null;
  maxLaps: number;
  mandatory: boolean;
}

export interface PitFuelConfig {
  pitTransitSeconds: number;
  tireChangeSeconds: number;
  refuelRateLps: number;
  fuelPerLapLiters: number;
  fuelMarginLaps: number;
}

export interface RaceConfig {
  trackName: string;
  trackLengthInput: string;
  trackLengthKm: number | null;
  mode: RaceMode;
  durationInput: string;
  durationMinutes: number;
  totalLaps: number;
  pitFuel: PitFuelConfig;
  tires: Record<TireCompoundId, TireConfig>;
}

export interface StintInput {
  id: string;
  compound: TireCompoundId;
  laps: number;
  changeTires: boolean; // Ignored for stint 1 (race start); for stint >= 2, false allowed only if compound === prev.compound
}

export interface EvaluatedStint {
  index: number;
  compound: TireCompoundId;
  laps: number;
  changeTires: boolean;
  tireSetNumber: number;
  tireLapsStart: number;
  tireLapsEnd: number;
  tireMaxLaps: number;
  fuelStartLiters: number;
  fuelUsedLiters: number;
  fuelEndLiters: number;
  fuelAddedBeforeStint: number;
  pitDurationBeforeStint: number;
  lapTimeSeconds: number;
  drivingSeconds: number;
  cumulativeTimeEndSeconds: number;
  cumulativeLapsEnd: number;
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code:
    | 'NO_ACTIVE_TIRES'
    | 'INVALID_FUEL_PER_LAP'
    | 'STINT_EXCEEDS_TANK'
    | 'TIRE_SET_EXCEEDED'
    | 'MANDATORY_COMPOUND_MISSING'
    | 'COMPOUND_DISABLED'
    | 'LAPS_MISMATCH'
    | 'DURATION_NOT_REACHED'
    | 'DURATION_OVERSHOT_EXTRA_LAP'
    | 'ZERO_LAPS_STINT';
  severity: ValidationSeverity;
  stintIndex?: number;
  compound?: TireCompoundId;
  detail?: string;
}

export interface EvaluatedStrategy {
  stints: EvaluatedStint[];
  totalLaps: number;
  totalStops: number;
  totalTimeSeconds: number;
  totalDrivingSeconds: number;
  totalPitSeconds: number;
  totalFuelUsedLiters: number;
  totalFuelAddedLiters: number;
  compoundsUsed: TireCompoundId[];
  tireSetsUsed: number;
  isValid: boolean;
  issues: ValidationIssue[];
}

export interface OptimizerResult {
  best: EvaluatedStrategy | null;
  alternatives: EvaluatedStrategy[];
  error?: string;
}
