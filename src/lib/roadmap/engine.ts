import { defaultIntake } from "./defaults";
import {
  addDays,
  clampMinutes,
  daysBetween,
  enumerateDates,
  formatHours,
  intervalMinutes,
  normalizeWindow,
  overlapsSleep,
  startOfIsoWeek,
  subtractIntervals,
  weekday,
  windowToIntervals,
  yearMonth,
  type MinuteInterval,
} from "./time";
import type {
  DayKind,
  OverflowWarning,
  PrepLevel,
  RoadmapDayPlan,
  RoadmapIntake,
  RoadmapMonthPlan,
  RoadmapPlan,
  RoadmapSession,
  RoadmapSubject,
  RoadmapWeekPlan,
  SessionKind,
  UnscheduledChapter,
} from "./types";

const PREP_MULTIPLIER: Record<PrepLevel, number> = {
  just_starting: 1,
  some_progress: 0.7,
  revision_ready: 0.4,
};

interface WorkItem {
  key: string;
  kind: Extract<SessionKind, "study" | "revision" | "practice_test">;
  subjectId: string;
  subjectName: string;
  chapterId?: string;
  chapterName?: string;
  minutes: number;
  priority: number;
}

function prepMultiplier(level: PrepLevel): number {
  return PREP_MULTIPLIER[level] ?? 1;
}

export function chapterWorkMinutes(
  remainingMinutes: number,
  prepLevel: PrepLevel,
  completed?: boolean
): number {
  if (completed) return 0;
  return Math.max(0, Math.round(remainingMinutes * prepMultiplier(prepLevel)));
}

export function chapterPriority(input: {
  remainingMinutes: number;
  difficulty: number;
  examImportance: number;
  daysUntilExam: number;
}): number {
  const difficulty = clampMinutes(input.difficulty, 1, 5);
  const importance = clampMinutes(input.examImportance, 1, 5);
  const remaining = Math.max(0, input.remainingMinutes);
  const urgency = remaining / Math.max(1, input.daysUntilExam);
  return difficulty * importance * remaining + urgency * 10;
}

export function sanitizeIntake(value: unknown, fallbackExamDate: string): RoadmapIntake {
  const base = defaultIntake(fallbackExamDate);
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<RoadmapIntake>;
  const examDate =
    typeof raw.examDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.examDate)
      ? raw.examDate
      : fallbackExamDate;
  const subjects = Array.isArray(raw.subjects)
    ? raw.subjects
        .filter((subject): subject is RoadmapSubject => Boolean(subject && typeof subject === "object"))
        .map((subject, subjectIndex) => ({
          id: String(subject.id || `sub-${subjectIndex + 1}`),
          name: String(subject.name || `Subject ${subjectIndex + 1}`).slice(0, 80),
          examImportance: clampMinutes(Number(subject.examImportance), 1, 5),
          chapters: (Array.isArray(subject.chapters) ? subject.chapters : []).map(
            (chapter, chapterIndex) => ({
              id: String(chapter.id || `ch-${subjectIndex + 1}-${chapterIndex + 1}`),
              name: String(chapter.name || `Chapter ${chapterIndex + 1}`).slice(0, 80),
              difficulty: clampMinutes(Number(chapter.difficulty), 1, 5),
              remainingMinutes: clampMinutes(Number(chapter.remainingMinutes), 0, 20 * 60),
              completed: Boolean(chapter.completed),
            })
          ),
        }))
        .filter((subject) => subject.chapters.length > 0)
    : base.subjects;

  const prepLevel =
    raw.prepLevel === "some_progress" || raw.prepLevel === "revision_ready"
      ? raw.prepLevel
      : "just_starting";

  return {
    examDate,
    subjects: subjects.length > 0 ? subjects : base.subjects,
    prepLevel,
    dailyHours: Math.min(12, Math.max(0.5, Number(raw.dailyHours) || base.dailyHours)),
    commitments: Array.isArray(raw.commitments)
      ? raw.commitments
          .filter((row) => row && typeof row === "object")
          .map((row, index) => ({
            id: String(row.id || `commit-${index + 1}`),
            label: String(row.label || "Commitment").slice(0, 80),
            weekday: clampMinutes(Number(row.weekday), 0, 6) as RoadmapIntake["bufferWeekday"],
            startMinutes: clampMinutes(Number(row.startMinutes), 0, 24 * 60 - 1),
            endMinutes: clampMinutes(Number(row.endMinutes), 1, 24 * 60),
          }))
      : [],
    preferredStudyHours: normalizeWindow(raw.preferredStudyHours ?? base.preferredStudyHours),
    sleepWindow: normalizeWindow(raw.sleepWindow ?? base.sleepWindow),
    bufferWeekday: clampMinutes(Number(raw.bufferWeekday ?? 0), 0, 6) as RoadmapIntake["bufferWeekday"],
    focusMinutes: clampMinutes(Number(raw.focusMinutes ?? base.focusMinutes), 20, 90),
    breakMinutes: clampMinutes(Number(raw.breakMinutes ?? base.breakMinutes), 5, 30),
    practiceTestMinutes: clampMinutes(
      Number(raw.practiceTestMinutes ?? base.practiceTestMinutes),
      20,
      90
    ),
    revisionRatio: Math.min(0.5, Math.max(0.1, Number(raw.revisionRatio) || base.revisionRatio)),
    finalRevisionDays: clampMinutes(Number(raw.finalRevisionDays ?? base.finalRevisionDays), 1, 14),
    rhythm: raw.rhythm && typeof raw.rhythm === "object" ? { ...raw.rhythm } : {},
  };
}

