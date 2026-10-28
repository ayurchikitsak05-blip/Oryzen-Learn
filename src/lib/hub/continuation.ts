import { readLocalRoadmap } from "@/lib/roadmap/persist";
import type { RoadmapRecord, RoadmapSession } from "@/lib/roadmap/types";
import { activeSession, nextRecommendedBlock, studiedMinutesOnDate } from "@/lib/sprint/plan";
import { readSprintStore } from "@/lib/sprint/persist";
import type { SprintSession } from "@/lib/sprint/types";
import { readDayPlan } from "@/lib/universe/persist";

export interface HomeContinuation {
  bookTitle: string | null;
  sprintLabel: string | null;
  nextBlock: string | null;
  studiedMinutes: number | null;
  dailyGoal: number | null;
}

function unfinishedStudy(sessions: readonly RoadmapSession[], completions: RoadmapRecord["completions"]) {
  return sessions.find(
    (session) =>
      (session.kind === "study" || session.kind === "revision" || session.kind === "practice_test") &&
      !completions[session.id]
  );
}

export function planSummary(roadmap: RoadmapRecord | null, date: string): string | null {
  if (!roadmap) return null;
  const today = roadmap.plan.days.find((day) => day.date === date);
  const next = today ? unfinishedStudy(today.sessions, roadmap.completions) : undefined;
  if (next) {
    const subject = next.subjectName ? `${next.subjectName}: ` : "";
    return `${subject}${next.title}`;
  }
  const exam = roadmap.intake.examName.replace(/\s+/g, " ").trim();
  return exam ? `Study plan: ${exam}` : "A study plan is saved.";
}

function cleanGoal(goal: string): string {
  return goal.replace(/\s+/g, " ").trim();
}

export function sprintSummary(sessions: readonly SprintSession[], date: string): string | null {
  const active = activeSession(sessions);
  const activeGoal = active ? cleanGoal(active.goal) : "";
  if (active && activeGoal) {
    if (active.status === "running") return `Study Sprint: ${activeGoal}`;
    if (active.status === "paused") return `Study Sprint paused: ${activeGoal}`;
    if (active.status === "break") return `Study Sprint break: ${activeGoal}`;
  }
  const completed = sessions.filter((session) => session.status === "completed" && cleanGoal(session.goal));
  const today = completed.filter((session) => session.date === date);
  const latest = (today.length > 0 ? today : completed).at(-1);
  const goal = latest ? cleanGoal(latest.goal) : "";
  return goal ? `Study Sprint complete: ${goal}` : null;
}

export function describeHomeContinuation(input: {
  sessions: readonly SprintSession[];
  dailyTargetMinutes: number;
  dayGoalMinutes: number | null;
  roadmap: RoadmapRecord | null;
  bookTitle: string | null;
  date: string;
  nextBlockHint: string | null;
}): HomeContinuation {
  const hasSprint = input.sessions.length > 0;
  const planLine = planSummary(input.roadmap, input.date);
  const sprintLabel = sprintSummary(input.sessions, input.date);
  const activityHint = hasSprint || input.dayGoalMinutes != null ? input.nextBlockHint : null;
  return {
    bookTitle: input.bookTitle,
    sprintLabel,
    nextBlock: planLine ?? activityHint,
    studiedMinutes: hasSprint ? studiedMinutesOnDate(input.sessions, input.date) : null,
    dailyGoal: input.dayGoalMinutes ?? (hasSprint ? input.dailyTargetMinutes : null),
  };
}

/** Reads the account vault. A locked vault returns an empty summary, not guessed activity. */
export function readHomeContinuation(
  userId: string | null,
  date: string,
  bookTitle: string | null
): HomeContinuation {
  const sprint = readSprintStore(userId);
  const dayPlan = readDayPlan(userId);
  const roadmap = readLocalRoadmap(userId);
  const goal = dayPlan?.dailyGoalMinutes ?? sprint.dailyTargetMinutes;
  const next = nextRecommendedBlock(sprint.sessions, goal, sprint.preferredDuration, date);
  return describeHomeContinuation({
    sessions: sprint.sessions,
    dailyTargetMinutes: sprint.dailyTargetMinutes,
    dayGoalMinutes: dayPlan?.dailyGoalMinutes ?? null,
    roadmap,
    bookTitle,
    date,
    nextBlockHint: next.hint,
  });
}
