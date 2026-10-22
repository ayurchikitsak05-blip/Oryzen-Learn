/** R1 Study Coach — local library + persist. No paid model on read. */

export const COACH_STORAGE_KEY = "oryzen_study_coach_v1";
export const COACH_RECENT_LIMIT = 40;
export const EXAM_APPROACHING_DAYS = 14;
export const BREAK_SNOOZE_MINUTES = 25;

export const COACH_VOICE_IDS = [
  "courage_calm",
  "challenge_mastery",
  "momentum_action",
  "balanced_support",
] as const;

export type CoachVoiceId = (typeof COACH_VOICE_IDS)[number];

export const COACH_TRIGGERS = [
  "dashboard_open",
  "overwhelmed",
  "sessions_missed",
  "low_quiz_score",
  "repeated_postpone",
  "hard_chapter_done",
  "exam_approaching",
  "over_planned_hours",
] as const;

export type CoachTrigger = (typeof COACH_TRIGGERS)[number];

export const COACH_ACTIONS = [
  "start_studying",
  "simplify_day",
  "replan",
  "revise_weak",
  "take_break",
  "continue_roadmap",
  "none",
] as const;

export type CoachActionId = (typeof COACH_ACTIONS)[number];

export type CoachAgeSuitability = "all" | "teen" | "young_adult";

export type CoachFrequency = "off" | "gentle" | "regular" | "frequent";

export type CoachTone = "steady" | "precise" | "brief" | "warm";

export interface CoachMessage {
  id: string;
  style: CoachVoiceId;
  trigger: CoachTrigger;
  ageSuitability: CoachAgeSuitability;
  tone: CoachTone;
  text: string;
  recommendedAction: CoachActionId;
}

export interface CoachFeedbackCount {
  helpful: number;
  skip: number;
}

export interface CoachPrefs {
  version: 1;
  frequency: CoachFrequency;
  recentIds: string[];
  feedback: Record<string, CoachFeedbackCount>;
  shownByKey: Record<string, string>;
  snoozeUntil?: string;
  focusedSessionId?: string;
  inProgressSessionId?: string;
  breakNotedAt?: string;
  postponeLog: string[];
  explicitOverwhelmedAt?: string;
  studyStartedAt?: string;
  lastActionAt?: string;
  lastAction?: CoachActionId;
}

export const DEFAULT_COACH_PREFS: CoachPrefs = {
  version: 1,
  frequency: "regular",
  recentIds: [],
  feedback: {},
  shownByKey: {},
  postponeLog: [],
};

export const COACH_VOICE_META: Record<
  CoachVoiceId,
  { label: string; hint: string; tone: CoachTone; rhythmStyle: "calm" | "mastery" | "momentum" | "balanced" }
> = {
  courage_calm: {
    label: "Courage & Calm",
    hint: "Reassurance, a quieter start, and one kind next step.",
    tone: "steady",
    rhythmStyle: "calm",
  },
  challenge_mastery: {
    label: "Challenge & Mastery",
    hint: "Ambition and craft. High standard, no humiliation.",
    tone: "precise",
    rhythmStyle: "mastery",
  },
  momentum_action: {
    label: "Momentum & Action",
    hint: "Small steps when starting feels heavy.",
    tone: "brief",
    rhythmStyle: "momentum",
  },
  balanced_support: {
    label: "Balanced Support",
    hint: "General encouragement and one clear next action.",
    tone: "warm",
    rhythmStyle: "balanced",
  },
};

export const ACTION_LABELS: Record<CoachActionId, string> = {
  start_studying: "Start Studying",
  simplify_day: "Simplify My Day",
  replan: "Replan My Studies",
  revise_weak: "Revise Weak Concepts",
  take_break: "Take a Break",
  continue_roadmap: "Continue My Roadmap",
  none: "Got it",
};

export const GENTLE_TRIGGERS: CoachTrigger[] = [
  "overwhelmed",
  "sessions_missed",
  "low_quiz_score",
  "repeated_postpone",
  "exam_approaching",
  "over_planned_hours",
];

export const TRIGGER_PRIORITY: CoachTrigger[] = [
  "overwhelmed",
  "over_planned_hours",
  "exam_approaching",
  "sessions_missed",
  "repeated_postpone",
  "low_quiz_score",
  "hard_chapter_done",
  "dashboard_open",
];
