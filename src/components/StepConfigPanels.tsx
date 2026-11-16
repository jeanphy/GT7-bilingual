import React from 'react';
import {
  COMPOUND_ORDER,
  TANK_CAPACITY_LITERS,
  formatDurationMinutes,
  formatLapTime,
  parseDurationMinutes,
  parseLapTimeSeconds,
  parseTrackLengthKm,
} from '../engine/logic';
import { TranslationSet } from '../i18n/translations';
import { PitFuelConfig, RaceConfig, RaceMode, TireCompoundId } from '../types/strategy';

interface StepConfigPanelsProps {
  config: RaceConfig;
  t: TranslationSet;
  estimatedLapsInDurationMode: number | null;
  onChangeConfig: (updater: (prev: RaceConfig) => RaceConfig) => void;
}

const COMPOUND_INDICATOR_CLASS: Record<TireCompoundId, string> = {
  soft: 'bg-rose-600 text-white',
  medium: 'bg-amber-500 text-slate-950',
  hard: 'bg-slate-200 text-slate-900 dark:bg-slate-100 dark:text-slate-950',
  intermediate: 'bg-emerald-600 text-white',
  wet: 'bg-sky-600 text-white',
};

export const StepConfigPanels: React.FC<StepConfigPanelsProps> = ({
  config,
  t,
  estimatedLapsInDurationMode,
  onChangeConfig,
}) => {
  const isTrackNameMissing = config.trackName.trim().length === 0;
  const isTrackLengthMissing = config.trackLengthKm === null || config.trackLengthKm <= 0;
  const isCircuitComplete = !isTrackNameMissing && !isTrackLengthMissing;

  const totalDistanceKm =
    config.trackLengthKm !== null ? config.totalLaps * config.trackLengthKm : null;

  const fuelPerLap = config.pitFuel.fuelPerLapLiters;
  const maxFuelLaps =
    fuelPerLap > 0 ? Math.floor(TANK_CAPACITY_LITERS / fuelPerLap) : 0;
  const fullRefuelTime =
    config.pitFuel.refuelRateLps > 0
      ? TANK_CAPACITY_LITERS / config.pitFuel.refuelRateLps
      : 0;

  const handleTrackNameChange = (value: string) => {
    onChangeConfig((prev) => ({
      ...prev,
      trackName: value,
    }));
  };

  const handleTrackLengthChange = (value: string) => {
    const parsed = parseTrackLengthKm(value);
    onChangeConfig((prev) => ({
      ...prev,
      trackLengthInput: value,
      trackLengthKm: parsed,
    }));
  };

  const handleModeChange = (mode: RaceMode) => {
    onChangeConfig((prev) => ({ ...prev, mode }));
  };

  const handleDurationInputChange = (val: string) => {
    const parsed = parseDurationMinutes(val);
    onChangeConfig((prev) => ({
      ...prev,
      durationInput: val,
      durationMinutes: parsed ?? prev.durationMinutes,
    }));
  };

  const updatePitFuel = (field: keyof PitFuelConfig, rawValue: string) => {
    const num = parseFloat(rawValue.replace(',', '.'));
    if (!Number.isFinite(num)) return;
    onChangeConfig((prev) => ({
      ...prev,
      pitFuel: {
        ...prev.pitFuel,
        [field]: Math.max(field === 'refuelRateLps' || field === 'fuelPerLapLiters' ? 0.1 : 0, num),
      },
    }));
  };

  const updateTireField = (
    id: TireCompoundId,
    patch: Partial<{ enabled: boolean; lapTimeInput: string; maxLaps: number; mandatory: boolean }>
  ) => {
    onChangeConfig((prev) => {
      const current = prev.tires[id];
      const nextInput = patch.lapTimeInput !== undefined ? patch.lapTimeInput : current.lapTimeInput;
      const nextLapTime =
        patch.lapTimeInput !== undefined ? parseLapTimeSeconds(nextInput) : current.lapTimeSeconds;
      const nextEnabled = patch.enabled !== undefined ? patch.enabled : current.enabled;
      const nextMandatory =
        patch.mandatory !== undefined
          ? patch.mandatory
          : nextEnabled
            ? current.mandatory
            : false;

      return {
        ...prev,
        tires: {
          ...prev.tires,
          [id]: {
            ...current,
            ...patch,
            enabled: nextMandatory ? true : nextEnabled,
            lapTimeInput: nextInput,
            lapTimeSeconds: nextLapTime,
            mandatory: nextMandatory,
          },
        },
      };
    });
  };

  const parsedDurationPreview = parseDurationMinutes(config.durationInput);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Step 1: Circuit */}
        <section
          id="step-1"
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 sm:p-6"
        >
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {t.step1Title}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              {t.step1Subtitle}
            </p>
          </div>
          <div className="text-xs font-medium">
            {isCircuitComplete ? (
              <span className="text-emerald-700 dark:text-emerald-400">
                {t.circuitConfigured}
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">
                {t.circuitFieldsRequired}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
          <div className="sm:col-span-7 space-y-1.5">
            <label
              htmlFor="track-name-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {t.trackNameLabel} <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <input
              id="track-name-input"
              type="text"
              required
              value={config.trackName}
              placeholder={t.trackNamePlaceholder}
              onChange={(e) => handleTrackNameChange(e.target.value)}
              className={`w-full h-10 px-3 text-sm rounded-lg border bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-600 ${
                isTrackNameMissing
                  ? 'border-amber-500/70 dark:border-amber-500/60'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            />
            {isTrackNameMissing && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t.trackNameRequired}
              </p>
            )}
          </div>

          <div className="sm:col-span-5 space-y-1.5">
            <label
              htmlFor="track-length-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {t.trackLengthLabel} ({t.trackLengthUnit}){' '}
              <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <input
              id="track-length-input"
              type="text"
              inputMode="decimal"
              required
              value={config.trackLengthInput}
              placeholder={t.trackLengthPlaceholder}
              onChange={(e) => handleTrackLengthChange(e.target.value)}
              className={`w-full h-10 px-3 text-sm font-mono tabular-nums rounded-lg border bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-600 ${
                isTrackLengthMissing
                  ? 'border-amber-500/70 dark:border-amber-500/60'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            />
            {isTrackLengthMissing && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t.trackLengthRequired}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Step 2: Race Duration */}
      <section
        id="step-2"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {t.step2Title}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              {t.step2Subtitle}
            </p>
          </div>

          <div
            role="tablist"
            aria-label={t.step2Title}
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            <button
              type="button"
              role="tab"
              aria-selected={config.mode === 'duration'}
              onClick={() => handleModeChange('duration')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                config.mode === 'duration'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.modeDuration}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={config.mode === 'laps'}
              onClick={() => handleModeChange('laps')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                config.mode === 'laps'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.modeLaps}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
          {config.mode === 'duration' ? (
            <>
              <div className="sm:col-span-6 space-y-1.5">
                <label
                  htmlFor="duration-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  {t.durationInputLabel}
                </label>
                <input
                  id="duration-input"
                  type="text"
                  value={config.durationInput}
                  onChange={(e) => handleDurationInputChange(e.target.value)}
                  className={`w-full h-10 px-3 text-sm font-mono tabular-nums rounded-lg border bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-600 ${
                    parsedDurationPreview === null
                      ? 'border-rose-500'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.durationHelp}
                </p>
              </div>
              <div className="sm:col-span-6 grid grid-cols-2 gap-4 pt-2 sm:pt-0 sm:pl-4 sm:border-l sm:border-slate-200 dark:sm:border-slate-800">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t.parsedDurationPrefix}
                  </div>
                  <div className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-0.5">
                    {formatDurationMinutes(config.durationMinutes)} ({Math.round(config.durationMinutes)} min)
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t.estimatedLapsLabel}
                  </div>
                  <div className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-0.5">
                    {estimatedLapsInDurationMode !== null
                      ? config.trackLengthKm !== null
                        ? `${t.lapsWord(estimatedLapsInDurationMode)} · ${(
                            estimatedLapsInDurationMode * config.trackLengthKm
                          ).toFixed(1)} ${t.trackLengthUnit}`
                        : t.lapsWord(estimatedLapsInDurationMode)
                      : '—'}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="sm:col-span-6 space-y-1.5">
                <label
                  htmlFor="laps-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  {t.lapsInputLabel}
                </label>
                <input
                  id="laps-input"
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  value={config.totalLaps}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (Number.isFinite(val) && val >= 1) {
                      onChangeConfig((prev) => ({ ...prev, totalLaps: val }));
                    }
                  }}
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-600"
                />
              </div>
              <div className="sm:col-span-6 pt-2 sm:pt-0 sm:pl-4 sm:border-l sm:border-slate-200 dark:sm:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {t.totalDistanceLabel}
                </div>
                <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-0.5">
                  {totalDistanceKm !== null
                    ? `${totalDistanceKm.toFixed(2)} ${t.trackLengthUnit}`
                    : '—'}
                </div>
              </div>
            </>
          )}
        </div>
      </section>
      </div>

      {/* Step 3: Pit Stop & Fuel */}
      <section
        id="step-3"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {t.step3Title}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              {t.step3Subtitle}
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t.tankCapacityNote}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="pit-transit"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {t.pitTransitLabel}
            </label>
            <input
              id="pit-transit"
              type="number"
              step="0.5"
              min="0"
              value={config.pitFuel.pitTransitSeconds}
              onChange={(e) => updatePitFuel('pitTransitSeconds', e.target.value)}
              className="w-full h-10 px-3 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-600"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="tire-change-sec"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {t.tireChangeLabel}
            </label>
            <input
              id="tire-change-sec"
              type="number"
              step="0.5"
              min="0"
              value={config.pitFuel.tireChangeSeconds}
              onChange={(e) => updatePitFuel('tireChangeSeconds', e.target.value)}
              className="w-full h-10 px-3 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-600"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="refuel-rate"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {t.refuelRateLabel}
            </label>
            <input
              id="refuel-rate"
              type="number"
              step="0.1"
              min="0.1"
              value={config.pitFuel.refuelRateLps}
              onChange={(e) => updatePitFuel('refuelRateLps', e.target.value)}
              className="w-full h-10 px-3 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-600"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="fuel-per-lap"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {t.fuelPerLapLabel}
            </label>
            <input
              id="fuel-per-lap"
              type="number"
              step="0.1"
              min="0.1"
              max="100"
              value={config.pitFuel.fuelPerLapLiters}
              onChange={(e) => updatePitFuel('fuelPerLapLiters', e.target.value)}
              className="w-full h-10 px-3 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-600"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="fuel-margin"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {t.fuelMarginLabel}
            </label>
            <input
              id="fuel-margin"
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={config.pitFuel.fuelMarginLaps}
              onChange={(e) => updatePitFuel('fuelMarginLaps', e.target.value)}
              className="w-full h-10 px-3 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-600"
            />
          </div>

          <div className="flex flex-col justify-center pt-1 sm:pl-4 sm:border-l sm:border-slate-200 dark:sm:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t.maxFuelStintLabel}
            </div>
            <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
              {t.lapsWord(maxFuelLaps)} · {t.fullTankRefuelTimeLabel}: {fullRefuelTime.toFixed(1)}s
            </div>
          </div>
        </div>
      </section>

      {/* Step 4: Tire Performance */}
      <section
        id="step-4"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 sm:p-6"
      >
        <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {t.step4Title}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {t.step4Subtitle}
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-2 pr-3">{t.activeCol}</th>
                <th className="py-2 pr-3">{t.compoundCol}</th>
                <th className="py-2 pr-3">{t.lapTimeCol}</th>
                <th className="py-2 pr-3">{t.maxLapsCol}</th>
                <th className="py-2 pr-3 text-center">{t.mandatoryCol}</th>
                <th className="py-2 text-right">{t.stintWindowCol}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80 text-sm">
              {COMPOUND_ORDER.map((id) => {
                const tire = config.tires[id];
                const label = t.compounds[id];
                const isInvalidTime = tire.enabled && tire.lapTimeSeconds === null;
                const fuelLimitedMax = Math.min(tire.maxLaps, maxFuelLaps);

                return (
                  <tr
                    key={id}
                    className={`transition-colors ${
                      tire.enabled
                        ? 'text-slate-900 dark:text-slate-100'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    <td className="py-2.5 pr-3">
                      <input
                        type="checkbox"
                        checked={tire.enabled}
                        aria-label={`${t.activeCol} ${label.name}`}
                        onChange={(e) => updateTireField(id, { enabled: e.target.checked })}
                        className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <div className="inline-flex items-center gap-2.5">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-mono font-bold ${COMPOUND_INDICATOR_CLASS[id]}`}
                        >
                          {label.short}
                        </span>
                        <span className="font-medium">{label.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={tire.lapTimeInput}
                          disabled={!tire.enabled}
                          aria-label={`${t.lapTimeCol} ${label.name}`}
                          onChange={(e) =>
                            updateTireField(id, { lapTimeInput: e.target.value })
                          }
                          className={`w-28 h-9 px-2.5 text-sm font-mono tabular-nums rounded-md border bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-600 disabled:opacity-50 ${
                            isInvalidTime
                              ? 'border-rose-500 text-rose-500'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                        />
                        {tire.enabled && tire.lapTimeSeconds !== null && (
                          <span className="hidden xl:inline text-xs font-mono tabular-nums text-slate-400">
                            {formatLapTime(tire.lapTimeSeconds)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <input
                        type="number"
                        min="1"
                        max="200"
                        step="1"
                        disabled={!tire.enabled}
                        value={tire.maxLaps}
                        aria-label={`${t.maxLapsCol} ${label.name}`}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (Number.isFinite(v) && v >= 1) {
                            updateTireField(id, { maxLaps: v });
                          }
                        }}
                        className="w-20 h-9 px-2.5 text-sm font-mono tabular-nums rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-600 disabled:opacity-50"
                      />
                    </td>
                    <td className="py-2.5 pr-3 text-center">
                      <input
                        type="checkbox"
                        checked={tire.mandatory}
                        aria-label={`${t.mandatoryCol} ${label.name}`}
                        onChange={(e) =>
                          updateTireField(id, { mandatory: e.target.checked })
                        }
                        className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {tire.enabled ? `${fuelLimitedMax} / ${tire.maxLaps}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {t.tireTimeHint}
        </p>
      </section>
    </div>
  );
};
