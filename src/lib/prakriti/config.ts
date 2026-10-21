/**
 * Layer 0+: Prakriti & Adaptive Cognitive Engine Configuration
 * Implements the 70/30 (Reader UI & AI Format) and 50/50 (Lifestyle & Break Remedies)
 * weighted formula, Single vs. Dwandwaja (<= 15% threshold) classification,
 * modern student-friendly terminology with classical Ayurvedic terms in parentheses,
 * and Prakriti study configurations (Vata, Pitta, Kapha).
 */

export type Dosha = "Vata" | "Pitta" | "Kapha";

export type PrakritiClassification =
  | "Vata"
  | "Pitta"
  | "Kapha"
  | "Vata-Pitta"
  | "Pitta-Vata"
  | "Pitta-Kapha"
  | "Kapha-Pitta"
  | "Vata-Kapha"
  | "Kapha-Vata";

export type CanonicalPrakritiKey =
  | "Vata"
  | "Pitta"
  | "Kapha"
  | "Vata-Pitta"
  | "Pitta-Kapha"
  | "Vata-Kapha";

export type HighlightLensType =
  | "ayurvedic"
  | "illustrative"
  | "high_yield_revision"
  | "save_passage"
  | "test_me"
  | "explain"
  | "story";

/** Profile may recommend these first; the student can still pick any mode. */
export function recommendedStudyLenses(dosha: Dosha): HighlightLensType[] {
  if (dosha === "Vata") return ["story", "illustrative"];
  if (dosha === "Pitta") return ["high_yield_revision", "explain"];
  return ["test_me", "explain"];
}

/**
 * Modern student-friendly profile labels with classical Ayurvedic terms in parentheses.
 */
export const PRAKRITI_PROFILE_LABELS = {
  Vata: "The Spark & Sprint Profile (Vata)",
  Pitta: "The Laser & Logic Profile (Pitta)",
  Kapha: "The Anchor & Endurance Profile (Kapha)",
  Dwandwaja: "The Hybrid Dynamic Profile (Mixed Dosha)",
} as const;

/**
 * Modern student-friendly cognitive metric labels with classical terms in parentheses.
 */
export const COGNITIVE_METRIC_LABELS = {
  dhee: {
    shortLabel: "Quick-Take Speed",
    fullLabel: "Quick-Take Speed (Grasping / Dhee)",
    classicalTerm: "Dhee",
  },
  dhriti: {
    shortLabel: "Focus Stamina",
    fullLabel: "Focus Stamina (Focus Stability / Dhriti)",
    classicalTerm: "Dhriti",
  },
  smriti: {
    shortLabel: "Recall Power",
    fullLabel: "Recall Power (Retention / Smriti)",
    classicalTerm: "Smriti",
  },
  dinacharya: {
    shortLabel: "Recovery & Flow Rituals",
    fullLabel: "Recovery & Flow Rituals (Dinacharya)",
    classicalTerm: "Dinacharya",
  },
} as const;

export interface DoshaScores {
  Vata: number;
  Pitta: number;
  Kapha: number;
}

export interface PrakritiThemePalette {
  cssVariable: "--theme-vata" | "--theme-pitta" | "--theme-kapha";
  name: string;
  backgroundHex: "#FBF5E8" | "#F2F6F3" | "#FFFDF9";
  surfaceHex: string;
  textPrimaryHex: string;
  textSecondaryHex: string;
  accentHex: string;
  borderHex: string;
  canvasGradientCss: string;
}

export interface PomodoroCadence {
  studySprintMinutes: number;
  breakMinutes: number;
  microInteractionIntervalMinutes: number | null;
}

export interface DinacharyaPrescription {
  pranayama: string;
  hydration: string;
  ocularOrPhysicalProtocol: string;
  summary: string;
}

export interface DoshaStudyPreset {
  dosha: Dosha;
  modernProfileLabel: string;
  sanskritTrait: string;
  cognitiveSummary: string;
  theme: PrakritiThemePalette;
  pomodoro: PomodoroCadence;
  readerLayoutMode:
    | "bite_sized_focus_card"
    | "chapter_hierarchy_mastery_tree"
    | "tap_to_reveal_accordions";
  readerLayoutLabel: string;
  defaultHighlightLens: HighlightLensType;
  aiPedagogyDefaults: string[];
  dinacharyaBreak: DinacharyaPrescription;
}

