/**
 * Exam readiness (owner, 12 Nov 2026): how ready the student is for the exam, chapter by chapter,
 * and what to do next. The student rates each chapter of their Study Roadmap on four honest
 * levels (a Test me result can suggest one). Readiness is the exam-weighted average of those
 * levels. Runs on the device from the roadmap the student already has: no AI call.
 */
import { daysBetween } from "@/lib/roadmap/time";
import type { RoadmapRecord } from "@/lib/roadmap/types";

export type ChapterLevel = "not_started" | "shaky" | "getting_there" | "exam_ready";

export const CHAPTER_LEVELS: readonly { id: ChapterLevel; label: string; hint: string; score: number }[] = [
  { id: "not_started", label: "Not started", hint: "Haven't read it yet", score: 0 },
  { id: "shaky", label: "Shaky", hint: "Read it, but mixing things up", score: 0.35 },
  { id: "getting_there", label: "Getting there", hint: "Mostly right, a few weak spots", score: 0.7 },
  { id: "exam_ready", label: "Exam ready", hint: "Could answer exam questions now", score: 1 },
];

export function isChapterLevel(value: unknown): value is ChapterLevel {
  return CHAPTER_LEVELS.some((level) => level.id === value);
}

export function levelInfo(level: ChapterLevel) {
  return CHAPTER_LEVELS.find((row) => row.id === level) ?? CHAPTER_LEVELS[0];
}

/** The four stages every chapter goes through in ORYZEN, and where each level sits. */
export const CHAPTER_STAGES = ["Read", "Test", "Fix", "Revise"] as const;

const STAGE_FOR_LEVEL: Record<ChapterLevel, number> = {
  not_started: 0,
  shaky: 2,
  getting_there: 3,
  exam_ready: 4,
};

/** 0-4: how many stages are behind the student (4 = all done). */
export function stagesDone(level: ChapterLevel): number {
  return STAGE_FOR_LEVEL[level];
}

export interface NextStep {
  label: string;
  detail: string;
  href: string;
}

/** One clear next action for a chapter, using tools the app already has. */
export function nextStepFor(level: ChapterLevel): NextStep {
  switch (level) {
    case "not_started":
      return { label: "Read and highlight", detail: "Open the chapter and mark the key lines.", href: "/reader" };
    case "shaky":
      return {
        label: "Test me, then fix the misses",
        detail: "Answer a few questions and say how sure you were. Start with what you got wrong while sure.",
        href: "/reader?lens=test_me",
      };
    case "getting_there":
      return { label: "Revise with cards", detail: "Cover the answer, recall it, check.", href: "/revise" };
    case "exam_ready":
      return { label: "Keep it fresh", detail: "A quick card recap once a week is enough.", href: "/revise" };
  }
}

export interface ChapterReadiness {
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
  level: ChapterLevel;
  weight: number;
}

/** A chapter the student hasn't rated: ticked as studied counts as "Getting there", else "Not started". */
export function chapterLevel(record: Pick<RoadmapRecord, "readiness">, chapterId: string, completed?: boolean): ChapterLevel {
  const saved = record.readiness?.[chapterId];
  if (isChapterLevel(saved)) return saved;
  return completed ? "getting_there" : "not_started";
}

export function chapterReadiness(record: Pick<RoadmapRecord, "intake" | "readiness">): ChapterReadiness[] {
  return record.intake.subjects.flatMap((subject) =>
    subject.chapters.map((chapter) => ({
      subjectId: subject.id,
      subjectName: subject.name,
      chapterId: chapter.id,
      chapterName: chapter.name,
      level: chapterLevel(record, chapter.id, chapter.completed),
      // More important subjects and harder chapters count for more.
      weight: Math.max(1, subject.examImportance) * (0.75 + Math.max(1, chapter.difficulty) / 4),
    }))
  );
}

export interface ReadinessSummary {
  percent: number;
  daysLeft: number;
  chapters: ChapterReadiness[];
  counts: Record<ChapterLevel, number>;
  /** The chapter that would raise readiness most: lowest level, highest weight. */
  doNext: ChapterReadiness | null;
  /** About how many days per chapter still to make exam ready; null when none or no time left. */
  daysPerChapter: number | null;
}

export function readinessSummary(record: Pick<RoadmapRecord, "intake" | "readiness">, today: string): ReadinessSummary {
  const chapters = chapterReadiness(record);
  const counts: Record<ChapterLevel, number> = { not_started: 0, shaky: 0, getting_there: 0, exam_ready: 0 };
  let total = 0;
  let earned = 0;
  for (const chapter of chapters) {
    counts[chapter.level] += 1;
    total += chapter.weight;
    earned += chapter.weight * levelInfo(chapter.level).score;
  }
  const percent = total > 0 ? Math.round((earned / total) * 100) : 0;
  const daysLeft = Math.max(0, daysBetween(today, record.intake.examDate));
  const remaining = chapters.filter((chapter) => chapter.level !== "exam_ready");
  const doNext =
    remaining
      .slice()
      .sort((a, b) => {
        const gain = (row: ChapterReadiness) => row.weight * (1 - levelInfo(row.level).score);
        return gain(b) - gain(a);
      })[0] ?? null;
  const daysPerChapter = remaining.length > 0 && daysLeft > 0 ? Math.max(0.5, Math.round((daysLeft / remaining.length) * 2) / 2) : null;
  return { percent, daysLeft, chapters, counts, doNext, daysPerChapter };
}

/** Keeps only known chapter ids and valid levels (data from the device or the server). */
export function sanitizeReadiness(value: unknown, chapterIds?: ReadonlySet<string>): Record<string, ChapterLevel> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, ChapterLevel> = {};
  let count = 0;
  for (const [id, level] of Object.entries(value as Record<string, unknown>)) {
    if (count >= 500) break;
    if (typeof id !== "string" || id.length > 80 || !isChapterLevel(level)) continue;
    if (chapterIds && !chapterIds.has(id)) continue;
    out[id] = level;
    count += 1;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
