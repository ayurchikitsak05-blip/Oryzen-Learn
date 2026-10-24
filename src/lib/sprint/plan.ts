import type { Dosha } from "@/lib/prakriti/config";
import { DOSHA_STUDY_PRESETS } from "@/lib/prakriti/config";
import {
  SPRINT_DURATIONS,
  type SprintDuration,
  type SprintRhythm,
  type SprintSession,
} from "./types";

export const RHYTHM_COPY: Record<
  SprintRhythm,
  { label: string; hint: string; inspiredBy: string }
> = {
  spark: {
    label: "Short and varied",
    hint: "Shorter blocks, visual explanations, and a change of activity between them.",
    inspiredBy: "Inspired by the Spark & Sprint (Vata) preference. You can change this anytime.",
  },
  laser: {
    label: "Goal-oriented and structured",
    hint: "Clear targets, longer focus, and a quiz or revision check at the end.",
    inspiredBy: "Inspired by the Laser & Logic (Pitta) preference. You can change this anytime.",
  },
  anchor: {
    label: "Steady and gradual",
    hint: "A gentle start, then longer unbroken reading once you are underway.",
    inspiredBy: "Inspired by the Anchor & Endurance (Kapha) preference. You can change this anytime.",
  },
  custom: {
    label: "My own rhythm",
    hint: "Pick any session length and daily target. Recommendations stay optional.",
    inspiredBy: "Your settings are not a measure of ability.",
  },
};

export function nearestDuration(minutes: number): SprintDuration {
  const target = Number.isFinite(minutes) ? minutes : 25;
  return SPRINT_DURATIONS.reduce((best, current) =>
    Math.abs(current - target) < Math.abs(best - target) ? current : best
  );
}

export function rhythmFromDosha(dosha?: Dosha | null): SprintRhythm {
  if (dosha === "Vata") return "spark";
  if (dosha === "Pitta") return "laser";
  if (dosha === "Kapha") return "anchor";
  return "custom";
}

export function suggestSprintDefaults(dosha?: Dosha | null): {
  duration: SprintDuration;
  breakMinutes: number;
  dailyTargetMinutes: number;
  rhythm: SprintRhythm;
} {
  const rhythm = rhythmFromDosha(dosha);
  if (!dosha) {
    return { duration: 25, breakMinutes: 5, dailyTargetMinutes: 90, rhythm };
  }
  const pomodoro = DOSHA_STUDY_PRESETS[dosha].pomodoro;
  return {
    duration: nearestDuration(pomodoro.studySprintMinutes),
    breakMinutes: Math.min(15, Math.max(3, pomodoro.breakMinutes)),
    dailyTargetMinutes: Math.min(240, Math.max(45, pomodoro.studySprintMinutes * 3)),
    rhythm,
  };
}

export function splitDailyTarget(
  dailyTargetMinutes: number,
  sessionMinutes: SprintDuration
): { count: number; lastMinutes: number; blocks: number[] } {
  const daily = Math.min(360, Math.max(15, Math.round(dailyTargetMinutes)));
  const blocks: number[] = [];
  let remaining = daily;
  while (remaining > 0) {
    const next = remaining >= sessionMinutes ? sessionMinutes : remaining;
    blocks.push(next);
    remaining -= next;
  }
  return {
    count: blocks.length,
    lastMinutes: blocks[blocks.length - 1] ?? sessionMinutes,
    blocks,
  };
}

export function todayKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sessionsOnDate(sessions: readonly SprintSession[], date: string): SprintSession[] {
  return sessions.filter((session) => session.date === date);
}

export function studiedMinutesOnDate(sessions: readonly SprintSession[], date: string): number {
  return sessionsOnDate(sessions, date).reduce(
    (sum, session) => sum + Math.floor(session.elapsedMs / 60_000),
    0
  );
}

export function pendingSessions(sessions: readonly SprintSession[], date: string): SprintSession[] {
  return sessionsOnDate(sessions, date).filter((session) => session.status !== "completed");
}

export function activeSession(sessions: readonly SprintSession[]): SprintSession | null {
  return (
    sessions.find((session) => session.status === "running" || session.status === "break") ??
    sessions.find((session) => session.status === "paused") ??
    null
  );
}

export function readerHref(session: Pick<SprintSession, "subject" | "chapter" | "id">): string {
  const params = new URLSearchParams();
  if (session.subject) params.set("subject", session.subject);
  if (session.chapter) params.set("chapter", session.chapter);
  params.set("sprint", session.id);
  return `/reader?${params.toString()}`;
}

export function quizHref(session: Pick<SprintSession, "subject" | "chapter" | "id">): string {
  const params = new URLSearchParams();
  if (session.subject) params.set("subject", session.subject);
  if (session.chapter) params.set("chapter", session.chapter);
  params.set("sprint", session.id);
  params.set("lens", "test_me");
  return `/reader?${params.toString()}`;
}

export function notesHref(session: Pick<SprintSession, "subject" | "chapter" | "id">): string {
  const params = new URLSearchParams();
  if (session.subject) params.set("subject", session.subject);
  if (session.chapter) params.set("chapter", session.chapter);
  params.set("sprint", session.id);
  return `/notes?${params.toString()}`;
}
