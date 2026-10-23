import { isThemeId } from "@/lib/rhythm/themes";
import type { CoachStyleId } from "@/lib/rhythm/types";
import { groupMonths, groupWeeks, sanitizeIntake } from "./engine";
import {
  ROADMAP_MAX_CHAPTERS_PER_SUBJECT,
  ROADMAP_MAX_COMMITMENTS,
  ROADMAP_MAX_COMPLETIONS,
  ROADMAP_MAX_DAYS,
  ROADMAP_MAX_SESSIONS_PER_DAY,
  ROADMAP_MAX_SUBJECTS,
  ROADMAP_MAX_UNSCHEDULED,
  assessRoadmapLimits,
  jsonByteLength,
  type RoadmapLimitError,
} from "./limits";
import { clampMinutes, isIsoDate, localIsoDate } from "./time";
import type {
  DayKind,
  OverflowWarning,
  RoadmapDayPlan,
  RoadmapPlan,
  RoadmapRecord,
  RoadmapSession,
  SessionCompletion,
  SessionKind,
  StudyRhythmHook,
  UnscheduledChapter,
} from "./types";

const SESSION_KINDS: SessionKind[] = [
  "study",
  "revision",
  "practice_test",
  "break",
  "buffer",
];
const DAY_KINDS: DayKind[] = ["study", "buffer", "revision"];
const COACH_STYLES: CoachStyleId[] = ["calm", "mastery", "momentum", "balanced", "off"];
const COACH_SLOTS: NonNullable<StudyRhythmHook["coachSlot"]>[] = [
  "morning",
  "midday",
  "evening",
  "recovery",
];

export type PreparedRoadmap =
  | { ok: true; record: RoadmapRecord }
  | RoadmapLimitError
  | { ok: false; status: 400; code: "malformed"; error: string };

export function bindRecordOwner<T extends { userId?: string }>(
  record: T,
  sessionUserId: string
): T {
  return { ...record, userId: sessionUserId };
}

export function sanitizeRhythmHook(value: unknown): StudyRhythmHook | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<StudyRhythmHook>;
  const next: StudyRhythmHook = {};
  if (isThemeId(raw.preferredThemeId)) next.preferredThemeId = raw.preferredThemeId;
  if (typeof raw.coachStyle === "string" && COACH_STYLES.includes(raw.coachStyle as CoachStyleId)) {
    next.coachStyle = raw.coachStyle as CoachStyleId;
  }
  if (typeof raw.encouragementOff === "boolean") next.encouragementOff = raw.encouragementOff;
  if (typeof raw.coachSlot === "string" && COACH_SLOTS.includes(raw.coachSlot as (typeof COACH_SLOTS)[number])) {
    next.coachSlot = raw.coachSlot as StudyRhythmHook["coachSlot"];
  }
  if (typeof raw.focusMinutes === "number") {
    next.focusMinutes = clampMinutes(raw.focusMinutes, 20, 90);
  }
  if (typeof raw.breakMinutes === "number") {
    next.breakMinutes = clampMinutes(raw.breakMinutes, 5, 30);
  }
  return next;
}

function sanitizeSession(value: unknown, fallbackDate: string, index: number): RoadmapSession | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<RoadmapSession>;
  if (typeof raw.kind !== "string" || !SESSION_KINDS.includes(raw.kind as SessionKind)) return null;
  const date = typeof raw.date === "string" && isIsoDate(raw.date) ? raw.date : fallbackDate;
  const startMinutes = clampMinutes(Number(raw.startMinutes), 0, 24 * 60 - 1);
  const minutes = clampMinutes(Number(raw.minutes), 1, 12 * 60);
  const endMinutes = clampMinutes(
    Number.isFinite(Number(raw.endMinutes)) ? Number(raw.endMinutes) : startMinutes + minutes,
    startMinutes + 1,
    24 * 60
  );
  return {
    id: String(raw.id || `s-${date}-${index + 1}`).slice(0, 80),
    date,
    startMinutes,
    endMinutes,
    minutes,
    kind: raw.kind as SessionKind,
    subjectId: typeof raw.subjectId === "string" ? raw.subjectId.slice(0, 80) : undefined,
    subjectName: typeof raw.subjectName === "string" ? raw.subjectName.slice(0, 80) : undefined,
    chapterId: typeof raw.chapterId === "string" ? raw.chapterId.slice(0, 80) : undefined,
    chapterName: typeof raw.chapterName === "string" ? raw.chapterName.slice(0, 80) : undefined,
    title: String(raw.title || "Study").slice(0, 120),
  };
}

