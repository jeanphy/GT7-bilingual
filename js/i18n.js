(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GT7I18n = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TRANSLATIONS = {
    fr: {
      appTitle: 'GT7 Endurance',
      documentTitle: 'Stratégie d’endurance GT7',
      navCircuit: 'Circuit',
      navRace: 'Course',
      navPitFuel: 'Stands',
      navTires: 'Pneus',
      navStrategy: 'Stratégie',
      stepsNavAria: 'Étapes',
      copySummaryBtn: 'Copier le plan',
      copiedFeedback: 'Copié',
      resetDefaultsBtn: 'Réinitialiser',
      workspaceLead: 'Stratégie d’endurance Gran Turismo 7',
      workspaceSub: 'Planificateur d’arrêts aux stands, de carburant et de relais pneumatiques · Sauvegarde locale automatique',
      languageLabel: 'Langue',
      themeLabel: 'Thème',
      themeDark: 'Sombre',
      themeLight: 'Clair',

      step1Title: '01. Circuit',
      step1Subtitle: 'Saisissez le nom du circuit et sa longueur au tour.',
      trackNameLabel: 'Nom du circuit',
      trackNamePlaceholder: 'ex. Circuit de Spa-Francorchamps',
      trackLengthLabel: 'Longueur du circuit',
      trackLengthPlaceholder: 'ex. 7.004',
      trackLengthUnit: 'km',
      trackNameRequired: 'Veuillez saisir le nom du circuit.',
      trackLengthRequired: 'Veuillez saisir une longueur valide (> 0 km).',
      circuitConfigured: 'Circuit renseigné',
      circuitFieldsRequired: 'Champs requis',
      unnamedTrackFallback: 'Circuit personnalisé',

      step2Title: '02. Durée de la course',
      step2Subtitle: 'Définissez le format de la course en temps ou en nombre de tours.',
      modeDuration: 'À la durée',
      modeLaps: 'En tours',
      durationInputLabel: 'Durée (ex. 90, 1h30, 2h)',
      durationHelp: 'Fin au premier passage de ligne après la durée écoulée.',
      parsedDurationPrefix: 'Durée retenue :',
      lapsInputLabel: 'Nombre de tours',
      totalDistanceLabel: 'Distance totale',
      estimatedLapsLabel: 'Tours estimés (meilleur rythme)',

      step3Title: '03. Passage au stand et carburant',
      step3Subtitle: 'Paramètres de voie des stands et de consommation (réservoir normalisé à 100 L).',
      pitTransitLabel: 'Temps de passage au stand (s)',
      tireChangeLabel: 'Temps additionnel pneus (s)',
      refuelRateLabel: 'Vitesse de remplissage (L/s)',
      fuelPerLapLabel: 'Consommation / tour (L)',
      fuelMarginLabel: 'Marge de sécurité (tours)',
      tankCapacityNote: 'Réservoir plein au départ (100 L)',
      maxFuelStintLabel: 'Autonomie max par plein',
      fullTankRefuelTimeLabel: 'Plein complet (100 L)',

      step4Title: '04. Performances des pneus',
      step4Subtitle: 'Temps au tour moyen (ex. 1:48.500 ou 108.5), usure max et gommes obligatoires.',
      activeCol: 'Dispo',
      compoundCol: 'Gomme',
      lapTimeCol: 'Temps / tour',
      maxLapsCol: 'Tours max / train',
      mandatoryCol: 'Obligatoire',
      stintWindowCol: 'Relais possible',
      tireTimeHint: 'Un train de pneus peut couvrir plusieurs relais tant que le total cumulé reste ≤ tours max.',
      compounds: {
        soft: { name: 'Tendre (Soft)', short: 'S' },
        medium: { name: 'Moyen (Medium)', short: 'M' },
        hard: { name: 'Dur (Hard)', short: 'H' },
        intermediate: { name: 'Intermédiaire', short: 'I' },
        wet: { name: 'Pluie', short: 'W' },
      },

      step5Title: '05. Stratégie et comparaison',
      step5Subtitle: 'Plan optimal calculé automatiquement, entièrement modifiable avec contrôles en direct.',
      applyOptimalBtn: 'Appliquer l’optimal',
      addStintBtn: 'Ajouter un arrêt',
      printPdfBtn: 'Imprimer / PDF',
      removeStintBtn: 'Supprimer',
      totalTimeLabel: 'Temps total',
      totalLapsLabel: 'Tours couverts',
      pitStopsLabel: 'Arrêts',
      totalFuelAddedLabel: 'Essence ajoutée',
      deltaVsOptimalLabel: 'Écart vs optimal',
      identicalToOptimal: 'Identique à l’optimal',
      fasterBy: 'plus rapide',
      slowerBy: 'plus lent',
      moreLaps: 'tour(s) en plus',
      fewerLaps: 'tour(s) en moins',
      stintTimelineTitle: 'Chronologie des relais',
      stintCol: 'Relais',
      tireCol: 'Gomme',
      lapsCol: 'Tours',
      tireActionCol: 'Train de pneus',
      tireWearCol: 'Usure cumulée',
      fuelInOutCol: 'Carburant (Dép. → Arr.)',
      pitAddedCol: 'Appoint',
      pitTimeCol: 'Durée stand',
      stintTimeCol: 'Durée relais',
      newTireSet: 'Pneus neufs',
      keepTireSet: 'Conserver le train',
      raceStartLabel: 'Départ (100 L)',
      alternativesTitle: 'Comparaison par nombre d’arrêts',
      loadPlanBtn: 'Charger',
      activeLabel: 'Actif',
      noValidStrategy: 'Aucune stratégie valide trouvée avec ces contraintes. Vérifiez les pneus disponibles, les gommes obligatoires et l’autonomie.',
      validationOk: 'Plan conforme à toutes les contraintes',
      pitShort: 'stands',
      usedShort: 'utilisés',
      perLapShort: '/tour',
      bestLabel: 'Optimal',
      optimalShort: 'Opt',
      copyHeader: 'Stratégie GT7 Endurance',
      assumptionsTitle: 'Hypothèses du modèle de calcul',
      assumptionsList: [
        'Départ réservoir plein (100 L) ; ravitaillement limité au nécessaire jusqu’au relais suivant plus la marge configurée.',
        'Durée d’arrêt = temps de passage + changement de pneus éventuel + durée de ravitaillement.',
        'Temps au tour constant par gomme (sans effet du poids d’essence ni dégradation progressive).',
        'Un train de pneus conservé sans changement cumule les tours entre relais jusqu’à son maximum.',
        'En mode durée, la course se termine au premier passage sur la ligne après la fin du chrono.',
      ],
      stopsWord: function (c) {
        return c <= 1 ? c + ' arrêt' : c + ' arrêts';
      },
      lapsWord: function (c) {
        return c <= 1 ? c + ' tour' : c + ' tours';
      },
      issueMessages: {
        NO_ACTIVE_TIRES: function () {
          return 'Activez au moins une gomme avec un temps au tour valide.';
        },
        INVALID_FUEL_PER_LAP: function () {
          return 'La consommation par tour doit être supérieure à 0 L et ≤ 100 L.';
        },
        STINT_EXCEEDS_TANK: function (stint, used) {
          return 'Relais ' + stint + ' : consommation (' + used + ' L) supérieure au réservoir de 100 L.';
        },
        TIRE_SET_EXCEEDED: function (stint, wear, max) {
          return 'Relais ' + stint + ' : usure cumulée (' + wear + ' tours) supérieure au max du train (' + max + ' tours).';
        },
        MANDATORY_COMPOUND_MISSING: function (compound) {
          return 'Gomme obligatoire non utilisée : ' + compound + '.';
        },
        COMPOUND_DISABLED: function (stint, compound) {
          return 'Relais ' + stint + ' : la gomme ' + compound + ' est désactivée ou invalide.';
        },
        LAPS_MISMATCH: function (actual, expected) {
          return 'Total de ' + actual + ' tours au lieu des ' + expected + ' tours requis.';
        },
        DURATION_NOT_REACHED: function (actual, target) {
          return 'Durée couverte (' + actual + ') inférieure à la durée de course (' + target + ').';
        },
        DURATION_OVERSHOT_EXTRA_LAP: function (stint) {
          return 'Relais ' + stint + ' : la course s’est déjà terminée avant la fin de ce relais (passage de ligne dépassé).';
        },
        ZERO_LAPS_STINT: function (stint) {
          return 'Relais ' + stint + ' : doit comporter au moins 1 tour.';
        },
      },
    },

    en: {
      appTitle: 'GT7 Endurance',
      documentTitle: 'GT7 Endurance Strategy',
      navCircuit: 'Circuit',
      navRace: 'Race',
      navPitFuel: 'Pit & Fuel',
      navTires: 'Tires',
      navStrategy: 'Strategy',
      stepsNavAria: 'Steps',
      copySummaryBtn: 'Copy Plan',
      copiedFeedback: 'Copied',
      resetDefaultsBtn: 'Reset',
      workspaceLead: 'Gran Turismo 7 Endurance Strategy',
      workspaceSub: 'Pit stop, fuel, and tire stint planner · Automatic local browser persistence',
      languageLabel: 'Language',
      themeLabel: 'Theme',
      themeDark: 'Dark',
      themeLight: 'Light',

      step1Title: '01. Circuit',
      step1Subtitle: 'Enter the race track name and its lap length.',
      trackNameLabel: 'Race track name',
      trackNamePlaceholder: 'e.g. Circuit de Spa-Francorchamps',
      trackLengthLabel: 'Track length',
      trackLengthPlaceholder: 'e.g. 7.004',
      trackLengthUnit: 'km',
      trackNameRequired: 'Please enter the race track name.',
      trackLengthRequired: 'Please enter a valid track length (> 0 km).',
      circuitConfigured: 'Circuit configured',
      circuitFieldsRequired: 'Required fields',
      unnamedTrackFallback: 'Custom Circuit',

      step2Title: '02. Race Duration',
      step2Subtitle: 'Set the race format either by clock duration or exact lap count.',
      modeDuration: 'By Duration',
      modeLaps: 'By Laps',
      durationInputLabel: 'Duration (e.g. 90, 1h30, 2h)',
      durationHelp: 'Ends at the first start/finish line crossing after time expires.',
      parsedDurationPrefix: 'Parsed duration:',
      lapsInputLabel: 'Total laps',
      totalDistanceLabel: 'Total distance',
      estimatedLapsLabel: 'Estimated laps (best pace)',

      step3Title: '03. Pit Stop & Fuel',
      step3Subtitle: 'Pit lane penalties and consumption based on a normalized 100 L fuel tank.',
      pitTransitLabel: 'Pit lane transit time (s)',
      tireChangeLabel: 'Additional tire change time (s)',
      refuelRateLabel: 'Refuel speed (L/s)',
      fuelPerLapLabel: 'Fuel consumption / lap (L)',
      fuelMarginLabel: 'Safety margin (laps)',
      tankCapacityNote: 'Race starts with a full tank (100 L)',
      maxFuelStintLabel: 'Max laps per full tank',
      fullTankRefuelTimeLabel: 'Full refuel (100 L)',

      step4Title: '04. Tire Performance',
      step4Subtitle: 'Average lap time (e.g. 1:48.500 or 108.5), max cumulative laps, and mandatory flags.',
      activeCol: 'Active',
      compoundCol: 'Compound',
      lapTimeCol: 'Avg lap time',
      maxLapsCol: 'Max laps / set',
      mandatoryCol: 'Mandatory',
      stintWindowCol: 'Usable window',
      tireTimeHint: 'Keeping tires during a fuel-only stop saves tire change time; cumulative laps must stay ≤ max laps.',
      compounds: {
        soft: { name: 'Soft', short: 'S' },
        medium: { name: 'Medium', short: 'M' },
        hard: { name: 'Hard', short: 'H' },
        intermediate: { name: 'Intermediate', short: 'I' },
        wet: { name: 'Heavy Wet', short: 'W' },
      },

      step5Title: '05. Strategy & Comparison',
      step5Subtitle: 'Optimal race plan computed automatically, fully editable with live telemetry validation.',
      applyOptimalBtn: 'Apply Optimal',
      addStintBtn: 'Add Pit Stop',
      printPdfBtn: 'Print / PDF',
      removeStintBtn: 'Remove',
      totalTimeLabel: 'Total time',
      totalLapsLabel: 'Laps covered',
      pitStopsLabel: 'Pit stops',
      totalFuelAddedLabel: 'Fuel added',
      deltaVsOptimalLabel: 'Delta vs optimal',
      identicalToOptimal: 'Matches optimal',
      fasterBy: 'faster',
      slowerBy: 'slower',
      moreLaps: 'extra lap(s)',
      fewerLaps: 'fewer lap(s)',
      stintTimelineTitle: 'Stint Timeline',
      stintCol: 'Stint',
      tireCol: 'Compound',
      lapsCol: 'Laps',
      tireActionCol: 'Tire Action',
      tireWearCol: 'Cumulative Wear',
      fuelInOutCol: 'Fuel (Start → End)',
      pitAddedCol: 'Refuel',
      pitTimeCol: 'Pit Time',
      stintTimeCol: 'Stint Time',
      newTireSet: 'Fresh set',
      keepTireSet: 'Keep tires',
      raceStartLabel: 'Grid Start (100 L)',
      alternativesTitle: 'Comparison by Pit Stop Count',
      loadPlanBtn: 'Load',
      activeLabel: 'Active',
      noValidStrategy: 'No valid strategy found under current constraints. Check active compounds, mandatory tires, and fuel tank range.',
      validationOk: 'Plan satisfies all race constraints',
      pitShort: 'pit',
      usedShort: 'used',
      perLapShort: '/lap',
      bestLabel: 'Best',
      optimalShort: 'Opt',
      copyHeader: 'GT7 Endurance Strategy',
      assumptionsTitle: 'Calculation Model Assumptions',
      assumptionsList: [
        'Race starts on a full 100 L tank; refueling adds only what is required until the next stop plus the configured margin.',
        'Pit stop duration = pit transit time + optional tire change time + refuel duration.',
        'Constant lap times per compound (no fuel weight effect or progressive tire degradation).',
        'Keeping a tire set across a fuel-only stop accumulates laps up to the compound max laps.',
        'Timed races end on the first finish-line crossing at or after the clock reaches zero.',
      ],
      stopsWord: function (c) {
        return c === 1 ? '1 stop' : c + ' stops';
      },
      lapsWord: function (c) {
        return c === 1 ? '1 lap' : c + ' laps';
      },
      issueMessages: {
        NO_ACTIVE_TIRES: function () {
          return 'Enable at least one tire compound with a valid lap time.';
        },
        INVALID_FUEL_PER_LAP: function () {
          return 'Fuel consumption per lap must be > 0 L and ≤ 100 L.';
        },
        STINT_EXCEEDS_TANK: function (stint, used) {
          return 'Stint ' + stint + ': fuel consumption (' + used + ' L) exceeds the 100 L tank.';
        },
        TIRE_SET_EXCEEDED: function (stint, wear, max) {
          return 'Stint ' + stint + ': cumulative tire wear (' + wear + ' laps) exceeds set limit (' + max + ' laps).';
        },
        MANDATORY_COMPOUND_MISSING: function (compound) {
          return 'Mandatory compound not used: ' + compound + '.';
        },
        COMPOUND_DISABLED: function (stint, compound) {
          return 'Stint ' + stint + ': compound ' + compound + ' is disabled or has an invalid lap time.';
        },
        LAPS_MISMATCH: function (actual, expected) {
          return 'Plan covers ' + actual + ' laps instead of the required ' + expected + ' laps.';
        },
        DURATION_NOT_REACHED: function (actual, target) {
          return 'Covered duration (' + actual + ') has not reached race target (' + target + ').';
        },
        DURATION_OVERSHOT_EXTRA_LAP: function (stint) {
          return 'Stint ' + stint + ': race clock already expired on an earlier lap of this stint.';
        },
        ZERO_LAPS_STINT: function (stint) {
          return 'Stint ' + stint + ': must have at least 1 lap.';
        },
      },
    },
  };

  return { TRANSLATIONS: TRANSLATIONS };
});