export interface CalculatedPrakritiProfile {
  /** Normalized (0-100) physical Prakriti input scores */
  basicScoresNormalized: DoshaScores;
  /** Normalized (0-100) reading & cognitive input scores */
  readingScoresNormalized: DoshaScores;
  /** 70% Reading + 30% Basic Prakriti composite scores */
  readerUiScores: DoshaScores;
  /** 50% Reading + 50% Basic Prakriti composite scores */
  lifestyleBreakScores: DoshaScores;
  /** True when top two Reader UI scores are within 15% (<= 15.0 percentage points) */
  isDwandwaja: boolean;
  /** Difference between top score and second score in Reader UI composite */
  topTwoMargin: number;
  /** Exact ordered classification (e.g., "Vata", "Pitta-Vata", "Vata-Pitta") */
  classification: PrakritiClassification;
  /** Canonical Dual-Dosha or Single-Dosha key ("Vata-Pitta", "Pitta-Kapha", "Vata-Kapha", etc.) */
  canonicalType: CanonicalPrakritiKey;
  /** Modern student-friendly profile title with classical term in brackets */
  displayProfileTitle: string;
  /** Primary Dosha governing AI explanation format & reading layout */
  primaryDosha: Dosha;
  /** Secondary Dosha (null if Single Dosha dominant; set if Dwandwaja) */
  secondaryDosha: Dosha | null;
  /** Dominant Dosha from the 50/50 lifestyle & break score */
  lifestyleDominantDosha: Dosha;
  /** Effective study configuration resolved for this student */
  activeConfiguration: {
    theme: PrakritiThemePalette;
    pomodoro: PomodoroCadence;
    readerLayoutMode: DoshaStudyPreset["readerLayoutMode"];
    readerLayoutLabel: string;
    defaultHighlightLens: HighlightLensType;
    aiPedagogyDefaults: string[];
    dinacharyaBreak: DinacharyaPrescription;
    governanceNote: string;
  };
}

/**
 * Threshold in percentage points (0-100 scale) for Single vs. Dwandwaja classification.
 * Single Dosha if (topScore - secondScore) > 15.
 * Dual-Dosha (Dwandwaja) if (topScore - secondScore) <= 15.
 */
export const DWANDWAJA_THRESHOLD_PERCENT = 15;

export const READER_UI_WEIGHTS = {
  reading: 0.7,
  basic: 0.3,
} as const;

export const LIFESTYLE_BREAK_WEIGHTS = {
  reading: 0.5,
  basic: 0.5,
} as const;

