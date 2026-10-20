export type SchedulePhase = "idle" | "focus" | "break" | "complete";

export type ScheduleAlert = "break" | "resume" | "goal";

export interface StudySchedule {
  goalMinutes: number;
  focusMinutes: number;
  breakMinutes: number;
  phase: SchedulePhase;
  phaseEndsAt: number | null;
  focusedMs: number;
}

const MINUTE_MS = 60_000;

export function createIdleSchedule(
  partial?: Partial<Pick<StudySchedule, "goalMinutes" | "focusMinutes" | "breakMinutes">>
): StudySchedule {
  return {
    goalMinutes: partial?.goalMinutes ?? 240,
    focusMinutes: partial?.focusMinutes ?? 20,
    breakMinutes: partial?.breakMinutes ?? 10,
    phase: "idle",
    phaseEndsAt: null,
    focusedMs: 0,
  };
}

function clampMinutes(value: number, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sanitizeSchedule(value: unknown): StudySchedule | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<StudySchedule>;
  const phase = raw.phase;
  if (phase !== "idle" && phase !== "focus" && phase !== "break" && phase !== "complete") {
    return null;
  }
  const phaseEndsAt =
    typeof raw.phaseEndsAt === "number" && Number.isFinite(raw.phaseEndsAt)
      ? raw.phaseEndsAt
      : null;
  const focusedMs =
    typeof raw.focusedMs === "number" && Number.isFinite(raw.focusedMs)
      ? Math.max(0, raw.focusedMs)
      : 0;
  return {
    goalMinutes: clampMinutes(Number(raw.goalMinutes), 240, 30, 12 * 60),
    focusMinutes: clampMinutes(Number(raw.focusMinutes), 20, 1, 90),
    breakMinutes: clampMinutes(Number(raw.breakMinutes), 10, 1, 30),
    phase,
    phaseEndsAt,
    focusedMs,
  };
}

function advanceOnce(
  schedule: StudySchedule,
  now: number
): { schedule: StudySchedule; alert: ScheduleAlert | null } {
  if (
    schedule.phase === "idle" ||
    schedule.phase === "complete" ||
    schedule.phaseEndsAt == null ||
    now < schedule.phaseEndsAt
  ) {
    return { schedule, alert: null };
  }

  if (schedule.phase === "focus") {
    const focusedMs = schedule.focusedMs + schedule.focusMinutes * MINUTE_MS;
    if (focusedMs >= schedule.goalMinutes * MINUTE_MS) {
      return {
        schedule: {
          ...schedule,
          phase: "complete",
          phaseEndsAt: null,
          focusedMs,
        },
        alert: "goal",
      };
    }
    return {
      schedule: {
        ...schedule,
        phase: "break",
        phaseEndsAt: schedule.phaseEndsAt + schedule.breakMinutes * MINUTE_MS,
        focusedMs,
      },
      alert: "break",
    };
  }

  return {
    schedule: {
      ...schedule,
      phase: "focus",
      phaseEndsAt: schedule.phaseEndsAt + schedule.focusMinutes * MINUTE_MS,
    },
    alert: "resume",
  };
}

export function catchUpSchedule(
  schedule: StudySchedule,
  now: number
): { schedule: StudySchedule; alert: ScheduleAlert | null } {
  let current = schedule;
  let alert: ScheduleAlert | null = null;
  for (let step = 0; step < 500; step += 1) {
    const next = advanceOnce(current, now);
    if (!next.alert) break;
    current = next.schedule;
    alert = next.alert;
    if (current.phase === "complete" || current.phaseEndsAt == null) break;
  }
  return { schedule: current, alert };
}

export function beginFocus(schedule: StudySchedule, now: number): StudySchedule {
  const clean =
    sanitizeSchedule({
      ...schedule,
      phase: "idle",
      phaseEndsAt: null,
      focusedMs: 0,
    }) ?? createIdleSchedule();
  return {
    ...clean,
    phase: "focus",
    phaseEndsAt: now + clean.focusMinutes * MINUTE_MS,
    focusedMs: 0,
  };
}

export function resetSchedule(schedule: StudySchedule): StudySchedule {
  return {
    ...schedule,
    phase: "idle",
    phaseEndsAt: null,
    focusedMs: 0,
  };
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