export function allowedIntervals(date: string, intake: RoadmapIntake): MinuteInterval[] {
  let intervals = windowToIntervals(intake.preferredStudyHours);
  intervals = subtractIntervals(intervals, windowToIntervals(intake.sleepWindow));
  const dayCommitments = intake.commitments.filter((row) => row.weekday === weekday(date));
  intervals = subtractIntervals(
    intervals,
    dayCommitments.map((row) => ({ start: row.startMinutes, end: row.endMinutes }))
  );
  return intervals.filter((interval) => interval.end > interval.start);
}

export function maxStudyMinutesForClock(
  clockMinutes: number,
  focusMinutes: number,
  breakMinutes: number
): number {
  if (clockMinutes <= 0) return 0;
  const focus = Math.max(1, focusMinutes);
  const brk = Math.max(0, breakMinutes);
  let study = 0;
  let used = 0;
  while (used < clockMinutes) {
    const chunk = Math.min(focus, clockMinutes - used);
    if (chunk <= 0) break;
    used += chunk;
    study += chunk;
    if (used >= clockMinutes) break;
    if (brk > 0 && used + brk <= clockMinutes) {
      used += brk;
    } else {
      break;
    }
  }
  return study;
}

export function dayKind(date: string, examDate: string, intake: RoadmapIntake): DayKind {
  const remaining = daysBetween(date, examDate);
  if (remaining <= intake.finalRevisionDays) return "revision";
  if (weekday(date) === intake.bufferWeekday) return "buffer";
  return "study";
}

export function dayStudyCapacity(date: string, examDate: string, intake: RoadmapIntake): number {
  const clock = intervalMinutes(allowedIntervals(date, intake));
  const windowStudy = maxStudyMinutesForClock(clock, intake.focusMinutes, intake.breakMinutes);
  const requested = Math.round(intake.dailyHours * 60);
  const kind = dayKind(date, examDate, intake);
  const scaled =
    kind === "buffer" ? Math.round(requested * 0.5) : kind === "revision" ? requested : requested;
  return Math.max(0, Math.min(windowStudy, scaled));
}

function splitMinutes(total: number, block: number): number[] {
  const parts: number[] = [];
  let left = Math.max(0, Math.round(total));
  const size = Math.max(15, block);
  while (left > 0) {
    const chunk = Math.min(size, left);
    parts.push(chunk);
    left -= chunk;
  }
  return parts;
}

