import { moveSession } from "@/lib/roadmap/edit";
import { dayByDate, workSessions } from "@/lib/roadmap/engine";
import { linksForSession } from "@/lib/roadmap/hooks";
import { addDays } from "@/lib/roadmap/time";
import type { RoadmapRecord, RoadmapSession } from "@/lib/roadmap/types";
import { BREAK_SNOOZE_MINUTES, type CoachActionId } from "./types";

export const COACH_ACTION_HANDLERS = {
  start_studying: "focusFirstIncompleteSession",
  simplify_day: "keepPrioritySessionsMoveRest",
  replan: "openReplanConfirm",
  revise_weak: "openReaderWeakConcepts",
  take_break: "snoozeAndNoteRest",
  continue_roadmap: "focusRoadmapToday",
  none: "acknowledgeOnly",
} as const satisfies Record<CoachActionId, string>;

export function firstIncompleteSession(
  record: RoadmapRecord | null,
  today: string
): RoadmapSession | null {
  if (!record) return null;
  const todayWork = workSessions(dayByDate(record.plan, today)?.sessions ?? []).filter(
    (session) => !record.completions[session.id]
  );
  if (todayWork[0]) return todayWork[0];
  for (const day of record.plan.days) {
    if (day.date < today) continue;
    const next = workSessions(day.sessions).find((session) => !record.completions[session.id]);
    if (next) return next;
  }
  return null;
}

function chapterWeight(record: RoadmapRecord, session: RoadmapSession): number {
  for (const subject of record.intake.subjects) {
    const chapter = subject.chapters.find((row) => row.id === session.chapterId);
    if (chapter) return chapter.difficulty * subject.examImportance;
  }
  return session.kind === "practice_test" ? 12 : 4;
}

export interface SimplifyResult {
  record: RoadmapRecord;
  kept: RoadmapSession[];
  moved: RoadmapSession[];
  warning: string | null;
  summary: string;
}

export function previewSimplifyToday(record: RoadmapRecord, today: string): SimplifyResult {
  const day = dayByDate(record.plan, today);
  const incomplete = workSessions(day?.sessions ?? []).filter(
    (session) => !record.completions[session.id]
  );
  if (incomplete.length === 0) {
    return {
      record,
      kept: [],
      moved: [],
      warning: null,
      summary: "Today is already clear. Nothing else needs to move.",
    };
  }
  if (incomplete.length <= 2) {
    return {
      record: { ...record, updatedAt: new Date().toISOString() },
      kept: incomplete,
      moved: [],
      warning: null,
      summary: "Today already has one or two study blocks. Nothing else was moved.",
    };
  }
  const ranked = [...incomplete].sort(
    (a, b) => chapterWeight(record, b) - chapterWeight(record, a)
  );
  const kept = ranked.slice(0, 2);
  const extras = ranked.slice(2);
  let next = record;
  const moved: RoadmapSession[] = [];
  let warning: string | null = null;
  extras.forEach((session, index) => {
    const target = addDays(today, index + 1);
    const result = moveSession(next, session.id, target, session.startMinutes);
    if (result.warning) {
      warning = result.warning;
      return;
    }
    next = result.record;
    moved.push({ ...session, date: target });
  });
  return {
    record: { ...next, updatedAt: new Date().toISOString() },
    kept,
    moved,
    warning,
    summary: `Keep ${kept.length} priority block${kept.length === 1 ? "" : "s"} today and move ${moved.length} later.`,
  };
}

export function startStudyHref(record: RoadmapRecord | null, today: string): string {
  const session = firstIncompleteSession(record, today);
  if (!session) return "/roadmap";
  if (session.kind === "practice_test") return linksForSession(session).testMe;
  return linksForSession(session).reader;
}

export function reviseWeakHref(record: RoadmapRecord | null, today: string): string {
  const session = firstIncompleteSession(record, today);
  if (session) return linksForSession(session).weakConcepts;
  return "/reader?view=weak&lens=test_me";
}

export function breakUntilIso(from = new Date(), minutes = BREAK_SNOOZE_MINUTES): string {
  return new Date(from.getTime() + minutes * 60_000).toISOString();
}

export function actionHref(
  action: CoachActionId,
  record: RoadmapRecord | null,
  today: string
): string | null {
  switch (action) {
    case "start_studying":
      return startStudyHref(record, today);
    case "revise_weak":
      return reviseWeakHref(record, today);
    case "continue_roadmap":
    case "replan":
    case "simplify_day":
      return "/roadmap";
    case "take_break":
    case "none":
      return null;
    default:
      return null;
  }
}