function sanitizeDay(value: unknown): RoadmapDayPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<RoadmapDayPlan>;
  if (typeof raw.date !== "string" || !isIsoDate(raw.date)) return null;
  if (typeof raw.kind !== "string" || !DAY_KINDS.includes(raw.kind as DayKind)) return null;
  const date = raw.date;
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions
        .map((session, index) => sanitizeSession(session, date, index))
        .filter((session): session is RoadmapSession => Boolean(session))
    : [];
  return {
    date,
    kind: raw.kind as DayKind,
    availableStudyMinutes: clampMinutes(Number(raw.availableStudyMinutes), 0, 16 * 60),
    sessions,
  };
}

function sanitizeUnscheduled(value: unknown): UnscheduledChapter[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is UnscheduledChapter => Boolean(row && typeof row === "object"))
    .slice(0, ROADMAP_MAX_UNSCHEDULED)
    .map((row, index) => ({
      chapterId: String(row.chapterId || `ch-${index + 1}`).slice(0, 80),
      subjectId: String(row.subjectId || `sub-${index + 1}`).slice(0, 80),
      subjectName: String(row.subjectName || "Subject").slice(0, 80),
      chapterName: String(row.chapterName || "Chapter").slice(0, 80),
      leftoverMinutes: clampMinutes(Number(row.leftoverMinutes), 0, 40 * 60),
    }));
}

function sanitizeOverflow(value: unknown): OverflowWarning {
  if (!value || typeof value !== "object") {
    return {
      fits: true,
      neededStudyMinutes: 0,
      availableStudyMinutes: 0,
      unscheduledMinutes: 0,
      unscheduledChapters: [],
      message: "This syllabus fits the days you still have before the exam.",
    };
  }
  const raw = value as Partial<OverflowWarning>;
  const unscheduledChapters = sanitizeUnscheduled(raw.unscheduledChapters);
  return {
    fits: Boolean(raw.fits),
    neededStudyMinutes: clampMinutes(Number(raw.neededStudyMinutes), 0, 500 * 60),
    availableStudyMinutes: clampMinutes(Number(raw.availableStudyMinutes), 0, 500 * 60),
    unscheduledMinutes: clampMinutes(Number(raw.unscheduledMinutes), 0, 500 * 60),
    unscheduledChapters,
    message: String(raw.message || "").slice(0, 400),
  };
}

export function sanitizePlan(value: unknown, fallbackExamDate: string): RoadmapPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<RoadmapPlan>;
  if (!Array.isArray(raw.days)) return null;
  const days = raw.days
    .map((day) => sanitizeDay(day))
    .filter((day): day is RoadmapDayPlan => Boolean(day));
  const today = typeof raw.today === "string" && isIsoDate(raw.today) ? raw.today : localIsoDate();
  const examDate =
    typeof raw.examDate === "string" && isIsoDate(raw.examDate) ? raw.examDate : fallbackExamDate;
  const generatedAt =
    typeof raw.generatedAt === "string" && raw.generatedAt.length < 80
      ? raw.generatedAt
      : `${today}T00:00:00.000Z`;
  return {
    generatedAt,
    today,
    examDate,
    days,
    weeks: groupWeeks(days),
    months: groupMonths(days),
    overflow: sanitizeOverflow(raw.overflow),
  };
}

function sanitizeCompletions(value: unknown): Record<string, SessionCompletion> {
  if (!value || typeof value !== "object") return {};
  const next: Record<string, SessionCompletion> = {};
  for (const [id, row] of Object.entries(value as Record<string, SessionCompletion>)) {
    if (!id || id.length > 80 || !row || typeof row !== "object") continue;
    if (typeof row.completedAt !== "string" || row.completedAt.length > 80) continue;
    next[id] = { completedAt: row.completedAt };
    if (Object.keys(next).length >= ROADMAP_MAX_COMPLETIONS) break;
  }
  return next;
}

export function roadmapWritePayload(record: RoadmapRecord): {
  intake: RoadmapRecord["intake"];
  plan: RoadmapRecord["plan"];
  completions: RoadmapRecord["completions"];
} {
  return {
    intake: record.intake,
    plan: record.plan,
    completions: record.completions,
  };
}

