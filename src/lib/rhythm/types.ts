/** Study Rhythm chrome + future coach placeholders. No 420-message library in R0. */

export const RHYTHM_STORAGE_KEY = "oryzen_study_rhythm_v1";

export type ThemeId =
  | "classic"
  | "warm-grounded"
  | "cool-clear"
  | "fresh-energizing"
  | "grounded-clarity"
  | "clear-energy"
  | "warm-lift";

export type CoachStyleId = "calm" | "mastery" | "momentum" | "balanced" | "off";

export type AgeBand = "13-17" | "18-22" | "23+";

export type SuggestionState = "idle" | "applied" | "dismissed";

export interface ThemeTokens {
  bg: string;
  bgSecondary: string;
  card: string;
  beigePrimary: string;
  beigeSecondary: string;
  selected: string;
  heading: string;
  body: string;
  textSecondary: string;
  borders: string;
  accent: string;
  focusRing: string;
  danger: string;
  dangerBg: string;
  success: string;
  successBg: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  mood: string;
  group: "classic" | "primary" | "mixed";
  tokens: ThemeTokens;
}

export interface StudyRhythmPrefs {
  version: 1;
  themeId: ThemeId;
  coachStyle?: CoachStyleId;
  encouragementOff: boolean;
  pdfPaperOptIn?: boolean;
  ageBand?: AgeBand;
  suggestionState?: SuggestionState;
}

export const DEFAULT_RHYTHM_PREFS: StudyRhythmPrefs = {
  version: 1,
  themeId: "classic",
  coachStyle: "balanced",
  encouragementOff: false,
  pdfPaperOptIn: false,
  suggestionState: "idle",
};

export const LOCKED_PDF_PARCHMENT = {
  vata: { backgroundHex: "#FBF5E8", textPrimaryHex: "#2C221E" },
  pitta: { backgroundHex: "#F2F6F3", textPrimaryHex: "#1C2826" },
  kapha: { backgroundHex: "#FFFDF9", textPrimaryHex: "#18181B" },
} as const;

export const LOGO_CHIP_HEX = "#FFFDFC";
