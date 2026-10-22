import { dayByDate, detectMissedDates, workSessions } from "@/lib/roadmap/engine";
import { daysBetween } from "@/lib/roadmap/time";
import type { RoadmapRecord } from "@/lib/roadmap/types";
import type { ReaderQuizProgress } from "@/lib/reader/quiz-progress";
import {
  EXAM_APPROACHING_DAYS,
  GENTLE_TRIGGERS,
  TRIGGER_PRIORITY,
  type CoachFrequency,
  type CoachPrefs,
  type CoachTrigger,
} from "./types";

export function frequencyAllows(trigger: CoachTrigger, frequency: CoachFrequency): boolean {
  if (frequency === "off") return false;
  if (frequency === "gentle") return GENTLE_TRIGGERS.includes(trigger);
  if (frequency === "regular") return trigger !== "over_planned_hours" || true;
  return true;
}

export function isLowQuiz(entries: ReaderQuizProgress[]): boolean {
  return entries.some(
    (entry) => entry.completed && Array.isArray(entry.weakConcepts) && entry.weakConcepts.length >= 1
  );
}

export function todayIsPacked(record: RoadmapRecord | null, today: string): boolean {
  if (!record) return false;
  if (!record.plan.overflow.fits) return true;
  const day = dayByDate(record.plan, today);
  if (!day) return false;
  const work = workSessions(day.sessions);
  const minutes = work.reduce((sum, session) => sum + session.minutes, 0);
  return work.length >= 4 || minutes > day.availableStudyMinutes * 0.85;
}

export function missedStudyDays(record: RoadmapRecord | null, today: string): string[] {
  if (!record) return [];
  return detectMissedDates(record.plan, record.completions, today);
}

export function examIsApproaching(record: RoadmapRecord | null, today: string): boolean {
  if (!record?.intake.examDate) return false;
  const left = daysBetween(today, record.intake.examDate);
  return left >= 0 && left <= EXAM_APPROACHING_DAYS;
}

export function hardChapterCompletedToday(record: RoadmapRecord | null, today: string): boolean {
  if (!record) return false;
  const chapters = new Map(
    record.intake.subjects.flatMap((subject) =>
      subject.chapters.map((chapter) => [chapter.id, chapter] as const)
    )
  );
  const day = dayByDate(record.plan, today);
  if (!day) return false;
  return workSessions(day.sessions).some((session) => {
    if (!record.completions[session.id]) return false;
    if (session.kind === "practice_test") return true;
    const chapter = session.chapterId ? chapters.get(session.chapterId) : undefined;
    return (chapter?.difficulty ?? 0) >= 4;
  });
}

export function overPlannedHours(
  record: RoadmapRecord | null,
  today: string,
  prefs: CoachPrefs,
  now = new Date()
): boolean {
  if (!record) return Boolean(prefs.studyStartedAt);
  const day = dayByDate(record.plan, today);
  if (!day) return false;
  const completedMinutes = workSessions(day.sessions)
    .filter((session) => record.completions[session.id])
    .reduce((sum, session) => sum + session.minutes, 0);
  if (completedMinutes > day.availableStudyMinutes) return true;
  if (!prefs.studyStartedAt) return false;
  const started = Date.parse(prefs.studyStartedAt);
  if (Number.isNaN(started)) return false;
  const elapsed = Math.round((now.getTime() - started) / 60_000);
  const planned = workSessions(day.sessions).reduce((sum, session) => sum + session.minutes, 0);
  return elapsed > Math.max(planned, day.availableStudyMinutes);
}

export function recentPostponeCount(prefs: CoachPrefs, now = Date.now(), windowMs = 7 * 86_400_000): number {
  return prefs.postponeLog.filter((entry) => {
    const stamp = Number(entry.split("@")[1] ?? "");
    return Number.isFinite(stamp) && now - stamp <= windowMs;
  }).length;
}

export function isSnoozed(prefs: CoachPrefs, now = new Date()): boolean {
  if (!prefs.snoozeUntil) return false;
  const until = Date.parse(prefs.snoozeUntil);
  return Number.isFinite(until) && until > now.getTime();
}

export function detectCoachTrigger(input: {
  today: string;
  record: RoadmapRecord | null;
  quizEntries: ReaderQuizProgress[];
  prefs: CoachPrefs;
  frequency: CoachFrequency;
  encouragementOff: boolean;
  styleOff: boolean;
  now?: Date;
  forcedTrigger?: CoachTrigger | null;
}): CoachTrigger | null {
  if (input.encouragementOff || input.styleOff || input.frequency === "off") return null;
  if (input.forcedTrigger && frequencyAllows(input.forcedTrigger, input.frequency)) {
    return input.forcedTrigger;
  }
  if (isSnoozed(input.prefs, input.now)) return null;

  const candidates: CoachTrigger[] = [];
  const explicit =
    Boolean(input.prefs.explicitOverwhelmedAt) &&
    input.prefs.explicitOverwhelmedAt?.slice(0, 10) === input.today;
  if (explicit || todayIsPacked(input.record, input.today)) candidates.push("overwhelmed");
  if (overPlannedHours(input.record, input.today, input.prefs, input.now)) {
    candidates.push("over_planned_hours");
  }
  if (examIsApproaching(input.record, input.today)) candidates.push("exam_approaching");
  if (missedStudyDays(input.record, input.today).length > 0) candidates.push("sessions_missed");
  if (recentPostponeCount(input.prefs, input.now?.getTime()) >= 2) {
    candidates.push("repeated_postpone");
  }
  if (isLowQuiz(input.quizEntries)) candidates.push("low_quiz_score");
  if (hardChapterCompletedToday(input.record, input.today)) candidates.push("hard_chapter_done");
  candidates.push("dashboard_open");

  for (const trigger of TRIGGER_PRIORITY) {
    if (candidates.includes(trigger) && frequencyAllows(trigger, input.frequency)) {
      return trigger;
    }
  }
  return null;
}
