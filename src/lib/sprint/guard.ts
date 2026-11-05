import { liveElapsedMs, remainingMs } from "./engine";
import type { SprintSession } from "./types";

/**
 * Distraction guard (design board "Welcome back", 3 Nov 2026). No AI.
 * If the student leaves the app for a minute or more during a running sprint, the sprint
 * pauses from the moment they left, and a kind "welcome back" note offers to carry on.
 */

export const FOCUS_GUARD_KEY = "oryzen_focus_guard_v1";
export const FOCUS_GUARD_AWAY_KEY = "oryzen_focus_guard_away_v1";
export const SPRINT_CHANGED_EVENT = "oryzen-sprint-changed";
/** Shorter trips (checking the time, a quick reply) don't count. */
export const AWAY_THRESHOLD_MS = 60_000;

/** Every visible ORYZEN tab writes this every few seconds, so studying in another tab isn't "away". */
export const APP_VISIBLE_HEARTBEAT_KEY = "oryzen_app_visible_at_v1";
export const HEARTBEAT_MS = 5_000;

export function writeVisibleHeartbeat(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(APP_VISIBLE_HEARTBEAT_KEY, String(now));
  } catch {
    /* ignore */
  }
}

export function readVisibleHeartbeat(): number {
  try {
    const value = Number(window.localStorage.getItem(APP_VISIBLE_HEARTBEAT_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/** When the student really left the app: the later of this tab hiding and any other app tab last being seen. */
export function effectiveLeftAt(hiddenAt: number, lastSeenAnyTab: number, now: number): number {
  const seen = lastSeenAnyTab > hiddenAt && lastSeenAnyTab <= now ? lastSeenAnyTab : hiddenAt;
  return seen;
}

export interface FocusGuardPrefs {
  enabled: boolean;
}

export function readFocusGuardPrefs(): FocusGuardPrefs {
  try {
    const raw = window.localStorage.getItem(FOCUS_GUARD_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<FocusGuardPrefs>) : {};
    return { enabled: value.enabled !== false };
  } catch {
    return { enabled: true };
  }
}

export function writeFocusGuardPrefs(prefs: FocusGuardPrefs): void {
  try {
    window.localStorage.setItem(FOCUS_GUARD_KEY, JSON.stringify({ enabled: Boolean(prefs.enabled) }));
  } catch {
    /* storage blocked: the guard stays on its default */
  }
}

export interface AwayRecord {
  sessionId: string;
  count: number;
}

/** How many times the student left during this sprint (kept per sprint, on this device). */
export function readAwayCount(sessionId: string): number {
  try {
    const raw = window.sessionStorage.getItem(FOCUS_GUARD_AWAY_KEY);
    const value = raw ? (JSON.parse(raw) as AwayRecord) : null;
    return value && value.sessionId === sessionId ? Math.max(0, Number(value.count) || 0) : 0;
  } catch {
    return 0;
  }
}

export function bumpAwayCount(sessionId: string): number {
  const count = readAwayCount(sessionId) + 1;
  try {
    window.sessionStorage.setItem(FOCUS_GUARD_AWAY_KEY, JSON.stringify({ sessionId, count }));
  } catch {
    /* ignore */
  }
  return count;
}

export interface AwayOutcome {
  /** The sprint, paused as of the moment the student left. */
  paused: SprintSession;
  awayMs: number;
  remainingMs: number;
  focusedMs: number;
}

/**
 * Pauses a running sprint from the moment the student left, if they were away long enough.
 * Returns null when nothing should change (not running, too short, or the sprint already
 * ran out while they were away, which the timer handles as a break).
 */
export function applyAway(
  session: SprintSession | null,
  hiddenAt: number,
  now: number,
  thresholdMs: number = AWAY_THRESHOLD_MS
): AwayOutcome | null {
  if (!session || session.status !== "running" || !session.startedAt) return null;
  const awayMs = now - hiddenAt;
  if (!Number.isFinite(awayMs) || awayMs < thresholdMs) return null;
  const started = Date.parse(session.startedAt);
  if (!Number.isFinite(started) || hiddenAt < started) return null;
  if (remainingMs(session, hiddenAt) <= 0) return null;
  const elapsedAtLeave = liveElapsedMs(session, hiddenAt);
  const paused: SprintSession = { ...session, status: "paused", elapsedMs: elapsedAtLeave, startedAt: null };
  return { paused, awayMs, remainingMs: remainingMs(paused, now), focusedMs: elapsedAtLeave };
}

/**
 * "I was studying" (for example from a paper book with the phone locked):
 * gives the away time back, without going past the end of the sprint.
 */
export function creditAwayTime(session: SprintSession, awayMs: number): SprintSession {
  const limit = session.durationMinutes * 60_000;
  return { ...session, elapsedMs: Math.min(limit - 1_000, session.elapsedMs + Math.max(0, awayMs)) };
}

export function minutesLabel(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
