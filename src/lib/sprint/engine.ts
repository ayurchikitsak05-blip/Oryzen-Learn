import { formatClock } from "@/lib/study/scheduler";
import { todayKey } from "./plan";
import type { SprintDuration, SprintSession, SprintStatus } from "./types";

export function newSprintId(now = Date.now()): string {
  return `sprint-${now.toString(36)}`;
}

export function createSprintSession(input: {
  goal: string;
  subject?: string;
  topic?: string;
  documentId?: string;
  documentTitle?: string;
  chapter?: string;
  durationMinutes: SprintDuration;
  breakMinutes?: number;
  dailyTargetMinutes?: number;
  date?: string;
}): SprintSession {
  const goal = input.goal.replace(/\s+/g, " ").trim() || "Study this passage";
  return {
    id: newSprintId(),
    goal,
    subject: (input.subject ?? "").trim(),
    topic: (input.topic ?? "").trim(),
    documentId: (input.documentId ?? "").trim(),
    documentTitle: (input.documentTitle ?? "").trim(),
    chapter: (input.chapter ?? "").trim(),
    durationMinutes: input.durationMinutes,
    breakMinutes: Math.min(15, Math.max(3, input.breakMinutes ?? 5)),
    dailyTargetMinutes: Math.min(360, Math.max(15, input.dailyTargetMinutes ?? 90)),
    status: "planned",
    elapsedMs: 0,
    startedAt: null,
    completedAt: null,
    date: input.date ?? todayKey(),
    quizLinked: false,
    notesLinked: false,
  };
}

export function liveElapsedMs(session: SprintSession, now = Date.now()): number {
  if (session.status === "running" && session.startedAt) {
    const started = Date.parse(session.startedAt);
    if (Number.isFinite(started)) {
      return session.elapsedMs + Math.max(0, now - started);
    }
  }
  return session.elapsedMs;
}

export function remainingMs(session: SprintSession, now = Date.now()): number {
  const limit = session.durationMinutes * 60_000;
  return Math.max(0, limit - liveElapsedMs(session, now));
}

export function startSprint(session: SprintSession, now = Date.now()): SprintSession {
  if (session.status === "completed") return session;
  return {
    ...session,
    status: "running",
    startedAt: new Date(now).toISOString(),
  };
}

export function pauseSprint(session: SprintSession, now = Date.now()): SprintSession {
  if (session.status !== "running") return session;
  return {
    ...session,
    status: "paused",
    elapsedMs: liveElapsedMs(session, now),
    startedAt: null,
  };
}

export function resumeSprint(session: SprintSession, now = Date.now()): SprintSession {
  if (session.status !== "paused" && session.status !== "break") return session;
  return {
    ...session,
    status: "running",
    startedAt: new Date(now).toISOString(),
  };
}

export function completeSprint(session: SprintSession, now = Date.now()): SprintSession {
  return {
    ...session,
    status: "completed",
    elapsedMs: Math.max(session.elapsedMs, liveElapsedMs(session, now)),
    startedAt: null,
    completedAt: new Date(now).toISOString(),
  };
}

export function beginBreak(session: SprintSession, now = Date.now()): SprintSession {
  return {
    ...session,
    status: "break",
    elapsedMs: liveElapsedMs(session, now),
    startedAt: new Date(now).toISOString(),
  };
}

export function tickSprint(session: SprintSession, now = Date.now()): SprintSession {
  if (session.status === "running" && remainingMs(session, now) <= 0) {
    return beginBreak(
      {
        ...session,
        elapsedMs: session.durationMinutes * 60_000,
        startedAt: null,
      },
      now
    );
  }
  if (session.status === "break" && session.startedAt) {
    const started = Date.parse(session.startedAt);
    if (Number.isFinite(started) && now - started >= session.breakMinutes * 60_000) {
      return completeSprint(session, now);
    }
  }
  return session;
}

export function markQuizLinked(session: SprintSession): SprintSession {
  return { ...session, quizLinked: true };
}

export function markNotesLinked(session: SprintSession): SprintSession {
  return { ...session, notesLinked: true };
}

export function formatSprintClock(session: SprintSession, now = Date.now()): string {
  return formatClock(remainingMs(session, now));
}

export function statusLabel(status: SprintStatus): string {
  if (status === "running") return "In progress";
  if (status === "paused") return "Paused";
  if (status === "break") return "Break";
  if (status === "completed") return "Completed";
  return "Ready";
}
