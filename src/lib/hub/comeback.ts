/**
 * "Welcome back" after missed days (owner, 15 Nov 2026: reviewers of another app asked to be
 * reminded when they skip days). Kept on this device: only the date of the last visit, no
 * study content. The daily reminder itself is the phone calendar one on the Revise page.
 */

export const LAST_VISIT_KEY = "oryzen_last_visit_v1";
/** Show the nudge from this many whole days away. */
export const COMEBACK_AFTER_DAYS = 2;

interface LastVisit {
  owner: string;
  day: string;
}

function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

/** Whole days missed between the last visit and today (0 = came yesterday or today). */
export function daysMissed(lastDay: string | null, today: string): number {
  if (!lastDay || !/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) return 0;
  const gap = dayNumber(today) - dayNumber(lastDay) - 1;
  return Number.isFinite(gap) ? Math.max(0, gap) : 0;
}

export function comebackMessage(missed: number): { title: string; body: string } | null {
  if (missed < COMEBACK_AFTER_DAYS) return null;
  return {
    title: missed >= 7 ? "Welcome back. Let's restart gently." : `Welcome back. You missed ${missed} days.`,
    body: "No guilt. Start with 5 quick revision cards (about 3 minutes), then pick up your plan.",
  };
}

/** Reads the last visit for this student, then records today. Returns the days missed. */
export function checkInToday(owner: string, today: string, storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()): number {
  if (!storage || !owner) return 0;
  let last: LastVisit | null = null;
  try {
    last = JSON.parse(storage.getItem(LAST_VISIT_KEY) ?? "null") as LastVisit | null;
  } catch {
    last = null;
  }
  const missed = last && last.owner === owner ? daysMissed(last.day, today) : 0;
  try {
    storage.setItem(LAST_VISIT_KEY, JSON.stringify({ owner, day: today }));
  } catch {
    /* private window */
  }
  return missed;
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
