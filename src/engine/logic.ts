import {
  Language,
  RaceConfig,
  ThemeMode,
  TireCompoundId,
  TireConfig,
} from '../types/strategy';

export const TANK_CAPACITY_LITERS = 100;

export const COMPOUND_ORDER: TireCompoundId[] = [
  'soft',
  'medium',
  'hard',
  'intermediate',
  'wet',
];

const STORAGE_KEY = 'gt7_endurance_strategy_v1';

export interface PersistedAppState {
  language: Language;
  theme: ThemeMode;
  config: RaceConfig;
}

/**
 * Parse flexible duration strings into minutes.
 * Accepts: "90", "90m", "90 min", "1h30", "1h 30", "1h30m", "1:30", "2h", "1.5h", "1,5h".
 */
export function parseDurationMinutes(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase().replace(/,/g, '.');
  if (!cleaned) return null;

  // Format: "1h30", "1h 30", "1h30m", "2h", "1.5h"
  const hMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+(?:\.\d+)?)\s*(?:m|min)?)?$/);
  if (hMatch) {
    const hours = parseFloat(hMatch[1]);
    const mins = hMatch[2] ? parseFloat(hMatch[2]) : 0;
    if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
    const total = hours * 60 + mins;
    return total > 0 ? total : null;
  }

  // Format: "1:30" (hours:minutes)
  const colonMatch = cleaned.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (colonMatch) {
    const hours = parseInt(colonMatch[1], 10);
    const mins = parseInt(colonMatch[2], 10);
    if (!Number.isFinite(hours) || !Number.isFinite(mins) || mins >= 60) return null;
    const total = hours * 60 + mins;
    return total > 0 ? total : null;
  }

  // Format: "90", "90m", "90 min"
  const minMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes?)?$/);
  if (minMatch) {
    const mins = parseFloat(minMatch[1]);
    return Number.isFinite(mins) && mins > 0 ? mins : null;
  }

  return null;
}

/**
 * Parse flexible lap time strings into seconds.
 * Accepts: "1:48.500", "1:48,5", "1m48.5", "108.5", "108,5", "2:17".
 */
export function parseLapTimeSeconds(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase().replace(/,/g, '.');
  if (!cleaned) return null;

  // "1:48.500" or "1:48"
  const colonMatch = cleaned.match(/^(\d+)\s*:\s*(\d{1,2}(?:\.\d+)?)$/);
  if (colonMatch) {
    const mins = parseInt(colonMatch[1], 10);
    const secs = parseFloat(colonMatch[2]);
    if (!Number.isFinite(mins) || !Number.isFinite(secs) || secs >= 60) return null;
    const total = mins * 60 + secs;
    return total > 0 ? total : null;
  }

  // "1m48.5" or "1m 48.5s"
  const mMatch = cleaned.match(/^(\d+)\s*m\s*(\d{1,2}(?:\.\d+)?)\s*s?$/);
  if (mMatch) {
    const mins = parseInt(mMatch[1], 10);
    const secs = parseFloat(mMatch[2]);
    if (!Number.isFinite(mins) || !Number.isFinite(secs) || secs >= 60) return null;
    const total = mins * 60 + secs;
    return total > 0 ? total : null;
  }

  // Pure seconds: "108.5" or "108.5s"
  const secMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*s?$/);
  if (secMatch) {
    const secs = parseFloat(secMatch[1]);
    return Number.isFinite(secs) && secs > 0 ? secs : null;
  }

  return null;
}

export function formatLapTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const mins = Math.floor(seconds / 60);
  const rem = seconds - mins * 60;
  const remFixed = rem.toFixed(3).padStart(6, '0');
  return mins > 0 ? `${mins}:${remFixed}` : `${rem.toFixed(3)}s`;
}

export function formatRaceTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const rounded = Math.round(seconds * 10) / 10;
  const hours = Math.floor(rounded / 3600);
  const mins = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  const secStr = secs.toFixed(1).padStart(4, '0');
  if (hours > 0) {
    return `${hours}h ${String(mins).padStart(2, '0')}m ${secStr}s`;
  }
  return `${mins}m ${secStr}s`;
}