function buildWorkItems(intake: RoadmapIntake, today: string): WorkItem[] {
  const daysUntilExam = Math.max(1, daysBetween(today, intake.examDate));
  const items: WorkItem[] = [];
  for (const subject of intake.subjects) {
    for (const chapter of subject.chapters) {
      const minutes = chapterWorkMinutes(
        chapter.remainingMinutes,
        intake.prepLevel,
        chapter.completed
      );
      if (minutes <= 0) continue;
      items.push({
        key: `study:${chapter.id}`,
        kind: "study",
        subjectId: subject.id,
        subjectName: subject.name,
        chapterId: chapter.id,
        chapterName: chapter.name,
        minutes,
        priority: chapterPriority({
          remainingMinutes: minutes,
          difficulty: chapter.difficulty,
          examImportance: subject.examImportance,
          daysUntilExam,
        }),
      });
      const revisionMinutes = Math.max(20, Math.round(minutes * intake.revisionRatio));
      items.push({
        key: `revision:${chapter.id}`,
        kind: "revision",
        subjectId: subject.id,
        subjectName: subject.name,
        chapterId: chapter.id,
        chapterName: chapter.name,
        minutes: revisionMinutes,
        priority:
          chapterPriority({
            remainingMinutes: revisionMinutes,
            difficulty: chapter.difficulty,
            examImportance: subject.examImportance,
            daysUntilExam,
          }) * 0.6,
      });
    }
    items.push({
      key: `test:${subject.id}`,
      kind: "practice_test",
      subjectId: subject.id,
      subjectName: subject.name,
      minutes: intake.practiceTestMinutes,
      priority: subject.examImportance * 80,
    });
  }
  return items;
}

function titleFor(item: WorkItem, kind: SessionKind): string {
  if (kind === "break") return "Break";
  if (kind === "buffer") return "Buffer / catch-up";
  if (item.kind === "practice_test") return `Practice test · ${item.subjectName}`;
  if (item.kind === "revision") {
    return item.chapterName
      ? `Revise ${item.chapterName}`
      : `Revise ${item.subjectName}`;
  }
  return item.chapterName ? item.chapterName : item.subjectName;
}

function sessionAllowedOnDay(item: WorkItem, kind: DayKind, daysLeft: number): boolean {
  if (item.kind === "practice_test") return daysLeft <= 14;
  if (kind === "revision") return item.kind === "revision" || daysLeft <= 5;
  if (kind === "buffer") return true;
  return item.kind === "study" || daysLeft <= 21;
}

function takeBestItem(
  remaining: Map<string, WorkItem>,
  kind: DayKind,
  daysLeft: number,
  prefer: WorkItem["kind"][]
): WorkItem | null {
  const candidates = [...remaining.values()].filter(
    (item) => item.minutes > 0 && sessionAllowedOnDay(item, kind, daysLeft)
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const preferA = prefer.indexOf(a.kind);
    const preferB = prefer.indexOf(b.kind);
    const rankA = preferA === -1 ? prefer.length : preferA;
    const rankB = preferB === -1 ? prefer.length : preferB;
    if (rankA !== rankB) return rankA - rankB;
    return b.priority - a.priority;
  });
  return candidates[0] ?? null;
}