function tooComplex(): PreparedRoadmap {
  return {
    ok: false,
    status: 400,
    code: "too_complex",
    error: "This study plan has more days or sessions than we can keep in your account.",
  };
}

export function prepareRoadmapRecord(value: unknown, userId: string): PreparedRoadmap {
  if (!value || typeof value !== "object") {
    return { ok: false, status: 400, code: "malformed", error: "That study plan could not be read." };
  }
  const raw = value as Partial<RoadmapRecord>;
  const rawPlan = raw.plan && typeof raw.plan === "object" ? (raw.plan as Partial<RoadmapPlan>) : null;
  if (rawPlan && Array.isArray(rawPlan.days)) {
    if (rawPlan.days.length > ROADMAP_MAX_DAYS) return tooComplex();
    if (
      rawPlan.days.some(
        (day) =>
          day &&
          typeof day === "object" &&
          Array.isArray((day as RoadmapDayPlan).sessions) &&
          (day as RoadmapDayPlan).sessions.length > ROADMAP_MAX_SESSIONS_PER_DAY
      )
    ) {
      return tooComplex();
    }
  }
  const rawIntake = raw.intake && typeof raw.intake === "object" ? (raw.intake as Partial<RoadmapRecord["intake"]>) : null;
  if (rawIntake && Array.isArray(rawIntake.subjects) && rawIntake.subjects.length > ROADMAP_MAX_SUBJECTS) {
    return tooComplex();
  }
  if (
    rawIntake &&
    Array.isArray(rawIntake.subjects) &&
    rawIntake.subjects.some(
      (subject) =>
        subject &&
        typeof subject === "object" &&
        Array.isArray(subject.chapters) &&
        subject.chapters.length > ROADMAP_MAX_CHAPTERS_PER_SUBJECT
    )
  ) {
    return tooComplex();
  }
  if (rawIntake && Array.isArray(rawIntake.commitments) && rawIntake.commitments.length > ROADMAP_MAX_COMMITMENTS) {
    return tooComplex();
  }
  if (raw.completions && typeof raw.completions === "object" && Object.keys(raw.completions).length > ROADMAP_MAX_COMPLETIONS) {
    return tooComplex();
  }

  const plan = sanitizePlan(
    raw.plan,
    rawIntake?.examDate ? String(rawIntake.examDate) : localIsoDate()
  );
  if (!plan || !raw.intake) {
    return { ok: false, status: 400, code: "malformed", error: "That study plan could not be read." };
  }
  const intake = sanitizeIntake(raw.intake, plan.examDate || localIsoDate());
  const rhythm = sanitizeRhythmHook(intake.rhythm ?? rawIntake?.rhythm);
  if (rhythm) intake.rhythm = rhythm;
  else delete intake.rhythm;

  const record: RoadmapRecord = {
    version: 1,
    id: String(raw.id || `roadmap-${userId}`).slice(0, 80),
    userId,
    intake,
    plan,
    completions: sanitizeCompletions(raw.completions),
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt.length < 80
      ? raw.updatedAt
      : new Date().toISOString(),
  };

  const maxSessionsPerDay = record.plan.days.reduce(
    (max, day) => Math.max(max, day.sessions.length),
    0
  );
  const maxChaptersPerSubject = record.intake.subjects.reduce(
    (max, subject) => Math.max(max, subject.chapters.length),
    0
  );
  const limit = assessRoadmapLimits({
    days: record.plan.days.length,
    maxSessionsPerDay,
    subjects: record.intake.subjects.length,
    maxChaptersPerSubject,
    commitments: record.intake.commitments.length,
    completions: Object.keys(record.completions).length,
    byteLength: jsonByteLength(roadmapWritePayload(record)),
  });
  if (limit) return limit;
  return { ok: true, record };
}

/** Structural read for localStorage. Does not enforce upload size caps. */
export function sanitizeRecord(value: unknown, userId: string): RoadmapRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<RoadmapRecord>;
  const plan = sanitizePlan(raw.plan, localIsoDate());
  if (!plan || !raw.intake) return null;
  const intake = sanitizeIntake(raw.intake, plan.examDate);
  const rhythm = sanitizeRhythmHook(intake.rhythm);
  if (rhythm) intake.rhythm = rhythm;
  else delete intake.rhythm;
  return {
    version: 1,
    id: String(raw.id || `roadmap-${userId}`).slice(0, 80),
    userId,
    intake,
    plan,
    completions: sanitizeCompletions(raw.completions),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}
