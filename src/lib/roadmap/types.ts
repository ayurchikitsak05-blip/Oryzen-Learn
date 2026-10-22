export type PrepLevel = "just_starting" | "some_progress" | "revision_ready";

export type SessionKind = "study" | "revision" | "practice_test" | "break" | "buffer";

export type DayKind = "study" | "buffer" | "revision";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RoadmapChapter {
  id: string;
  name: string;
  difficulty: number;
  remainingMinutes: number;
  completed?: boolean;
}

export interface RoadmapSubject {
  id: string;
  name: string;
  examImportance: number;
  chapters: RoadmapChapter[];
}

export interface RoadmapCommitment {
  id: string;
  label: string;
  weekday: Weekday;
  startMinutes: number;
  endMinutes: number;
}

export interface ClockWindow {
  startMinutes: number;
  endMinutes: number;
}

/**
 * Reserved for a later Study Rhythm theme + coach.
 * Phase 3A stores the shape only — no four-theme UI and no coach script.
 */
export interface StudyRhythmHook {
  preferredThemeId?: "vata" | "pitta" | "kapha" | "dwandwaja";
  coachSlot?: "morning" | "midday" | "evening" | "recovery";
  focusMinutes?: number;
  breakMinutes?: number;
}

export interface RoadmapIntake {
  examDate: string;
  subjects: RoadmapSubject[];
  prepLevel: PrepLevel;
  dailyHours: number;
  commitments: RoadmapCommitment[];
  preferredStudyHours: ClockWindow;
  sleepWindow: ClockWindow;
  bufferWeekday: Weekday;
  focusMinutes: number;
  breakMinutes: number;
  practiceTestMinutes: number;
  revisionRatio: number;
  finalRevisionDays: number;
  rhythm?: StudyRhythmHook;
}

export interface RoadmapSession {
  id: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
  minutes: number;
  kind: SessionKind;
  subjectId?: string;
  subjectName?: string;
  chapterId?: string;
  chapterName?: string;
  title: string;
}

export interface RoadmapDayPlan {
  date: string;
  kind: DayKind;
  availableStudyMinutes: number;
  sessions: RoadmapSession[];
}

export interface RoadmapWeekPlan {
  id: string;
  startDate: string;
  endDate: string;
  days: RoadmapDayPlan[];
}

export interface RoadmapMonthPlan {
  id: string;
  yearMonth: string;
  days: RoadmapDayPlan[];
}

export interface UnscheduledChapter {
  chapterId: string;
  subjectId: string;
  subjectName: string;
  chapterName: string;
  leftoverMinutes: number;
}

export interface OverflowWarning {
  fits: boolean;
  neededStudyMinutes: number;
  availableStudyMinutes: number;
  unscheduledMinutes: number;
  unscheduledChapters: UnscheduledChapter[];
  message: string;
}

export interface RoadmapPlan {
  generatedAt: string;
  today: string;
  examDate: string;
  days: RoadmapDayPlan[];
  weeks: RoadmapWeekPlan[];
  months: RoadmapMonthPlan[];
  overflow: OverflowWarning;
}

export interface SessionCompletion {
  completedAt: string;
}

export interface RoadmapRecord {
  version: 1;
  id: string;
  userId: string;
  intake: RoadmapIntake;
  plan: RoadmapPlan;
  completions: Record<string, SessionCompletion>;
  updatedAt: string;
}

export interface ReplanRequest {
  today: string;
  missedDates: string[];
  intakeOverrides?: Partial<
    Pick<
      RoadmapIntake,
      | "examDate"
      | "dailyHours"
      | "commitments"
      | "preferredStudyHours"
      | "sleepWindow"
      | "prepLevel"
    >
  >;
  unfinishedChapterIds?: string[];
}

export interface ReplanProposal {
  proposed: RoadmapRecord;
  missedDates: string[];
  recoveredMinutes: number;
  sessionCountBefore: number;
  sessionCountAfter: number;
  overflow: OverflowWarning;
  summary: string;
}

export interface RoadmapStudyLinks {
  reader: string;
  notes: string;
  testMe: string;
  weakConcepts: string;
}

export interface TimetableEditResult {
  record: RoadmapRecord;
  warning: string | null;
}
