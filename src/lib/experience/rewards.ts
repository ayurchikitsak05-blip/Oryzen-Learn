import type { LearningQuiz, LearningRecord } from "./record";

export interface DatedItem {
  id: string;
  title: string;
  detail: string;
  category: string;
  earned: boolean;
  earnedAt: string | null;
}

export interface GardenElement {
  id: string;
  label: string;
  kind: "plant" | "flower" | "stone" | "path";
}

export interface QuizComparison {
  earlier: LearningQuiz;
  later: LearningQuiz;
  reviewListShorter: boolean;
  reviewListLonger: boolean;
}

export interface LearningEvaluation {
  stickers: DatedItem[];
  badges: DatedItem[];
  titles: DatedItem[];
  garden: GardenElement[];
  passport: DatedItem[];
  quizComparison: QuizComparison | null;
  minutesByDay: { date: string; minutes: number }[];
  personalBest: { date: string; minutes: number } | null;
  weeklyMinutes: number;
  monthlyMinutes: number;
  distinctStudyDates: string[];
  backgrounds: string[];
  desks: string[];
  walls: string[];
  petAccessories: string[];
  companionAccessories: string[];
}

function earliest(dates: Array<string | null | undefined> | undefined): string | null {
  const valid = (dates ?? []).filter((value): value is string => Boolean(value) && !Number.isNaN(Date.parse(value ?? "")));
  if (valid.length === 0) return null;
  return valid.slice().sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
}

function item(
  id: string,
  title: string,
  detail: string,
  category: string,
  earned: boolean,
  earnedAt: string | null
): DatedItem {
  return { id, title, detail, category, earned, earnedAt: earned ? earnedAt : null };
}

function dayKey(value: string): string | null {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString().slice(0, 10);
}

function scienceNamed(record: LearningRecord): boolean {
  const names = [
    ...(record.roadmap?.subjects.map((subject) => subject.name) ?? []),
    ...(record.roadmap?.completedSessions.map((session) => `${session.subjectName} ${session.chapterName}`) ?? []),
  ];
  return names.some((name) => /\b(physics|chemistry|biology|science)\b/i.test(name));
}

export function completedChapters(record: LearningRecord): { id: string; name: string; at: string | null }[] {
  const fromSessions = (record.roadmap?.completedSessions ?? [])
    .filter((session) => session.chapterName.trim().length > 0)
    .map((session) => ({
      id: session.id,
      name: session.chapterName,
      at: session.completedAt,
    }));
  const fromFlags = (record.roadmap?.subjects ?? []).flatMap((subject) =>
    subject.chapters
      .filter((chapter) => chapter.completed)
      .map((chapter) => ({ id: chapter.id, name: chapter.name, at: record.roadmap?.updatedAt ?? null }))
  );
  const seen = new Set<string>();
  const chapters = [];
  for (const chapter of [...fromSessions, ...fromFlags]) {
    const key = chapter.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    chapters.push(chapter);
  }
  return chapters;
}

export function masteredSubjects(record: LearningRecord): { id: string; name: string }[] {
  return (record.roadmap?.subjects ?? []).filter((subject) => {
    if (subject.chapters.length === 0) return false;
    return subject.chapters.every((chapter) => chapter.completed);
  });
}

export function quizComparison(quizzes: readonly LearningQuiz[]): QuizComparison | null {
  const completed = quizzes
    .filter((quiz) => quiz.completed && !Number.isNaN(Date.parse(quiz.updatedAt)))
    .slice()
    .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt));
  if (completed.length < 2) return null;
  const earlier = completed[0];
  const later = completed[completed.length - 1];
  if (!earlier || !later || earlier.id === later.id) return null;
  return {
    earlier,
    later,
    reviewListShorter: later.weakCount < earlier.weakCount,
    reviewListLonger: later.weakCount > earlier.weakCount,
  };
}

function studyDates(record: LearningRecord): string[] {
  const dates = new Set<string>();
  for (const day of record.sprintDays) {
    if (day.minutes > 0) dates.add(day.date);
  }
  for (const note of record.notes) {
    const key = dayKey(note.createdAt);
    if (key) dates.add(key);
  }
  for (const session of record.roadmap?.completedSessions ?? []) {
    const key = dayKey(session.completedAt);
    if (key) dates.add(key);
  }
  return [...dates].sort();
}