export function formatDurationMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const totalMins = Math.round(minutes * 10) / 10;
  if (totalMins >= 60) {
    const h = Math.floor(totalMins / 60);
    const m = Math.round((totalMins - h * 60) * 10) / 10;
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h00`;
  }
  return `${totalMins} min`;
}

export function createTireConfig(
  id: TireCompoundId,
  enabled: boolean,
  lapTimeInput: string,
  maxLaps: number,
  mandatory = false
): TireConfig {
  return {
    id,
    enabled,
    lapTimeInput,
    lapTimeSeconds: parseLapTimeSeconds(lapTimeInput),
    maxLaps,
    mandatory,
  };
}

export function parseTrackLengthKm(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '.').replace(/\s*km$/i, '');
  if (!cleaned) return null;
  const val = parseFloat(cleaned);
  return Number.isFinite(val) && val > 0 ? val : null;
}

export function createDefaultConfig(): RaceConfig {
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

export function createDefaultAppState(): PersistedAppState {
  return {
    language: 'fr',
    theme: 'dark',
    config: createDefaultConfig(),
  };
}

export function loadSavedAppState(): PersistedAppState {
  const fallback = createDefaultAppState();
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return fallback;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    const language: Language = parsed.language === 'en' ? 'en' : 'fr';
    const theme: ThemeMode = parsed.theme === 'light' ? 'light' : 'dark';
    const cfg = parsed.config;
    if (!cfg || typeof cfg !== 'object') {
      return { language, theme, config: fallback.config };
    }

    const mergedTires = { ...fallback.config.tires };
    if (cfg.tires) {
      for (const id of COMPOUND_ORDER) {
        const t = cfg.tires[id];
        if (t) {
          mergedTires[id] = {
            id,
            enabled: Boolean(t.enabled),
            lapTimeInput: typeof t.lapTimeInput === 'string' ? t.lapTimeInput : fallback.config.tires[id].lapTimeInput,
            lapTimeSeconds: parseLapTimeSeconds(
              typeof t.lapTimeInput === 'string' ? t.lapTimeInput : fallback.config.tires[id].lapTimeInput
            ),
            maxLaps: Number.isFinite(t.maxLaps) && t.maxLaps >= 1 ? Math.floor(t.maxLaps) : fallback.config.tires[id].maxLaps,
            mandatory: Boolean(t.mandatory),
          };
        }
      }
    }

    const durationInput = typeof cfg.durationInput === 'string' ? cfg.durationInput : fallback.config.durationInput;
    const parsedDur = parseDurationMinutes(durationInput) ?? fallback.config.durationMinutes;

    const trackName = typeof cfg.trackName === 'string' ? cfg.trackName : fallback.config.trackName;
    const legacyLength = (cfg as unknown as Record<string, unknown>).customLengthKm;
    const trackLengthInput =
      typeof cfg.trackLengthInput === 'string'
        ? cfg.trackLengthInput
        : typeof legacyLength === 'number' && Number.isFinite(legacyLength) && legacyLength > 0
          ? String(legacyLength)
          : fallback.config.trackLengthInput;
    const trackLengthKm = parseTrackLengthKm(trackLengthInput);

    return {
      language,
      theme,
      config: {
        trackName,
        trackLengthInput,
        trackLengthKm,
        mode: cfg.mode === 'laps' ? 'laps' : 'duration',
        durationInput,
        durationMinutes: parsedDur,
        totalLaps:
          Number.isFinite(cfg.totalLaps) && cfg.totalLaps >= 1
            ? Math.floor(cfg.totalLaps)
            : fallback.config.totalLaps,
        pitFuel: {
          pitTransitSeconds:
            Number.isFinite(cfg.pitFuel?.pitTransitSeconds) && cfg.pitFuel.pitTransitSeconds >= 0
              ? cfg.pitFuel.pitTransitSeconds
              : fallback.config.pitFuel.pitTransitSeconds,
          tireChangeSeconds:
            Number.isFinite(cfg.pitFuel?.tireChangeSeconds) && cfg.pitFuel.tireChangeSeconds >= 0
              ? cfg.pitFuel.tireChangeSeconds
              : fallback.config.pitFuel.tireChangeSeconds,
          refuelRateLps:
            Number.isFinite(cfg.pitFuel?.refuelRateLps) && cfg.pitFuel.refuelRateLps > 0
              ? cfg.pitFuel.refuelRateLps
              : fallback.config.pitFuel.refuelRateLps,
          fuelPerLapLiters:
            Number.isFinite(cfg.pitFuel?.fuelPerLapLiters) && cfg.pitFuel.fuelPerLapLiters > 0
              ? cfg.pitFuel.fuelPerLapLiters
              : fallback.config.pitFuel.fuelPerLapLiters,
          fuelMarginLaps:
            Number.isFinite(cfg.pitFuel?.fuelMarginLaps) && cfg.pitFuel.fuelMarginLaps >= 0
              ? cfg.pitFuel.fuelMarginLaps
              : fallback.config.pitFuel.fuelMarginLaps,
        },
        tires: mergedTires,
      },
    };
  } catch {
    return fallback;
  }
}

export function saveAppState(state: PersistedAppState): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}
