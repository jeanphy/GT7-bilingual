import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Moon, RotateCcw, Sun } from 'lucide-react';
import { StepConfigPanels } from './components/StepConfigPanels';
import { StrategyWorkspace } from './components/StrategyWorkspace';
import {
  createDefaultAppState,
  formatDurationMinutes,
  formatRaceTime,
  loadSavedAppState,
  saveAppState,
} from './engine/logic';
import { evaluateStrategy, findOptimalStrategies } from './engine/strategy';
import { TRANSLATIONS } from './i18n/translations';
import {
  EvaluatedStrategy,
  Language,
  RaceConfig,
  StintInput,
  ThemeMode,
} from './types/strategy';

function strategyToStintInputs(strategy: EvaluatedStrategy | null): StintInput[] {
  if (!strategy || strategy.stints.length === 0) {
    return [{ id: 'default-0', compound: 'medium', laps: 10, changeTires: true }];
  }
  return strategy.stints.map((s, idx) => ({
    id: `stint-${idx}`,
    compound: s.compound,
    laps: s.laps,
    changeTires: s.changeTires,
  }));
}

export default function App() {
  const initialState = useMemo(() => loadSavedAppState(), []);
  const [language, setLanguage] = useState<Language>(initialState.language);
  const [theme, setTheme] = useState<ThemeMode>(initialState.theme);
  const [config, setConfig] = useState<RaceConfig>(initialState.config);
  const [customStints, setCustomStints] = useState<StintInput[] | null>(null);
  const [copied, setCopied] = useState(false);

  const t = TRANSLATIONS[language];

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.lang = language;
    document.title = t.documentTitle;
  }, [theme, language, t.documentTitle]);

  useEffect(() => {
    saveAppState({ language, theme, config });
  }, [language, theme, config]);

  const optimizerResult = useMemo(() => findOptimalStrategies(config), [config]);

  const optimalStints = useMemo(
    () => strategyToStintInputs(optimizerResult.best),
    [optimizerResult.best]
  );

  const editedStints = customStints ?? optimalStints;
  const isCustomEdited = customStints !== null;

  const activeEvaluation = useMemo(
    () => evaluateStrategy(config, editedStints),
    [config, editedStints]
  );

  const handleApplyStrategy = (strategy: EvaluatedStrategy) => {
    const isBest =
      optimizerResult.best &&
      strategy.stints.length === optimizerResult.best.stints.length &&
      strategy.stints.every(
        (s, i) =>
          s.compound === optimizerResult.best!.stints[i]?.compound &&
          s.laps === optimizerResult.best!.stints[i]?.laps &&
          s.changeTires === optimizerResult.best!.stints[i]?.changeTires
      );
    if (isBest) {
      setCustomStints(null);
    } else {
      setCustomStints(strategyToStintInputs(strategy));
    }
  };

  const handleResetDefaults = () => {
    const defaults = createDefaultAppState();
    setConfig(defaults.config);
    setCustomStints(null);
  };

  const handleCopySummary = async () => {
    const trackLabel = config.trackName.trim() || t.unnamedTrackFallback;
    const lengthNote =
      config.trackLengthKm !== null
        ? ` (${config.trackLengthKm.toFixed(3)} ${t.trackLengthUnit})`
        : '';
    const raceDesc =
      config.mode === 'duration'
        ? `${formatDurationMinutes(config.durationMinutes)}`
        : config.trackLengthKm !== null
          ? `${t.lapsWord(config.totalLaps)} (${(config.totalLaps * config.trackLengthKm).toFixed(1)} ${t.trackLengthUnit})`
          : t.lapsWord(config.totalLaps);

    const lines = [
      `${t.copyHeader} — ${trackLabel}${lengthNote} · ${raceDesc}`,
      `${t.totalTimeLabel}: ${formatRaceTime(activeEvaluation.totalTimeSeconds)} | ${t.totalLapsLabel}: ${activeEvaluation.totalLaps} | ${t.pitStopsLabel}: ${activeEvaluation.totalStops} | ${t.totalFuelAddedLabel}: ${activeEvaluation.totalFuelAddedLiters.toFixed(1)} L`,
      '',
      ...activeEvaluation.stints.map((st, idx) => {
        const comp = t.compounds[st.compound].name;
        const pitNote =
          idx === 0
            ? t.raceStartLabel
            : `+${st.fuelAddedBeforeStint.toFixed(1)}L · ${st.changeTires ? t.newTireSet : t.keepTireSet} (${st.pitDurationBeforeStint.toFixed(1)}s)`;
        return `${t.stintCol} ${idx + 1}: ${comp} · ${t.lapsWord(st.laps)} (${pitNote})`;
      }),
    ];

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 print:bg-white print:text-slate-900">
      {/* Top Bar: strictly 3 zones separated by gap-8 */}
      <header className="print:hidden sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B0F17]/95 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0"
          >
            {t.appTitle}
          </a>

          <nav
            aria-label={t.stepsNavAria}
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            <a
              href="#step-1"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t.navCircuit}
            </a>
            <a
              href="#step-2"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t.navRace}
            </a>
            <a
              href="#step-3"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t.navPitFuel}
            </a>
            <a
              href="#step-4"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t.navTires}
            </a>
            <a
              href="#step-5"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t.navStrategy}
            </a>
          </nav>

          <button
            type="button"
            onClick={handleCopySummary}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                {t.copiedFeedback}
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                {t.copySummaryBtn}
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main id="top" className="max-w-[1240px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 print:max-w-none print:p-0 print:space-y-0">
        {/* Workspace Toolbar & Title */}
        <div className="print:hidden flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 text-balance">
              {t.workspaceLead}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t.workspaceSub}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Language Switcher */}
            <div
              role="group"
              aria-label={t.languageLabel}
              className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            >
              <button
                type="button"
                onClick={() => setLanguage('fr')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  language === 'fr'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                FR
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  language === 'en'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                EN
              </button>
            </div>

            {/* Theme Switcher */}
            <div
              role="group"
              aria-label={t.themeLabel}
              className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            >
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Moon className="w-3 h-3" />
                {t.themeDark}
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sun className="w-3 h-3" />
                {t.themeLight}
              </button>
            </div>

            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t.resetDefaultsBtn}
            </button>
          </div>
        </div>

        {/* Steps 1-4 Configuration above, Step 5 Strategy & Comparison full-width below */}
        <div className="space-y-6 print:space-y-0">
          <div className="print:hidden">
            <StepConfigPanels
              config={config}
              t={t}
              estimatedLapsInDurationMode={
                config.mode === 'duration' ? optimizerResult.best?.totalLaps ?? null : null
              }
              onChangeConfig={setConfig}
            />
          </div>

          <div>
            <StrategyWorkspace
              config={config}
              t={t}
              optimizerResult={optimizerResult}
              activeEvaluation={activeEvaluation}
              editedStints={editedStints}
              isCustomEdited={isCustomEdited}
              onUpdateStints={(next) => setCustomStints(next)}
              onApplyStrategy={handleApplyStrategy}
              onResetToOptimal={() => setCustomStints(null)}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
