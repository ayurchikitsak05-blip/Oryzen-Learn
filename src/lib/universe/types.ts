import type { CompanionCharacter, CompanionStyle } from "@/lib/companion/types";
import type { ThemeId } from "@/lib/rhythm/types";
import type { SprintDuration, SprintRhythm } from "@/lib/sprint/types";

export const UNIVERSE_STORAGE_KEY = "oryzen_study_universe_v1";
export const UNIVERSE_PLAN_STORAGE_KEY = "oryzen_study_universe_plan_v1";

export const UNIVERSE_PROFILE_IDS = [
  "vata",
  "pitta",
  "kapha",
  "vata_pitta",
  "pitta_kapha",
  "vata_kapha",
  "balanced",
] as const;

export const FOCUS_SOUND_IDS = ["silence", "rain", "water", "forest", "white"] as const;
export const REMINDER_TONES = ["gentle", "clear", "steady"] as const;
export const REMINDER_FREQUENCIES = ["frequent", "moderate", "sparse"] as const;
export const EXPLANATION_FORMATS = ["story", "structured", "steady", "mixed"] as const;
export const NOTE_STYLES = ["mind_map", "revision_table", "memory_aid", "mixed"] as const;
export const DAY_PLAN_KINDS = ["focus", "break", "revision", "quiz", "buffer"] as const;

export type UniverseProfileId = (typeof UNIVERSE_PROFILE_IDS)[number];
export type FocusSoundId = (typeof FOCUS_SOUND_IDS)[number];
export type ReminderTone = (typeof REMINDER_TONES)[number];
export type ReminderFrequency = (typeof REMINDER_FREQUENCIES)[number];
export type ExplanationFormat = (typeof EXPLANATION_FORMATS)[number];
export type UniverseNoteStyle = (typeof NOTE_STYLES)[number];
export type DayPlanKind = (typeof DAY_PLAN_KINDS)[number];
export type FocusSoundSource = "generated" | "licensed_file" | "external";

export interface UniversePreset {
  id: UniverseProfileId;
  prakritiLabel: string;
  modernName: string;
  tagline: string;
  themeId: ThemeId;
  sessionMinutes: SprintDuration;
  breakMinutes: number;
  reminderTone: ReminderTone;
  reminderFrequency: ReminderFrequency;
  explanationFormat: ExplanationFormat;
  storyEmphasis: number;
  illustrationEmphasis: number;
  diagramEmphasis: number;
  revisionEmphasis: number;
  noteStyle: UniverseNoteStyle;
  companionStyle: CompanionStyle;
  companionName: string;
  companionCharacter: CompanionCharacter;
  suggestedSound: FocusSoundId;
  sprintRhythm: SprintRhythm;
}

export interface UniversePrefs {
  version: 1;
  activated: boolean;
  customized: boolean;
  skipped: boolean;
  profileId: UniverseProfileId;
  themeId: ThemeId;
  sessionMinutes: SprintDuration;
  breakMinutes: number;
  reminderTone: ReminderTone;
  reminderFrequency: ReminderFrequency;
  explanationFormat: ExplanationFormat;
  storyEmphasis: number;
  illustrationEmphasis: number;
  diagramEmphasis: number;
  revisionEmphasis: number;
  noteStyle: UniverseNoteStyle;
  companionStyle: CompanionStyle;
  focusSound: FocusSoundId;
  focusVolume: number;
  focusMuted: boolean;
  soundEnabled: boolean;
  dailyGoalMinutes: number;
}

export interface DayPlanBlock {
  id: string;
  kind: DayPlanKind;
  label: string;
  minutes: number;
  startOffsetMinutes: number;
}

export interface DayPlan {
  date: string;
  dailyGoalMinutes: number;
  profileId: UniverseProfileId;
  blocks: DayPlanBlock[];
  nextSuggestedSession: string;
  missedRescheduled: boolean;
}

export const UNIVERSE_DISCLAIMER =
  "These are suggested preferences inspired by Prakriti. They are not a scientific measure of ability, attention, or what will work for you.";

export const DEFAULT_UNIVERSE_PREFS: UniversePrefs = {
  version: 1,
  activated: false,
  customized: false,
  skipped: false,
  profileId: "balanced",
  themeId: "classic",
  sessionMinutes: 25,
  breakMinutes: 5,
  reminderTone: "gentle",
  reminderFrequency: "moderate",
  explanationFormat: "mixed",
  storyEmphasis: 2,
  illustrationEmphasis: 2,
  diagramEmphasis: 2,
  revisionEmphasis: 2,
  noteStyle: "mixed",
  companionStyle: "buddy",
  focusSound: "silence",
  focusVolume: 0.35,
  focusMuted: false,
  soundEnabled: false,
  dailyGoalMinutes: 90,
};
