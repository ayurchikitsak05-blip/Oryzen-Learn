import { defaultIntake } from "@/lib/roadmap/defaults";
import type { RoadmapIntake, RoadmapSubject } from "@/lib/roadmap/types";

/**
 * First-run setup (design boards "Your exam" and "Your first book", 3 Nov 2026).
 * One screen of taps turns into a ready exam plan; the full plan form stays on /roadmap.
 */

export type ExamId = "class10" | "class11" | "class12" | "neet" | "jee" | "college";

export interface ExamOption {
  id: ExamId;
  label: string;
  /** Subjects offered as taps; the first ones are pre-selected. */
  subjects: readonly string[];
  preselected: readonly string[];
  /** Usual exam month (1-12), used to suggest a date. */
  usualMonth: number | null;
}

export const EXAM_OPTIONS: readonly ExamOption[] = [
  { id: "class10", label: "Class 10", subjects: ["Science", "Maths", "Social Science", "English"], preselected: ["Science", "Maths"], usualMonth: 3 },
  { id: "class11", label: "Class 11", subjects: ["Physics", "Chemistry", "Biology", "Maths", "English"], preselected: ["Physics", "Chemistry"], usualMonth: 3 },
  { id: "class12", label: "Class 12", subjects: ["Physics", "Chemistry", "Biology", "Maths", "English"], preselected: ["Physics", "Chemistry"], usualMonth: 3 },
  { id: "neet", label: "NEET", subjects: ["Physics", "Chemistry", "Biology"], preselected: ["Physics", "Chemistry", "Biology"], usualMonth: 5 },
  { id: "jee", label: "JEE", subjects: ["Physics", "Chemistry", "Maths"], preselected: ["Physics", "Chemistry", "Maths"], usualMonth: 1 },
  { id: "college", label: "College", subjects: [], preselected: [], usualMonth: null },
];

/**
 * Rough NCERT chapter counts so the first plan has a sensible size.
 * Chapters are named "Chapter 1", "Chapter 2"…; students rename or remove them in the plan.
 */
const CHAPTER_COUNTS: Partial<Record<ExamId, Record<string, number>>> = {
  class10: { Science: 13, Maths: 14 },
  class11: { Physics: 14, Chemistry: 9, Biology: 19, Maths: 14 },
  class12: { Physics: 14, Chemistry: 10, Biology: 13, Maths: 13 },
  neet: { Physics: 28, Chemistry: 19, Biology: 32 },
  jee: { Physics: 28, Chemistry: 19, Maths: 27 },
};

export const DEFAULT_CHAPTER_COUNT = 10;
export const FIRST_PLAN_DAILY_HOURS = 2;
export const MINUTES_PER_CHAPTER = 120;

export function examOption(id: ExamId | null | undefined): ExamOption | undefined {
  return EXAM_OPTIONS.find((option) => option.id === id);
}

export function chapterCount(exam: ExamId, subject: string): number {
  return CHAPTER_COUNTS[exam]?.[subject] ?? DEFAULT_CHAPTER_COUNT;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "YYYY-MM" for the next `count` months, starting next month. */
export function upcomingMonths(today: string, count = 18): string[] {
  const [year, month] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const index = month - 1 + i;
    out.push(`${year + Math.floor(index / 12)}-${pad((index % 12) + 1)}`);
  }
  return out;
}

/** The next time the exam's usual month comes round (at least a month away); else 3 months away. */
export function suggestedExamMonth(exam: ExamId, today: string): string {
  const months = upcomingMonths(today);
  const usual = examOption(exam)?.usualMonth;
  if (usual) {
    const found = months.find((value) => Number(value.slice(5, 7)) === usual);
    if (found) return found;
  }
  return months[2];
}

export function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[month - 1]} ${year}`;
}

/** Plans run up to the 1st of the exam month, so the plan finishes before the exam. */
export function examDateFromMonth(yearMonth: string): string {
  return `${yearMonth}-01`;
}

export interface FirstRunAnswers {
  exam: ExamId;
  subjects: string[];
  examMonth: string;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "subject";
}

export function cleanSubjects(subjects: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of subjects) {
    const name = raw.replace(/\s+/g, " ").trim().slice(0, 40);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.slice(0, 8);
}

export function buildQuickIntake(answers: FirstRunAnswers): RoadmapIntake {
  const option = examOption(answers.exam);
  const subjects: RoadmapSubject[] = cleanSubjects(answers.subjects).map((name) => {
    const id = `sub-${slug(name)}`;
    const count = chapterCount(answers.exam, name);
    return {
      id,
      name,
      examImportance: name === "English" ? 3 : 5,
      chapters: Array.from({ length: count }, (_, index) => ({
        id: `${id}-ch${index + 1}`,
        name: `Chapter ${index + 1}`,
        difficulty: 3,
        remainingMinutes: MINUTES_PER_CHAPTER,
      })),
    };
  });
  return {
    ...defaultIntake(examDateFromMonth(answers.examMonth)),
    examName: option?.label ?? "My exam",
    subjects,
    dailyHours: FIRST_PLAN_DAILY_HOURS,
    focusMinutes: 25,
    breakMinutes: 5,
  };
}

export function canMakePlan(answers: Partial<FirstRunAnswers>, today: string): boolean {
  return Boolean(
    answers.exam &&
      answers.examMonth &&
      examDateFromMonth(answers.examMonth) > today &&
      cleanSubjects(answers.subjects ?? []).length > 0
  );
}

/* Device storage: the answers wait here until the plan screen turns them into a plan. */

export const FIRST_RUN_DRAFT_KEY = "oryzen_first_run_draft_v1";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function saveFirstRunDraft(answers: FirstRunAnswers): void {
  try {
    storage()?.setItem(FIRST_RUN_DRAFT_KEY, JSON.stringify(answers));
  } catch {
    /* private mode: the student can still make the plan on /roadmap */
  }
}

export function readFirstRunDraft(): FirstRunAnswers | null {
  try {
    const raw = storage()?.getItem(FIRST_RUN_DRAFT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FirstRunAnswers>;
    if (!examOption(value.exam) || typeof value.examMonth !== "string" || !/^\d{4}-\d{2}$/.test(value.examMonth)) {
      return null;
    }
    const subjects = cleanSubjects(Array.isArray(value.subjects) ? value.subjects.filter((s) => typeof s === "string") : []);
    if (!subjects.length) return null;
    return { exam: value.exam as ExamId, subjects, examMonth: value.examMonth };
  } catch {
    return null;
  }
}

export function clearFirstRunDraft(): void {
  try {
    storage()?.removeItem(FIRST_RUN_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