export const DOSHA_STUDY_PRESETS: Record<Dosha, DoshaStudyPreset> = {
  Vata: {
    dosha: "Vata",
    modernProfileLabel: PRAKRITI_PROFILE_LABELS.Vata,
    sanskritTrait: "Quick-Take Speed / Rapid Skimmer (Shighra-grahi / Alpa-smriti)",
    cognitiveSummary:
      "You grasp ideas quickly. Short study bursts and a quick recall check help those ideas stay with you.",
    theme: {
      cssVariable: "--theme-vata",
      name: "Warm Parchment",
      backgroundHex: "#FBF5E8",
      surfaceHex: "#F3E8D2",
      textPrimaryHex: "#2C221E",
      textSecondaryHex: "#645147",
      accentHex: "#C86428",
      borderHex: "#E2D2B5",
      canvasGradientCss:
        "radial-gradient(circle at top left, #FFFDF8 0%, #FBF5E8 55%, #F3E8D2 100%)",
    },
    pomodoro: {
      studySprintMinutes: 22,
      breakMinutes: 5,
      microInteractionIntervalMinutes: null,
    },
    readerLayoutMode: "bite_sized_focus_card",
    readerLayoutLabel: "Bite-Sized Focus Card View (1–2 paragraphs isolated)",
    defaultHighlightLens: "illustrative",
    aiPedagogyDefaults: [
      "Story Analogies",
      "Visual Mind-Maps",
      "Audio TTS Summary",
      "24h / 72h Spaced Flashcards",
    ],
    dinacharyaBreak: {
      pranayama: "Nadi Shodhana / Bhramari Pranayama",
      hydration: "Warm plain or cumin-infused water",
      ocularOrPhysicalProtocol:
        "5-minute grounding stillness with gentle shoulder release",
      summary:
        "5-min grounding break: Nadi Shodhana / Bhramari breathwork + warm water to stabilize Prana Vata.",
    },
  },
  Pitta: {
    dosha: "Pitta",
    modernProfileLabel: PRAKRITI_PROFILE_LABELS.Pitta,
    sanskritTrait: "Precision Analyst / Deep Lock-In (Tikshna-buddhi / Medhavi)",
    cognitiveSummary:
      "You work best in long, precise stretches. Structured outlines and a calmer screen help you stay sharp without burning out.",
    theme: {
      cssVariable: "--theme-pitta",
      name: "Cool Anti-Glare Sage-Ivory",
      backgroundHex: "#F2F6F3",
      surfaceHex: "#E4EDE7",
      textPrimaryHex: "#1C2826",
      textSecondaryHex: "#465C56",
      accentHex: "#2E6F5E",
      borderHex: "#C7D8CE",
      canvasGradientCss:
        "radial-gradient(circle at top left, #F9FCFA 0%, #F2F6F3 55%, #E4EDE7 100%)",
    },
    pomodoro: {
      studySprintMinutes: 40,
      breakMinutes: 8,
      microInteractionIntervalMinutes: null,
    },
    readerLayoutMode: "chapter_hierarchy_mastery_tree",
    readerLayoutLabel: "Permanent Chapter Hierarchy Tree + % Mastery Bar",
    defaultHighlightLens: "high_yield_revision",
    aiPedagogyDefaults: [
      "Differential Comparison Tables",
      "Mechanism Flowcharts",
      "Exact Page Citations",
    ],
    dinacharyaBreak: {
      pranayama: "Sheetali / Sheetkari Pranayama (Cooling Breath)",
      hydration: "Cool or room-temperature fennel (Mishreya) water",
      ocularOrPhysicalProtocol:
        "Chakshushya 20-ft distance gaze + gentle eye palming",
      summary:
        "8-min cooling break: Chakshushya 20-ft eye palming + Sheetali breath + cool fennel water.",
    },
  },
  Kapha: {
    dosha: "Kapha",
    modernProfileLabel: PRAKRITI_PROFILE_LABELS.Kapha,
    sanskritTrait: "Deep Marathoner / Vault Memory (Chira-grahi / Dridha-smriti)",
    cognitiveSummary:
      "You learn steadily and remember what you have truly worked through. Active check-ins keep the pace from becoming too quiet.",
    theme: {
      cssVariable: "--theme-kapha",
      name: "Bright Crisp High-Contrast Amber-White",
      backgroundHex: "#FFFDF9",
      surfaceHex: "#FEF6E4",
      textPrimaryHex: "#18181B",
      textSecondaryHex: "#4A463F",
      accentHex: "#D97706",
      borderHex: "#EEDBBD",
      canvasGradientCss:
        "radial-gradient(circle at top left, #FFFFFF 0%, #FFFDF9 55%, #FEF6E4 100%)",
    },
    pomodoro: {
      studySprintMinutes: 30,
      breakMinutes: 5,
      microInteractionIntervalMinutes: 15,
    },
    readerLayoutMode: "tap_to_reveal_accordions",
    readerLayoutLabel: "Tap-to-Reveal Interactive Accordions (15-min check-in)",
    defaultHighlightLens: "test_me",
    aiPedagogyDefaults: [
      "Socratic Question-First Prompts",
      "Worked-Example Challenges",
      "10-min Video Quiz Checkpoints",
    ],
    dinacharyaBreak: {
      pranayama: "Kapalabhati / Bhastrika (Energizing Breath)",
      hydration: "Warm ginger (Shunthi) or Tulsi water",
      ocularOrPhysicalProtocol:
        "3-minute brisk stand, spinal twist, and walking stretch",
      summary:
        "5-min movement break: 3-min brisk stand/walk stretch + Kapalabhati + warm ginger/tulsi water.",
    },
  },
};

/**
 * Returns the modern student-friendly profile title with classical terms in parentheses.
 */
