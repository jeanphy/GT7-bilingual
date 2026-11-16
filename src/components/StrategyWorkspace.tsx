import React from 'react';
import { AlertTriangle, CheckCircle2, Minus, Plus, Printer, RotateCcw, Trash2 } from 'lucide-react';
import {
  COMPOUND_ORDER,
  formatDurationMinutes,
  formatLapTime,
  formatRaceTime,
} from '../engine/logic';
import { TranslationSet } from '../i18n/translations';
import {
  EvaluatedStrategy,
  OptimizerResult,
  RaceConfig,
  StintInput,
  TireCompoundId,
  ValidationIssue,
} from '../types/strategy';

interface StrategyWorkspaceProps {
  config: RaceConfig;
  t: TranslationSet;
  optimizerResult: OptimizerResult;
  activeEvaluation: EvaluatedStrategy;
  editedStints: StintInput[];
  isCustomEdited: boolean;
  onUpdateStints: (next: StintInput[]) => void;
  onApplyStrategy: (strategy: EvaluatedStrategy) => void;
  onResetToOptimal: () => void;
}

const COMPOUND_BAR_CLASS: Record<TireCompoundId, string> = {
  soft: 'bg-rose-600 text-white',
  medium: 'bg-amber-500 text-slate-950',
  hard: 'bg-slate-200 text-slate-900 dark:bg-slate-100 dark:text-slate-950',
  intermediate: 'bg-emerald-600 text-white',
  wet: 'bg-sky-600 text-white',
};

const COMPOUND_TEXT_CLASS: Record<TireCompoundId, string> = {
  soft: 'text-rose-600 dark:text-rose-400',
  medium: 'text-amber-600 dark:text-amber-400',
  hard: 'text-slate-700 dark:text-slate-200',
  intermediate: 'text-emerald-600 dark:text-emerald-400',
  wet: 'text-sky-600 dark:text-sky-400',
};

function renderIssueText(
  issue: ValidationIssue,
  config: RaceConfig,
  t: TranslationSet
): string {
  const stintNum = (issue.stintIndex ?? 0) + 1;
  const compName = issue.compound ? t.compounds[issue.compound].name : '';
  switch (issue.code) {
    case 'NO_ACTIVE_TIRES':
      return t.issueMessages.NO_ACTIVE_TIRES;
    case 'INVALID_FUEL_PER_LAP':
      return t.issueMessages.INVALID_FUEL_PER_LAP;
    case 'STINT_EXCEEDS_TANK':
      return t.issueMessages.STINT_EXCEEDS_TANK(stintNum, issue.detail ?? '?');
    case 'TIRE_SET_EXCEEDED': {
      const [wearStr, maxStr] = (issue.detail ?? '0/0').split('/');
      return t.issueMessages.TIRE_SET_EXCEEDED(
        stintNum,
        parseInt(wearStr, 10) || 0,
        parseInt(maxStr, 10) || 0
      );
    }
    case 'MANDATORY_COMPOUND_MISSING':
      return t.issueMessages.MANDATORY_COMPOUND_MISSING(compName);
    case 'COMPOUND_DISABLED':
      return t.issueMessages.COMPOUND_DISABLED(stintNum, compName);
    case 'LAPS_MISMATCH': {
      const [actStr, expStr] = (issue.detail ?? '0/0').split('/');
      return t.issueMessages.LAPS_MISMATCH(
        parseInt(actStr, 10) || 0,
        parseInt(expStr, 10) || 0
      );
    }
    case 'DURATION_NOT_REACHED': {
      const [act, tgt] = (issue.detail ?? '—/—').split('/');
      return t.issueMessages.DURATION_NOT_REACHED(
        act,
        tgt || formatDurationMinutes(config.durationMinutes)
      );
    }
    case 'DURATION_OVERSHOT_EXTRA_LAP':
      return t.issueMessages.DURATION_OVERSHOT_EXTRA_LAP(stintNum);
    case 'ZERO_LAPS_STINT':
      return t.issueMessages.ZERO_LAPS_STINT(stintNum);
  }
}

