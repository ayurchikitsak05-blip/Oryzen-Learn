export const SPRINT_STORAGE_KEY = "oryzen_study_sprint_v1";
export const SPRINT_DURATIONS = [15, 25, 45, 60] as const;
export const SPRINT_STATUSES = ["planned", "running", "paused", "break", "completed"] as const;

export type SprintDuration = (typeof SPRINT_DURATIONS)[number];
export type SprintStatus = (typeof SPRINT_STATUSES)[number];
export type SprintRhythm = "spark" | "laser" | "anchor" | "custom";

export interface SprintSession {
  id: string;
  goal: string;
  subject: string;
  topic: string;
  documentId: string;
  documentTitle: string;
  chapter: string;
  durationMinutes: SprintDuration;
  breakMinutes: number;
  dailyTargetMinutes: number;
  status: SprintStatus;
  elapsedMs: number;
  startedAt: string | null;
  completedAt: string | null;
  date: string;
  quizLinked: boolean;
  notesLinked: boolean;
}

export interface SprintStore {
  version: 1;
  sessions: SprintSession[];
  dailyTargetMinutes: number;
  preferredDuration: SprintDuration;
  preferredBreakMinutes: number;
  rhythm: SprintRhythm;
}

export const DEFAULT_SPRINT_STORE: SprintStore = {
  version: 1,
  sessions: [],
  dailyTargetMinutes: 90,
  preferredDuration: 25,
  preferredBreakMinutes: 5,
  rhythm: "custom",
};