function packDay(input: {
  date: string;
  kind: DayKind;
  capacity: number;
  intervals: MinuteInterval[];
  remaining: Map<string, WorkItem>;
  daysLeft: number;
  intake: RoadmapIntake;
  seq: { n: number };
}): RoadmapSession[] {
  const sessions: RoadmapSession[] = [];
  let studyLeft = input.capacity;
  const prefer: WorkItem["kind"][] =
    input.kind === "revision"
      ? ["practice_test", "revision", "study"]
      : input.kind === "buffer"
        ? ["revision", "study", "practice_test"]
        : ["study", "revision", "practice_test"];

  for (const interval of input.intervals) {
    let cursor = interval.start;
    while (cursor < interval.end && studyLeft > 0) {
      const item = takeBestItem(input.remaining, input.kind, input.daysLeft, prefer);
      if (!item) return sessions;
      const room = interval.end - cursor;
      const chunk = Math.min(item.minutes, studyLeft, input.intake.focusMinutes, room);
      if (chunk < 15) break;
      const end = cursor + chunk;
      if (overlapsSleep(cursor, end, input.intake.sleepWindow)) break;
      input.seq.n += 1;
      sessions.push({
        id: `s-${input.date}-${String(input.seq.n).padStart(3, "0")}`,
        date: input.date,
        startMinutes: cursor,
        endMinutes: end,
        minutes: chunk,
        kind: item.kind,
        subjectId: item.subjectId,
        subjectName: item.subjectName,
        chapterId: item.chapterId,
        chapterName: item.chapterName,
        title: titleFor(item, item.kind),
      });
      item.minutes -= chunk;
      if (item.minutes <= 0) input.remaining.delete(item.key);
      studyLeft -= chunk;
      cursor = end;
      const moreToday = studyLeft >= 15 && takeBestItem(input.remaining, input.kind, input.daysLeft, prefer);
      if (moreToday && input.intake.breakMinutes > 0) {
        const breakEnd = cursor + input.intake.breakMinutes;
        if (breakEnd <= interval.end && !overlapsSleep(cursor, breakEnd, input.intake.sleepWindow)) {
          input.seq.n += 1;
          sessions.push({
            id: `s-${input.date}-${String(input.seq.n).padStart(3, "0")}`,
            date: input.date,
            startMinutes: cursor,
            endMinutes: breakEnd,
            minutes: input.intake.breakMinutes,
            kind: "break",
            title: "Break",
          });
          cursor = breakEnd;
        }
      }
    }
  }
  return sessions;
}

function leftoverChapters(remaining: Map<string, WorkItem>): UnscheduledChapter[] {
  return [...remaining.values()]
    .filter((item) => item.minutes > 0)
    .map((item) => ({
      chapterId: item.chapterId ?? item.key,
      subjectId: item.subjectId,
      subjectName: item.subjectName,
      chapterName:
        item.kind === "practice_test"
          ? `Practice test · ${item.subjectName}`
          : item.kind === "revision"
            ? `Revise ${item.chapterName ?? item.subjectName}`
            : item.chapterName ?? item.subjectName,
      leftoverMinutes: item.minutes,
    }));
}

export function buildOverflowWarning(input: {
  neededStudyMinutes: number;
  availableStudyMinutes: number;
  unscheduled: UnscheduledChapter[];
}): OverflowWarning {
  const unscheduledMinutes = input.unscheduled.reduce(
    (sum, row) => sum + row.leftoverMinutes,
    0
  );
  const shortfall = Math.max(0, input.neededStudyMinutes - input.availableStudyMinutes);
  const fits = unscheduledMinutes === 0 && shortfall === 0;
  const names = input.unscheduled
    .slice(0, 4)
    .map((row) => `${row.chapterName} (${formatHours(row.leftoverMinutes)})`)
    .join(", ");
  const message = fits
    ? "This syllabus fits the days you still have before the exam."
    : [
        `This syllabus needs about ${formatHours(Math.max(unscheduledMinutes, shortfall))} more than your calendar allows before the exam.`,
        names ? `Still without a seat: ${names}.` : "",
        "Add daily hours, drop chapters, or move the exam date.",
      ]
        .filter(Boolean)
        .join(" ");

  return {
    fits,
    neededStudyMinutes: input.neededStudyMinutes,
    availableStudyMinutes: input.availableStudyMinutes,
    unscheduledMinutes,
    unscheduledChapters: input.unscheduled,
    message,
  };
}

export function groupWeeks(days: RoadmapDayPlan[]): RoadmapWeekPlan[] {
  const weeks = new Map<string, RoadmapWeekPlan>();
  for (const day of days) {
    const startDate = startOfIsoWeek(day.date);
    const existing = weeks.get(startDate);
    if (existing) {
      existing.days.push(day);
      existing.endDate = day.date;
      continue;
    }
    weeks.set(startDate, {
      id: `week-${startDate}`,
      startDate,
      endDate: addDays(startDate, 6),
      days: [day],
    });
  }
  return [...weeks.values()];
}