export const StrategyWorkspace: React.FC<StrategyWorkspaceProps> = ({
  config,
  t,
  optimizerResult,
  activeEvaluation,
  editedStints,
  isCustomEdited,
  onUpdateStints,
  onApplyStrategy,
  onResetToOptimal,
}) => {
  const optimal = optimizerResult.best;
  const enabledCompounds = COMPOUND_ORDER.filter(
    (id) => config.tires[id].enabled && config.tires[id].lapTimeSeconds !== null
  );

  const handleCompoundChange = (idx: number, compound: TireCompoundId) => {
    const next = editedStints.map((s, i) => {
      if (i !== idx) return s;
      const prevComp = idx > 0 ? editedStints[idx - 1].compound : null;
      return {
        ...s,
        compound,
        changeTires: idx === 0 || compound !== prevComp ? true : s.changeTires,
      };
    });
    // Also ensure following stint resets changeTires if its compound no longer matches
    const normalized = next.map((s, i) => {
      if (i === 0) return { ...s, changeTires: true };
      if (s.compound !== next[i - 1].compound) return { ...s, changeTires: true };
      return s;
    });
    onUpdateStints(normalized);
  };

  const handleLapsChange = (idx: number, nextLaps: number) => {
    const clamped = Math.max(1, Math.min(500, Math.floor(nextLaps)));
    onUpdateStints(
      editedStints.map((s, i) => (i === idx ? { ...s, laps: clamped } : s))
    );
  };

  const handleToggleTireChange = (idx: number) => {
    if (idx === 0) return;
    onUpdateStints(
      editedStints.map((s, i) =>
        i === idx ? { ...s, changeTires: !s.changeTires } : s
      )
    );
  };

  const handleAddStint = () => {
    const fallbackCompound = enabledCompounds[0] ?? 'medium';
    const maxFuelLaps =
      config.pitFuel.fuelPerLapLiters > 0
        ? Math.max(1, Math.floor(100 / config.pitFuel.fuelPerLapLiters))
        : 5;
    const defaultLaps = Math.min(maxFuelLaps, config.tires[fallbackCompound].maxLaps, 10);
    onUpdateStints([
      ...editedStints,
      {
        id: `stint-${Date.now()}-${editedStints.length}`,
        compound: fallbackCompound,
        laps: Math.max(1, defaultLaps),
        changeTires: true,
      },
    ]);
  };

  const handleRemoveStint = (idx: number) => {
    if (editedStints.length <= 1) return;
    const filtered = editedStints.filter((_, i) => i !== idx);
    const normalized = filtered.map((s, i) => {
      if (i === 0) return { ...s, changeTires: true };
      if (s.compound !== filtered[i - 1].compound) return { ...s, changeTires: true };
      return s;
    });
    onUpdateStints(normalized);
  };

  const renderDeltaVsOptimal = () => {
    if (!optimal) return '—';
    if (!isCustomEdited) return t.identicalToOptimal;

    const lapDiff = activeEvaluation.totalLaps - optimal.totalLaps;
    const timeDiff = activeEvaluation.totalTimeSeconds - optimal.totalTimeSeconds;

    if (config.mode === 'duration' && lapDiff !== 0) {
      const sign = lapDiff > 0 ? `+${lapDiff}` : `${lapDiff}`;
      return `${sign} ${lapDiff > 0 ? t.moreLaps : t.fewerLaps}`;
    }

    if (Math.abs(timeDiff) < 0.05) return t.identicalToOptimal;
    const absStr = `${Math.abs(timeDiff).toFixed(1)}s`;
    return timeDiff < 0 ? `-${absStr} (${t.fasterBy})` : `+${absStr} (${t.slowerBy})`;
  };

  const totalLapsForBar = Math.max(1, activeEvaluation.totalLaps);

  return (
    <section
      id="step-5"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 sm:p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {t.step5Title}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {t.step5Subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {optimal && isCustomEdited && (
            <button
              type="button"
              onClick={onResetToOptimal}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t.applyOptimalBtn}
            </button>
          )}
          <button
            type="button"
            onClick={handleAddStint}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {t.addStintBtn}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            {t.printPdfBtn}
          </button>
        </div>
      </div>

      {/* Print-only race parameters summary */}
      <div className="hidden print:grid grid-cols-3 gap-4 pb-4 border-b border-slate-300 text-xs text-slate-700">
        <div>
          <span className="font-semibold text-slate-900">{t.trackNameLabel}: </span>
          <span>
            {config.trackName.trim() || t.unnamedTrackFallback}
            {config.trackLengthKm !== null
              ? ` (${config.trackLengthKm.toFixed(3)} ${t.trackLengthUnit})`
              : ''}
          </span>
        </div>
        <div>
          <span className="font-semibold text-slate-900">{t.navRace}: </span>
          <span className="font-mono tabular-nums">
            {config.mode === 'duration'
              ? formatDurationMinutes(config.durationMinutes)
              : t.lapsWord(config.totalLaps)}
          </span>
        </div>
        <div>
          <span className="font-semibold text-slate-900">{t.navPitFuel}: </span>
          <span className="font-mono tabular-nums">
            {config.pitFuel.pitTransitSeconds}s + {config.pitFuel.tireChangeSeconds}s ·{' '}
            {config.pitFuel.refuelRateLps} L/s · {config.pitFuel.fuelPerLapLiters} L{t.perLapShort}
          </span>
        </div>
      </div>

      {/* No valid strategy alert */}
      {!optimal && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{t.noValidStrategy}</span>
        </div>
      )}

      {/* Active vs Optimal Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.totalTimeLabel}
          </div>
          <div className="text-base sm:text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-0.5">
            {formatRaceTime(activeEvaluation.totalTimeSeconds)}
          </div>
          {optimal && isCustomEdited && (
            <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              {t.optimalShort}: {formatRaceTime(optimal.totalTimeSeconds)}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.totalLapsLabel}
          </div>
          <div className="text-base sm:text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-0.5">
            {t.lapsWord(activeEvaluation.totalLaps)}
          </div>
          {optimal && isCustomEdited && (
            <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              {t.optimalShort}: {t.lapsWord(optimal.totalLaps)}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.pitStopsLabel}
          </div>
          <div className="text-base sm:text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-0.5">
            {t.stopsWord(activeEvaluation.totalStops)}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
            {activeEvaluation.totalPitSeconds.toFixed(1)}s {t.pitShort}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.totalFuelAddedLabel}
          </div>
          <div className="text-base sm:text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-0.5">
            {activeEvaluation.totalFuelAddedLiters.toFixed(1)} L
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
            {activeEvaluation.totalFuelUsedLiters.toFixed(1)} L {t.usedShort}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.deltaVsOptimalLabel}
          </div>
          <div
            className={`text-sm font-semibold font-mono tabular-nums mt-1 ${
              !isCustomEdited
                ? 'text-emerald-600 dark:text-emerald-400'
                : activeEvaluation.isValid
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {renderDeltaVsOptimal()}
          </div>
        </div>
      </div>

      {/* Live Validation Banner */}
      <div
        className={`rounded-lg border p-3.5 text-xs sm:text-sm ${
          activeEvaluation.isValid
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300'
            : 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300'
        }`}
      >
        {activeEvaluation.isValid ? (
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{t.validationOk}</span>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {activeEvaluation.issues.map((issue, idx) => (
              <li key={`${issue.code}-${idx}`} className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{renderIssueText(issue, config, t)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Visual Stint Timeline Bar */}
      {activeEvaluation.stints.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {t.stintTimelineTitle}
            </span>
            <span className="font-mono tabular-nums">
              {activeEvaluation.stints
                .map(
                  (st) =>
                    `${t.compounds[st.compound].short}${st.laps}`
                )
                .join(' · ')}
            </span>
          </div>

          <div className="flex w-full h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
            {activeEvaluation.stints.map((st, idx) => {
              const pct = (st.laps / totalLapsForBar) * 100;
              const short = t.compounds[st.compound].short;
              return (
                <div
                  key={`${st.index}-${idx}`}
                  style={{ width: `${Math.max(pct, 6)}%` }}
                  title={`${t.stintCol} ${idx + 1}: ${t.compounds[st.compound].name} · ${t.lapsWord(st.laps)}`}
                  className={`relative flex items-center justify-center px-1.5 text-xs font-mono font-semibold tabular-nums transition-opacity ${
                    COMPOUND_BAR_CLASS[st.compound]
                  } ${
                    idx > 0
                      ? 'border-l-2 border-slate-950/60 dark:border-[#0B0F17]'
                      : ''
                  }`}
                >
                  <span className="truncate">
                    {short}·{st.laps}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Editable Stint Breakdown Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-3">{t.tireCol}</th>
              <th className="py-2 pr-3">{t.lapsCol}</th>
              <th className="py-2 pr-3">{t.tireActionCol}</th>
              <th className="py-2 pr-3 text-right">{t.tireWearCol}</th>
              <th className="py-2 pr-3 text-right">{t.fuelInOutCol}</th>
              <th className="py-2 pr-3 text-right">{t.pitAddedCol}</th>
              <th className="py-2 pr-3 text-right">{t.pitTimeCol}</th>
              <th className="py-2 pr-2 text-right">{t.stintTimeCol}</th>
              <th className="py-2 text-right">
                <span className="sr-only">{t.removeStintBtn}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80 text-xs sm:text-sm">
            {activeEvaluation.stints.map((st, idx) => {
              const rawStint = editedStints[idx];
              const canKeepTires =
                idx > 0 && editedStints[idx - 1]?.compound === rawStint?.compound;
              const tireOver = st.tireLapsEnd > st.tireMaxLaps;
              const fuelOver = st.fuelEndLiters < -1e-6;

              return (
                <tr key={rawStint?.id ?? idx} className="align-middle">
                  <td className="py-2.5 pr-2 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {idx + 1}
                  </td>

                  <td className="py-2.5 pr-3">
                    <span className={`hidden print:inline font-medium ${COMPOUND_TEXT_CLASS[rawStint.compound]}`}>
                      {t.compounds[rawStint.compound].short} — {t.compounds[rawStint.compound].name}
                    </span>
                    <select
                      value={rawStint.compound}
                      aria-label={`${t.stintCol} ${idx + 1} ${t.tireCol}`}
                      onChange={(e) =>
                        handleCompoundChange(idx, e.target.value as TireCompoundId)
                      }
                      className={`print:hidden h-8 px-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-600 ${
                        COMPOUND_TEXT_CLASS[rawStint.compound]
                      }`}
                    >
                      {COMPOUND_ORDER.map((cid) => {
                        const isCompEnabled =
                          config.tires[cid].enabled &&
                          config.tires[cid].lapTimeSeconds !== null;
                        if (!isCompEnabled && cid !== rawStint.compound) return null;
                        return (
                          <option key={cid} value={cid}>
                            {t.compounds[cid].short} — {t.compounds[cid].name}
                          </option>
                        );
                      })}
                    </select>
                  </td>

                  <td className="py-2.5 pr-3">
                    <span className="hidden print:inline font-mono tabular-nums font-medium">
                      {rawStint.laps}
                    </span>
                    <div className="print:hidden inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleLapsChange(idx, rawStint.laps - 1)}
                        disabled={rawStint.laps <= 1}
                        aria-label="-1"
                        className="w-7 h-8 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={rawStint.laps}
                        aria-label={`${t.stintCol} ${idx + 1} ${t.lapsCol}`}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (Number.isFinite(v)) handleLapsChange(idx, v);
                        }}
                        className="w-12 h-8 px-1 text-center text-xs font-mono tabular-nums rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-600"
                      />
                      <button
                        type="button"
                        onClick={() => handleLapsChange(idx, rawStint.laps + 1)}
                        aria-label="+1"
                        className="w-7 h-8 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </td>

                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    {idx === 0 ? (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {t.raceStartLabel}
                      </span>
                    ) : canKeepTires ? (
                      <>
                        <span className="hidden print:inline text-xs">
                          {st.changeTires ? t.newTireSet : t.keepTireSet}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleTireChange(idx)}
                          className={`print:hidden px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            st.changeTires
                              ? 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {st.changeTires ? t.newTireSet : t.keepTireSet}
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {t.newTireSet}
                      </span>
                    )}
                  </td>

                  <td
                    className={`py-2.5 pr-3 text-right font-mono tabular-nums whitespace-nowrap ${
                      tireOver
                        ? 'text-rose-600 dark:text-rose-400 font-semibold'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {st.tireLapsEnd} / {st.tireMaxLaps}
                  </td>

                  <td
                    className={`py-2.5 pr-3 text-right font-mono tabular-nums whitespace-nowrap ${
                      fuelOver
                        ? 'text-rose-600 dark:text-rose-400 font-semibold'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {st.fuelStartLiters.toFixed(1)} → {st.fuelEndLiters.toFixed(1)} L
                  </td>

                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {idx === 0 ? '—' : `+${st.fuelAddedBeforeStint.toFixed(1)} L`}
                  </td>

                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {idx === 0 ? '—' : `${st.pitDurationBeforeStint.toFixed(1)}s`}
                  </td>

                  <td className="py-2.5 pr-2 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {formatRaceTime(st.drivingSeconds)}
                    <div className="text-[11px] text-slate-400">
                      {formatLapTime(st.lapTimeSeconds)}{t.perLapShort}
                    </div>
                  </td>

                  <td className="py-2.5 text-right print:hidden">
                    {editedStints.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveStint(idx)}
                        aria-label={`${t.removeStintBtn} ${idx + 1}`}
                        className="p-1.5 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Alternative Strategies Comparison */}
      {optimizerResult.alternatives.length > 0 && (
        <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t.alternativesTitle}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3">{t.pitStopsLabel}</th>
                  <th className="py-2 pr-3">{t.stintTimelineTitle}</th>
                  <th className="py-2 pr-3 text-right">{t.totalLapsLabel}</th>
                  <th className="py-2 pr-3 text-right">{t.totalTimeLabel}</th>
                  <th className="py-2 pr-3 text-right">{t.deltaVsOptimalLabel}</th>
                  <th className="py-2 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
                {optimizerResult.alternatives.map((alt, idx) => {
                  const isBest = idx === 0;
                  const deltaSec = optimal
                    ? alt.totalTimeSeconds - optimal.totalTimeSeconds
                    : 0;
                  const lapDiff = optimal ? alt.totalLaps - optimal.totalLaps : 0;
                  const sequence = alt.stints
                    .map(
                      (s, sIdx) =>
                        `${sIdx > 0 && !s.changeTires ? '↺' : ''}${t.compounds[s.compound].short}${s.laps}`
                    )
                    .join(' → ');
                  const matchesActive =
                    !isCustomEdited && isBest
                      ? true
                      : alt.stints.length === editedStints.length &&
                        alt.stints.every(
                          (s, i) =>
                            s.compound === editedStints[i]?.compound &&
                            s.laps === editedStints[i]?.laps &&
                            s.changeTires === editedStints[i]?.changeTires
                        );

                  return (
                    <tr key={`${alt.totalStops}-${idx}`}>
                      <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {t.stopsWord(alt.totalStops)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {sequence}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {alt.totalLaps}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatRaceTime(alt.totalTimeSeconds)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                        {isBest ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            {t.bestLabel}
                          </span>
                        ) : lapDiff !== 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            {lapDiff} {t.lapsCol.toLowerCase()}
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">
                            +{deltaSec.toFixed(1)}s
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap print:hidden">
                        {matchesActive ? (
                          <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                            {t.activeLabel}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onApplyStrategy(alt)}
                            className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            {t.loadPlanBtn}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Calculation Model Assumptions */}
      <div className="pt-5 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {t.assumptionsTitle}
        </h3>
        <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400 list-disc pl-4">
          {t.assumptionsList.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};
