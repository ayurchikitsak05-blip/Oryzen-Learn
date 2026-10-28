export interface StudyProgressFacts {
  books: string[];
  todayMinutes: number;
  dailyGoalMinutes: number | null;
  sprintCount: number;
  completedSprints: number;
  openSprintLabel: string | null;
  highlightCount: number;
  marginNoteCount: number;
  savedPassageCount: number;
  quizzesCompleted: number;
  quizzesStarted: number;
  weakConcepts: string[];
  captionLectureCount: number;
  planCompleted: number | null;
  planTotal: number | null;
  savedDailyGoal: number | null;
  examDate: string | null;
}

export const EMPTY_STUDY_PROGRESS: StudyProgressFacts = {
  books: [],
  todayMinutes: 0,
  dailyGoalMinutes: null,
  sprintCount: 0,
  completedSprints: 0,
  openSprintLabel: null,
  highlightCount: 0,
  marginNoteCount: 0,
  savedPassageCount: 0,
  quizzesCompleted: 0,
  quizzesStarted: 0,
  weakConcepts: [],
  captionLectureCount: 0,
  planCompleted: null,
  planTotal: null,
  savedDailyGoal: null,
  examDate: null,
};

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function bookLine(books: readonly string[]): string | null {
  if (books.length === 0) return null;
  const shown = books.slice(0, 6);
  const extra = books.length - shown.length;
  const list = extra > 0 ? `${shown.join(", ")}, and ${extra} more` : shown.join(", ");
  return `Books on this device: ${list}.`;
}

/** Lines come only from counts the caller already read. Zero counts stay off the page. */
export function studyProgressLines(facts: StudyProgressFacts): string[] {
  const lines: string[] = [];
  const books = bookLine(facts.books);
  if (books) lines.push(books);
  if (facts.todayMinutes > 0) {
    lines.push(
      facts.dailyGoalMinutes != null
        ? `Recorded today: ${facts.todayMinutes} of ${facts.dailyGoalMinutes} minutes.`
        : `Recorded today: ${facts.todayMinutes} minutes.`
    );
  } else if (facts.sprintCount > 0) {
    lines.push("A Study Sprint is saved. No focused minutes are recorded today.");
  }
  if (facts.completedSprints > 0) {
    lines.push(`${plural(facts.completedSprints, "Study Sprint", "Study Sprints")} marked complete.`);
  }
  if (facts.openSprintLabel) {
    lines.push(`Open sprint: ${facts.openSprintLabel}.`);
  }
  if (facts.highlightCount > 0) {
    lines.push(`${plural(facts.highlightCount, "highlight", "highlights")} saved.`);
  }
  if (facts.marginNoteCount > 0) {
    lines.push(`${plural(facts.marginNoteCount, "margin note", "margin notes")} saved.`);
  }
  if (facts.savedPassageCount > 0) {
    lines.push(`${plural(facts.savedPassageCount, "saved passage", "saved passages")} in the notebook.`);
  }
  if (facts.quizzesCompleted > 0) {
    lines.push(`${plural(facts.quizzesCompleted, "quiz", "quizzes")} completed.`);
  } else if (facts.quizzesStarted > 0) {
    lines.push(`${plural(facts.quizzesStarted, "quiz", "quizzes")} started. None completed.`);
  }
  if (facts.weakConcepts.length > 0) {
    lines.push(`Recorded misses: ${facts.weakConcepts.join(", ")}.`);
  }
  if (facts.captionLectureCount > 0) {
    lines.push(
      `${plural(facts.captionLectureCount, "lecture", "lectures")} with caption notes.`
    );
  }
  if (facts.planTotal != null && facts.planTotal > 0) {
    lines.push(
      facts.planCompleted && facts.planCompleted > 0
        ? `Study plan: ${facts.planCompleted} of ${facts.planTotal} work sessions marked complete.`
        : "A study plan is saved. No work sessions are marked complete."
    );
  }
  if (facts.examDate) {
    lines.push(`Saved exam date: ${facts.examDate}.`);
  }
  if (
    facts.savedDailyGoal != null &&
    facts.todayMinutes === 0 &&
    facts.sprintCount === 0 &&
    facts.planTotal == null
  ) {
    lines.push(
      `A daily goal of ${facts.savedDailyGoal} minutes is saved. No focused minutes are recorded today.`
    );
  }
  return lines;
}

export function studyProgressIsEmpty(facts: StudyProgressFacts): boolean {
  return studyProgressLines(facts).length === 0;
}