export function groupMonths(days: RoadmapDayPlan[]): RoadmapMonthPlan[] {
  const months = new Map<string, RoadmapMonthPlan>();
  for (const day of days) {
    const key = yearMonth(day.date);
    const existing = months.get(key);
    if (existing) {
      existing.days.push(day);
      continue;
    }
    months.set(key, { id: `month-${key}`, yearMonth: key, days: [day] });
  }
  return [...months.values()];
}

export function neededStudyMinutes(intake: RoadmapIntake): number {
  return buildWorkItems(intake, intake.examDate).reduce((sum, item) => sum + item.minutes, 0);
}

export function buildRoadmapPlan(intakeInput: RoadmapIntake, today: string): RoadmapPlan {
  const intake = sanitizeIntake(intakeInput, intakeInput.examDate);
  const dates = enumerateDates(today, intake.examDate);
  const remaining = new Map(
    buildWorkItems(intake, today).map((item) => [item.key, { ...item }])
  );
  const needed = [...remaining.values()].reduce((sum, item) => sum + item.minutes, 0);
  const seq = { n: 0 };
  const days: RoadmapDayPlan[] = dates.map((date) => {
    const kind = dayKind(date, intake.examDate, intake);
    const availableStudyMinutes = dayStudyCapacity(date, intake.examDate, intake);
    const sessions = packDay({
      date,
      kind,
      capacity: availableStudyMinutes,
      intervals: allowedIntervals(date, intake),
      remaining,
      daysLeft: daysBetween(date, intake.examDate),
      intake,
      seq,
    });
    if (kind === "buffer" && sessions.length === 0 && availableStudyMinutes > 0) {
      const intervals = allowedIntervals(date, intake);
      const start = intervals[0]?.start ?? intake.preferredStudyHours.startMinutes;
      const minutes = Math.min(30, availableStudyMinutes);
      const end = start + minutes;
      if (!overlapsSleep(start, end, intake.sleepWindow)) {
        seq.n += 1;
        sessions.push({
          id: `s-${date}-${String(seq.n).padStart(3, "0")}`,
          date,
          startMinutes: start,
          endMinutes: end,
          minutes,
          kind: "buffer",
          title: "Buffer / rest or catch-up",
        });
      }
    }
    return { date, kind, availableStudyMinutes, sessions };
  });

  const available = days.reduce((sum, day) => sum + day.availableStudyMinutes, 0);
  const overflow = buildOverflowWarning({
    neededStudyMinutes: needed,
    availableStudyMinutes: available,
    unscheduled: leftoverChapters(remaining),
  });

  return {
    generatedAt: `${today}T00:00:00.000Z`,
    today,
    examDate: intake.examDate,
    days,
    weeks: groupWeeks(days),
    months: groupMonths(days),
    overflow,
  };
}

export function workSessions(sessions: RoadmapSession[]): RoadmapSession[] {
  return sessions.filter(
    (session) => session.kind === "study" || session.kind === "revision" || session.kind === "practice_test"
  );
}

export function planProgress(
  plan: RoadmapPlan,
  completions: Record<string, { completedAt: string }>
): {
  totalWork: number;
  completedWork: number;
  totalMinutes: number;
  completedMinutes: number;
  percent: number;
} {
  const work = workSessions(plan.days.flatMap((day) => day.sessions));
  const completed = work.filter((session) => completions[session.id]);
  const totalMinutes = work.reduce((sum, session) => sum + session.minutes, 0);
  const completedMinutes = completed.reduce((sum, session) => sum + session.minutes, 0);
  return {
    totalWork: work.length,
    completedWork: completed.length,
    totalMinutes,
    completedMinutes,
    percent: totalMinutes === 0 ? 0 : Math.round((completedMinutes / totalMinutes) * 100),
  };
}

export function detectMissedDates(
  plan: RoadmapPlan,
  completions: Record<string, { completedAt: string }>,
  today: string
): string[] {
  return plan.days
    .filter((day) => day.date < today)
    .filter((day) =>
      workSessions(day.sessions).some((session) => !completions[session.id])
    )
    .map((day) => day.date);
}

export function dayByDate(plan: RoadmapPlan, date: string): RoadmapDayPlan | undefined {
  return plan.days.find((day) => day.date === date);
}
