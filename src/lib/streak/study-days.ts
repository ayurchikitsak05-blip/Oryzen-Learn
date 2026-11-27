import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";
import type { SprintSession } from "@/lib/sprint/types";

/**
 * Week stamps and the study streak (owner, 27 Nov 2026). No AI and no server: minutes come
 * from the study timer plus active minutes in the reader and lectures, kept in the private
 * account vault on this device.
 */
export const STUDY_DAYS_KEY = "oryzen_study_days_v1";
/** Minutes of study that earn the day's stamp. */
export const STAMP_MINUTES = 10;
/** Keep about four months of days. */
const KEEP_DAYS = 120;

export type StudyDays = Record<string, number>;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

function dayFromNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(day: string, delta: number): string {
  return dayFromNumber(dayNumber(day) + delta);
}

export function parseStudyDays(raw: string | null): StudyDays {
  try {
    const parsed = JSON.parse(raw ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: StudyDays = {};
    for (const [day, minutes] of Object.entries(parsed as Record<string, unknown>)) {
      if (DAY_RE.test(day) && typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) {
        out[day] = Math.min(24 * 60, Math.floor(minutes));
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function readStudyDays(userId: string | null): StudyDays {
  if (typeof window === "undefined") return {};
  return parseStudyDays(readPrivateString(STUDY_DAYS_KEY, userId));
}

/** Adds active minutes to a day, dropping days older than KEEP_DAYS. */
export function addActiveMinutes(days: StudyDays, day: string, minutes = 1): StudyDays {
  if (!DAY_RE.test(day) || minutes <= 0) return days;
  const oldest = addDays(day, -KEEP_DAYS);
  const next: StudyDays = {};
  for (const [key, value] of Object.entries(days)) if (key >= oldest) next[key] = value;
  next[day] = Math.min(24 * 60, (next[day] ?? 0) + minutes);
  return next;
}

export function recordActiveMinute(userId: string | null, day: string): void {
  if (!userId || typeof window === "undefined") return;
  const next = addActiveMinutes(readStudyDays(userId), day, 1);
  writePrivateString(STUDY_DAYS_KEY, JSON.stringify(next), userId);
}

/** Minutes per day: the larger of timer minutes and active reading/lecture minutes (they overlap). */
export function minutesByDay(sessions: readonly SprintSession[], active: StudyDays): StudyDays {
  const timer: StudyDays = {};
  for (const session of sessions) {
    if (!DAY_RE.test(session.date)) continue;
    timer[session.date] = (timer[session.date] ?? 0) + Math.floor((session.elapsedMs ?? 0) / 60_000);
  }
  const out: StudyDays = {};
  for (const day of new Set([...Object.keys(timer), ...Object.keys(active)])) {
    const minutes = Math.max(timer[day] ?? 0, active[day] ?? 0);
    if (minutes > 0) out[day] = minutes;
  }
  return out;
}

export type WeekStamp = {
  day: string;
  /** M T W T F S S */
  label: string;
  minutes: number;
  state: "stamped" | "today" | "missed" | "future";
};

/** Monday-to-Sunday stamps for the week that contains `today`. */
export function weekStamps(today: string, days: StudyDays, threshold = STAMP_MINUTES): WeekStamp[] {
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const monday = addDays(today, -weekday);
  return "MTWTFSS".split("").map((label, index) => {
    const day = addDays(monday, index);
    const minutes = days[day] ?? 0;
    const state: WeekStamp["state"] =
      minutes >= threshold ? "stamped" : day === today ? "today" : day > today ? "future" : "missed";
    return { day, label, minutes, state };
  });
}

/**
 * Days in a row with a stamp, ending today; if today has no stamp yet, ending yesterday
 * (the streak isn't lost until the day is over).
 */
export function currentStreak(today: string, days: StudyDays, threshold = STAMP_MINUTES): number {
  let day = (days[today] ?? 0) >= threshold ? today : addDays(today, -1);
  let count = 0;
  while ((days[day] ?? 0) >= threshold && count < KEEP_DAYS + 1) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}