export function getModernProfileDisplayTitle(
  primaryDosha: Dosha,
  isDwandwaja: boolean,
  classification?: PrakritiClassification
): string {
  if (isDwandwaja) {
    return classification
      ? `${PRAKRITI_PROFILE_LABELS.Dwandwaja} [${classification}]`
      : PRAKRITI_PROFILE_LABELS.Dwandwaja;
  }
  return PRAKRITI_PROFILE_LABELS[primaryDosha];
}

/**
 * Normalizes raw Dosha scores so that Vata + Pitta + Kapha = 100.
 * If all inputs are 0, returns equal 33.33% distribution.
 */
export function normalizeDoshaScores(raw: DoshaScores): DoshaScores {
  const v = Math.max(0, raw.Vata);
  const p = Math.max(0, raw.Pitta);
  const k = Math.max(0, raw.Kapha);
  const total = v + p + k;

  if (total === 0) {
    return { Vata: 33.33, Pitta: 33.33, Kapha: 33.34 };
  }

  const vNorm = Number(((v / total) * 100).toFixed(2));
  const pNorm = Number(((p / total) * 100).toFixed(2));
  const kNorm = Number((100 - vNorm - pNorm).toFixed(2));

  return {
    Vata: vNorm,
    Pitta: pNorm,
    Kapha: kNorm,
  };
}

/**
 * Deterministic ordering of Doshas by score descending.
 * Tie-breaking order follows classical sequence: Vata -> Pitta -> Kapha.
 */
export function rankDoshas(
  scores: DoshaScores
): Array<{ dosha: Dosha; score: number }> {
  const priority: Record<Dosha, number> = { Vata: 3, Pitta: 2, Kapha: 1 };
  const entries: Array<{ dosha: Dosha; score: number }> = [
    { dosha: "Vata", score: scores.Vata },
    { dosha: "Pitta", score: scores.Pitta },
    { dosha: "Kapha", score: scores.Kapha },
  ];

  return entries.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return priority[b.dosha] - priority[a.dosha];
  });
}

/**
 * Maps a primary and optional secondary Dosha to the canonical Prakriti key
 * specified in docs/01_PRAKRITI_ENGINE_SPEC.md.
 */
export function resolveCanonicalPrakritiKey(
  primary: Dosha,
  secondary: Dosha | null
): CanonicalPrakritiKey {
  if (!secondary) {
    return primary;
  }
  const pair = new Set<Dosha>([primary, secondary]);
  if (pair.has("Vata") && pair.has("Pitta")) {
    return "Vata-Pitta";
  }
  if (pair.has("Pitta") && pair.has("Kapha")) {
    return "Pitta-Kapha";
  }
  return "Vata-Kapha";
}

/**
 * Computes the complete Prakriti Cognitive & Lifestyle Profile from:
 * - basicScores: Physical Prakriti Questionnaire scores (Vata, Pitta, Kapha)
 * - readingScores: Reading & Cognitive Questionnaire scores (Vata, Pitta, Kapha)
 */