export function evaluateLearning(record: LearningRecord, today: string): LearningEvaluation {
  const chapters = completedChapters(record);
  const firstChapter = chapters.slice().sort((left, right) => Date.parse(left.at ?? "") - Date.parse(right.at ?? ""))[0] ?? null;
  const firstNote = record.notes.slice().sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))[0] ?? null;
  const firstBook = record.books.slice().sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))[0] ?? null;
  const revisions = (record.roadmap?.completedSessions ?? []).filter((session) => session.kind === "revision");
  const firstRevision = revisions[0] ?? null;
  const comparison = quizComparison(record.quizzes);
  const planned = record.roadmap?.plannedStudyCount ?? 0;
  const finishedPlan =
    planned > 0 && (record.roadmap?.completedSessions.length ?? 0) >= planned;
  const subjects = masteredSubjects(record);
  const dates = studyDates(record);
  const minutes = record.sprintDays.filter((day) => day.minutes > 0).slice().sort((left, right) => left.date.localeCompare(right.date));
  const personalBest = minutes.reduce<{ date: string; minutes: number } | null>((best, day) => {
    if (!best || day.minutes > best.minutes) return day;
    return best;
  }, null);
  const todayTime = Date.parse(`${today}T00:00:00.000Z`);
  const weeklyMinutes = minutes
    .filter((day) => {
      const time = Date.parse(`${day.date}T00:00:00.000Z`);
      return !Number.isNaN(time) && todayTime - time <= 6 * 86_400_000 && todayTime - time >= 0;
    })
    .reduce((sum, day) => sum + day.minutes, 0);
  const month = today.slice(0, 7);
  const monthlyMinutes = minutes
    .filter((day) => day.date.startsWith(month))
    .reduce((sum, day) => sum + day.minutes, 0);
  const stickers: DatedItem[] = [
    item("read-book", "Open book", "A book is saved on this account.", "reading", record.books.length > 0, firstBook?.createdAt ?? null),
    item("read-note", "Margin note", "A note is saved on this account.", "reading", record.notes.length > 0, firstNote?.createdAt ?? null),
    item("read-mark", "Highlight", "A highlight is saved on this account.", "reading", record.highlightCount > 0, null),
    item("revise-pass", "Revision pass", "A revision block on the saved plan is marked complete.", "revision", revisions.length > 0, firstRevision?.completedAt ?? null),
    item("quiz-saved", "Saved quiz", "A quiz on a passage is saved.", "quizzes", record.quizzes.some((quiz) => quiz.completed), earliest(record.quizzes.filter((quiz) => quiz.completed).map((quiz) => quiz.updatedAt))),
    item("quiz-shorter", "Shorter review list", "A later saved quiz lists fewer concepts to review than an earlier one.", "quizzes", comparison?.reviewListShorter === true, comparison?.reviewListShorter ? comparison.later.updatedAt : null),
    item("plan-saved", "Study plan", "An exam plan is saved.", "study planning", Boolean(record.roadmap), record.roadmap?.updatedAt ?? null),
    item("plan-done", "Plan complete", "Every study, revision, and practice block on the saved plan is marked complete.", "study planning", finishedPlan, finishedPlan ? earliest(record.roadmap?.completedSessions.map((session) => session.completedAt)) : null),
    item("subject-mastered", "Subject mastered", "Every chapter on a saved subject is marked complete.", "subject mastery", subjects.length > 0, subjects.length > 0 ? record.roadmap?.updatedAt ?? null : null),
    item("chapter-one", "First chapter", "A chapter on the saved plan is complete.", "milestones", chapters.length > 0, firstChapter?.at ?? null),
    item("three-days", "Three study days", "Study is recorded on three different dates. Missed days stay on the calendar and do not remove this.", "milestones", dates.length >= 3, dates[2] ?? null),
    item("personal-best", "Personal best", "One recorded day has more study minutes than the other recorded days.", "milestones", Boolean(personalBest && minutes.length > 1), personalBest && minutes.length > 1 ? personalBest.date : null),
  ];

  const badges: DatedItem[] = [
    item("badge-chapter", "First chapter completed", chapters[0] ? `Chapter: ${chapters[0].name}` : "Complete a chapter on the saved plan.", "milestones", chapters.length > 0, firstChapter?.at ?? null),
    item("badge-note", "First saved note", firstNote ? "A note is in this account." : "Save a note in the reader.", "reading", Boolean(firstNote), firstNote?.createdAt ?? null),
    item("badge-revision", "First successful revision", "A revision block on the saved plan is marked complete.", "revision", revisions.length > 0, firstRevision?.completedAt ?? null),
    item("badge-quiz", "Quiz improvement", "A later saved quiz lists fewer concepts to review. This is not a percentage score.", "quizzes", comparison?.reviewListShorter === true, comparison?.reviewListShorter ? comparison.later.updatedAt : null),
    item("badge-plan", "Study-plan completion", "Every study, revision, and practice block on the saved plan is marked complete.", "study planning", finishedPlan, finishedPlan ? record.roadmap?.updatedAt ?? null : null),
    item("badge-subject", "Subject mastery", subjects[0] ? `Subject: ${subjects[0].name}` : "Mark every chapter of one saved subject complete.", "subject mastery", subjects.length > 0, subjects.length > 0 ? record.roadmap?.updatedAt ?? null : null),
    item("badge-consistent", "Consistent learning", "Study, notes, or completed plan blocks are recorded on three different dates.", "milestones", dates.length >= 3, dates[2] ?? null),
    item("badge-best", "Personal best", "A later recorded day has more minutes than an earlier recorded day.", "milestones", Boolean(personalBest && minutes.length > 1), personalBest && minutes.length > 1 ? personalBest.date : null),
  ];

  const titles: DatedItem[] = [
    item("title-explorer", "Curious Explorer", "A book is saved on this account.", "titles", record.books.length > 0, firstBook?.createdAt ?? null),
    item("title-consistent", "Consistent Learner", "Learning is recorded on three different dates.", "titles", dates.length >= 3, dates[2] ?? null),
    item("title-revision", "Revision Champion", "A revision block on the saved plan is marked complete.", "titles", revisions.length > 0, firstRevision?.completedAt ?? null),
    item("title-science", "Science Explorer", "A saved physics, chemistry, biology, or science subject has a completed chapter or block.", "titles", scienceNamed(record) && (chapters.length > 0 || revisions.length > 0 || (record.roadmap?.completedSessions.length ?? 0) > 0), earliest(record.roadmap?.completedSessions.map((session) => session.completedAt))),
  ];

  const plants = Math.min(6, record.books.length + Math.min(3, record.notes.length) + (record.highlightCount > 0 ? 1 : 0));
  const flowers = Math.min(6, revisions.length);
  const stones = Math.min(6, chapters.length);
  const garden: GardenElement[] = [
    ...Array.from({ length: plants }, (_, index) => ({ id: `plant-${index + 1}`, label: "Reading", kind: "plant" as const })),
    ...Array.from({ length: flowers }, (_, index) => ({ id: `flower-${index + 1}`, label: "Revision", kind: "flower" as const })),
    ...Array.from({ length: stones }, (_, index) => ({ id: `stone-${index + 1}`, label: "Chapter", kind: "stone" as const })),
  ];
  if ((record.roadmap?.completedSessions.length ?? 0) > 0) {
    garden.push({ id: "path", label: "Plan progress", kind: "path" });
  }

  const passport = [...badges, ...titles].filter((entry) => entry.earned);

  const anyBadge = badges.some((badge) => badge.earned);
  const longDay = minutes.some((day) => day.minutes >= 25);

  return {
    stickers,
    badges,
    titles,
    garden,
    passport,
    quizComparison: comparison,
    minutesByDay: minutes,
    personalBest: personalBest && minutes.length > 0 ? personalBest : null,
    weeklyMinutes,
    monthlyMinutes,
    distinctStudyDates: dates,
    backgrounds: ["paper", ...(longDay ? ["dusk"] : []), ...(flowers > 0 ? ["meadow"] : [])],
    desks: ["plain", ...(record.books.length > 0 ? ["books"] : [])],
    walls: ["clear", ...(record.notes.length > 0 ? ["notes"] : [])],
    petAccessories: ["none", ...(anyBadge ? ["ribbon"] : []), ...(chapters.length > 0 ? ["satchel"] : [])],
    companionAccessories: ["none", ...(record.notes.length > 0 ? ["ribbon"] : []), ...(anyBadge ? ["pin"] : [])],
  };
}

export function earnedIds(items: readonly DatedItem[]): string[] {
  return items.filter((item) => item.earned).map((item) => item.id);
}
