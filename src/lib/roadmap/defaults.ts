import type {
  HorizonKind,
  PrepLevel,
  RoadmapCommitment,
  RoadmapHorizon,
  RoadmapIntake,
  RoadmapSubject,
  Weekday,
} from "./types";

export const ROADMAP_STORAGE_KEY = "oryzen_study_roadmap_v1";

export const WEEKDAY_OPTIONS: Array<{ value: Weekday; label: string }> = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

export const HORIZON_OPTIONS: Array<{
  value: HorizonKind;
  label: string;
  hint: string;
  customDays?: number;
}> = [
  {
    value: "until_exam",
    label: "Until the exam",
    hint: "Plan every remaining day before the exam date.",
  },
  {
    value: "days_30",
    label: "1 month",
    hint: "The next 30 days, or fewer if the exam is sooner.",
  },
  {
    value: "days_60",
    label: "2 months",
    hint: "The next 60 days, or fewer if the exam is sooner.",
  },
  {
    value: "days_90",
    label: "3 months",
    hint: "The next 90 days, or fewer if the exam is sooner.",
  },
  {
    value: "weekly_rolling",
    label: "This week",
    hint: "A rolling 7-day plan you can rebuild.",
  },
  {
    value: "custom",
    label: "Custom days",
    hint: "Choose exactly how many days to plan.",
  },
];

export const PREP_LEVELS: Array<{ value: PrepLevel; label: string; hint: string }> = [
  {
    value: "just_starting",
    label: "Just starting",
    hint: "Most of the syllabus still needs a first pass.",
  },
  {
    value: "some_progress",
    label: "Some progress",
    hint: "You have covered parts of it and need to finish the rest.",
  },
  {
    value: "revision_ready",
    label: "Revision ready",
    hint: "The first pass is largely done. Keep time for revision and tests.",
  },
];

export function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

export function defaultSubjects(): RoadmapSubject[] {
  return [
    {
      id: "sub-mathematics",
      name: "Mathematics",
      examImportance: 5,
      chapters: [
        { id: "ch-math-algebra", name: "Algebra", difficulty: 3, remainingMinutes: 180 },
        { id: "ch-math-geometry", name: "Geometry", difficulty: 4, remainingMinutes: 180 },
        { id: "ch-math-trig", name: "Trigonometry", difficulty: 4, remainingMinutes: 150 },
        { id: "ch-math-stats", name: "Statistics", difficulty: 2, remainingMinutes: 90 },
      ],
    },
    {
      id: "sub-science",
      name: "Science",
      examImportance: 5,
      chapters: [
        { id: "ch-sci-physics", name: "Physics", difficulty: 4, remainingMinutes: 180 },
        { id: "ch-sci-chemistry", name: "Chemistry", difficulty: 3, remainingMinutes: 150 },
        { id: "ch-sci-biology", name: "Biology", difficulty: 3, remainingMinutes: 150 },
      ],
    },
    {
      id: "sub-english",
      name: "English",
      examImportance: 3,
      chapters: [
        { id: "ch-eng-grammar", name: "Grammar", difficulty: 2, remainingMinutes: 90 },
        { id: "ch-eng-literature", name: "Literature", difficulty: 3, remainingMinutes: 120 },
        { id: "ch-eng-writing", name: "Writing", difficulty: 2, remainingMinutes: 90 },
      ],
    },
  ];
}

export function emptyCommitment(): RoadmapCommitment {
  return {
    id: createId("commit"),
    label: "Sports / class",
    weekday: 2,
    startMinutes: 17 * 60,
    endMinutes: 18 * 60 + 30,
  };
}

export function defaultHorizon(): RoadmapHorizon {
  return { kind: "until_exam" };
}

export function defaultIntake(examDate: string): RoadmapIntake {
  return {
    examName: "",
    examDate,
    horizon: defaultHorizon(),
    subjects: defaultSubjects(),
    prepLevel: "just_starting",
    dailyHours: 3,
    commitments: [],
    preferredStudyHours: { startMinutes: 16 * 60, endMinutes: 21 * 60 },
    sleepWindow: { startMinutes: 22 * 60, endMinutes: 6 * 60 },
    bufferWeekday: 0,
    focusMinutes: 50,
    breakMinutes: 10,
    practiceTestMinutes: 45,
    revisionRatio: 0.25,
    finalRevisionDays: 3,
    rhythm: {},
  };
}

export function cloneIntake(intake: RoadmapIntake): RoadmapIntake {
  return structuredClone(intake);
}