export function calculatePrakritiProfile(
  basicScores: DoshaScores,
  readingScores: DoshaScores
): CalculatedPrakritiProfile {
  const basicNorm = normalizeDoshaScores(basicScores);
  const readingNorm = normalizeDoshaScores(readingScores);

  const readerUiScores: DoshaScores = {
    Vata: Number(
      (
        READER_UI_WEIGHTS.reading * readingNorm.Vata +
        READER_UI_WEIGHTS.basic * basicNorm.Vata
      ).toFixed(2)
    ),
    Pitta: Number(
      (
        READER_UI_WEIGHTS.reading * readingNorm.Pitta +
        READER_UI_WEIGHTS.basic * basicNorm.Pitta
      ).toFixed(2)
    ),
    Kapha: Number(
      (
        READER_UI_WEIGHTS.reading * readingNorm.Kapha +
        READER_UI_WEIGHTS.basic * basicNorm.Kapha
      ).toFixed(2)
    ),
  };

  const lifestyleBreakScores: DoshaScores = {
    Vata: Number(
      (
        LIFESTYLE_BREAK_WEIGHTS.reading * readingNorm.Vata +
        LIFESTYLE_BREAK_WEIGHTS.basic * basicNorm.Vata
      ).toFixed(2)
    ),
    Pitta: Number(
      (
        LIFESTYLE_BREAK_WEIGHTS.reading * readingNorm.Pitta +
        LIFESTYLE_BREAK_WEIGHTS.basic * basicNorm.Pitta
      ).toFixed(2)
    ),
    Kapha: Number(
      (
        LIFESTYLE_BREAK_WEIGHTS.reading * readingNorm.Kapha +
        LIFESTYLE_BREAK_WEIGHTS.basic * basicNorm.Kapha
      ).toFixed(2)
    ),
  };

  const rankedUi = rankDoshas(readerUiScores);
  const rankedLifestyle = rankDoshas(lifestyleBreakScores);

  const primaryDosha = rankedUi[0].dosha;
  const secondUiDosha = rankedUi[1].dosha;
  const topTwoMargin = Number(
    (rankedUi[0].score - rankedUi[1].score).toFixed(2)
  );

  const isDwandwaja = topTwoMargin <= DWANDWAJA_THRESHOLD_PERCENT;
  const secondaryDosha: Dosha | null = isDwandwaja ? secondUiDosha : null;

  const classification: PrakritiClassification = isDwandwaja
    ? (`${primaryDosha}-${secondUiDosha}` as PrakritiClassification)
    : primaryDosha;

  const canonicalType = resolveCanonicalPrakritiKey(
    primaryDosha,
    secondaryDosha
  );

  const displayProfileTitle = getModernProfileDisplayTitle(
    primaryDosha,
    isDwandwaja,
    classification
  );

  const lifestyleDominantDosha = rankedLifestyle[0].dosha;

  const primaryPreset = DOSHA_STUDY_PRESETS[primaryDosha];

  const guardrailDosha: Dosha = secondaryDosha ?? lifestyleDominantDosha;
  const guardrailPreset = DOSHA_STUDY_PRESETS[guardrailDosha];

  const activeTheme = secondaryDosha
    ? DOSHA_STUDY_PRESETS[secondaryDosha].theme
    : primaryPreset.theme;

  const activePomodoro = secondaryDosha
    ? DOSHA_STUDY_PRESETS[secondaryDosha].pomodoro
    : primaryPreset.pomodoro;

  const activeDinacharya = guardrailPreset.dinacharyaBreak;

  const governanceNote = isDwandwaja
    ? `${PRAKRITI_PROFILE_LABELS.Dwandwaja} (${classification}): Primary ${primaryDosha} governs Quick-Take AI Pedagogy (${primaryPreset.defaultHighlightLens}) & Reader Card View; Secondary ${secondaryDosha} governs ${activeTheme.name} Theme (${activeTheme.backgroundHex}), ${activePomodoro.studySprintMinutes}/${activePomodoro.breakMinutes}m Focus Stamina Timer & Dinacharya Breaks.`
    : lifestyleDominantDosha !== primaryDosha
      ? `${primaryPreset.modernProfileLabel}: 70/30 cognitive score sets ${primaryDosha} Theme (${primaryPreset.theme.backgroundHex}) & AI Format, while 50/50 physical-cognitive balance incorporates ${lifestyleDominantDosha} Dinacharya break remedies.`
      : `${primaryPreset.modernProfileLabel}: Unified ${primaryDosha} Theme (${primaryPreset.theme.backgroundHex}), ${primaryPreset.pomodoro.studySprintMinutes}/${primaryPreset.pomodoro.breakMinutes}m Focus Sprint, and ${primaryDosha} AI Pedagogy.`;

  return {
    basicScoresNormalized: basicNorm,
    readingScoresNormalized: readingNorm,
    readerUiScores,
    lifestyleBreakScores,
    isDwandwaja,
    topTwoMargin,
    classification,
    canonicalType,
    displayProfileTitle,
    primaryDosha,
    secondaryDosha,
    lifestyleDominantDosha,
    activeConfiguration: {
      theme: activeTheme,
      pomodoro: activePomodoro,
      readerLayoutMode: primaryPreset.readerLayoutMode,
      readerLayoutLabel: primaryPreset.readerLayoutLabel,
      defaultHighlightLens: primaryPreset.defaultHighlightLens,
      aiPedagogyDefaults: primaryPreset.aiPedagogyDefaults,
      dinacharyaBreak: activeDinacharya,
      governanceNote,
    },
  };
}
