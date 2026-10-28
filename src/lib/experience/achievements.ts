export interface StudyActivitySignals {
  hasBook?: boolean;
  hasNote?: boolean;
  hasRoadmap?: boolean;
  hasSprint?: boolean;
  studiedMinutes?: number | null;
}

export interface StudyAchievement {
  id: string;
  title: string;
  detail: string;
  earned: boolean;
}

/** Badges come only from activity the app already knows about. Unknown signals stay unearned and unclaimed. */
export function achievementsFromSignals(signals: StudyActivitySignals): StudyAchievement[] {
  const minutes = signals.studiedMinutes;
  return [
    {
      id: "first-book",
      title: "Opened a book",
      detail: "A book is in your library.",
      earned: signals.hasBook === true,
    },
    {
      id: "first-note",
      title: "Saved a note",
      detail: "A note is in this account.",
      earned: signals.hasNote === true,
    },
    {
      id: "first-plan",
      title: "Saved a study plan",
      detail: "A roadmap or daily plan is on this account.",
      earned: signals.hasRoadmap === true,
    },
    {
      id: "sprint",
      title: "Started a Study Sprint",
      detail: "A sprint exists for this account.",
      earned: signals.hasSprint === true,
    },
    {
      id: "focus-block",
      title: "Twenty-five focused minutes",
      detail: "Today's recorded study time reached 25 minutes.",
      earned: typeof minutes === "number" && minutes >= 25,
    },
  ];
}
