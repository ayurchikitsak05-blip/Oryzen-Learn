import { scopedReaderStorageKey } from "@/lib/reader/local-scope";
import {
  COACH_ACTIONS,
  COACH_RECENT_LIMIT,
  COACH_STORAGE_KEY,
  DEFAULT_COACH_PREFS,
  type CoachActionId,
  type CoachFeedbackCount,
  type CoachFrequency,
  type CoachPrefs,
} from "./types";

const FREQUENCIES: CoachFrequency[] = ["off", "gentle", "regular", "frequent"];

export function coachStorageKey(userId?: string | null): string {
  return scopedReaderStorageKey(COACH_STORAGE_KEY, userId);
}

function isFrequency(value: unknown): value is CoachFrequency {
  return typeof value === "string" && FREQUENCIES.includes(value as CoachFrequency);
}

function isAction(value: unknown): value is CoachActionId {
  return typeof value === "string" && (COACH_ACTIONS as readonly string[]).includes(value);
}

function sanitizeFeedback(value: unknown): Record<string, CoachFeedbackCount> {
  if (!value || typeof value !== "object") return {};
  const next: Record<string, CoachFeedbackCount> = {};
  for (const [id, row] of Object.entries(value as Record<string, CoachFeedbackCount>)) {
    if (!id || !row || typeof row !== "object") continue;
    next[id] = {
      helpful: Math.max(0, Number(row.helpful) || 0),
      skip: Math.max(0, Number(row.skip) || 0),
    };
  }
  return next;
}

export function sanitizeCoachPrefs(value: unknown): CoachPrefs {
  if (!value || typeof value !== "object") return { ...DEFAULT_COACH_PREFS, shownByKey: {}, feedback: {}, recentIds: [], postponeLog: [] };
  const raw = value as Partial<CoachPrefs>;
  return {
    version: 1,
    frequency: isFrequency(raw.frequency) ? raw.frequency : DEFAULT_COACH_PREFS.frequency,
    recentIds: Array.isArray(raw.recentIds)
      ? raw.recentIds.filter((id): id is string => typeof id === "string").slice(0, COACH_RECENT_LIMIT)
      : [],
    feedback: sanitizeFeedback(raw.feedback),
    shownByKey:
      raw.shownByKey && typeof raw.shownByKey === "object"
        ? Object.fromEntries(
            Object.entries(raw.shownByKey).filter(
              (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
            )
          )
        : {},
    snoozeUntil: typeof raw.snoozeUntil === "string" ? raw.snoozeUntil : undefined,
    focusedSessionId: typeof raw.focusedSessionId === "string" ? raw.focusedSessionId : undefined,
    inProgressSessionId: typeof raw.inProgressSessionId === "string" ? raw.inProgressSessionId : undefined,
    breakNotedAt: typeof raw.breakNotedAt === "string" ? raw.breakNotedAt : undefined,
    postponeLog: Array.isArray(raw.postponeLog)
      ? raw.postponeLog.filter((id): id is string => typeof id === "string").slice(-40)
      : [],
    explicitOverwhelmedAt:
      typeof raw.explicitOverwhelmedAt === "string" ? raw.explicitOverwhelmedAt : undefined,
    studyStartedAt: typeof raw.studyStartedAt === "string" ? raw.studyStartedAt : undefined,
    lastActionAt: typeof raw.lastActionAt === "string" ? raw.lastActionAt : undefined,
    lastAction: isAction(raw.lastAction) ? raw.lastAction : undefined,
  };
}

export function readCoachPrefs(userId?: string | null): CoachPrefs {
  if (typeof window === "undefined") {
    return { ...DEFAULT_COACH_PREFS, shownByKey: {}, feedback: {}, recentIds: [], postponeLog: [] };
  }
  try {
    const raw = window.localStorage.getItem(coachStorageKey(userId));
    if (!raw) {
      return { ...DEFAULT_COACH_PREFS, shownByKey: {}, feedback: {}, recentIds: [], postponeLog: [] };
    }
    return sanitizeCoachPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_COACH_PREFS, shownByKey: {}, feedback: {}, recentIds: [], postponeLog: [] };
  }
}

export function writeCoachPrefs(prefs: CoachPrefs, userId?: string | null): CoachPrefs {
  const next = sanitizeCoachPrefs(prefs);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(coachStorageKey(userId), JSON.stringify(next));
    window.dispatchEvent(new Event("oryzen-coach-changed"));
  }
  return next;
}

export function patchCoachPrefs(
  patch: Partial<CoachPrefs>,
  userId?: string | null
): CoachPrefs {
  return writeCoachPrefs({ ...readCoachPrefs(userId), ...patch }, userId);
}

export function cacheKey(userId: string | null | undefined, trigger: string, day: string): string {
  return `${userId || "local-anonymous"}::${trigger}::${day}`;
}

export function rememberShown(
  messageId: string,
  userId: string | null | undefined,
  trigger: string,
  day: string
): CoachPrefs {
  const current = readCoachPrefs(userId);
  const recentIds = [messageId, ...current.recentIds.filter((id) => id !== messageId)].slice(
    0,
    COACH_RECENT_LIMIT
  );
  return writeCoachPrefs(
    {
      ...current,
      recentIds,
      shownByKey: { ...current.shownByKey, [cacheKey(userId, trigger, day)]: messageId },
    },
    userId
  );
}

export function recordFeedback(
  messageId: string,
  kind: "helpful" | "skip",
  userId?: string | null
): CoachPrefs {
  const current = readCoachPrefs(userId);
  const row = current.feedback[messageId] ?? { helpful: 0, skip: 0 };
  row[kind] += 1;
  return writeCoachPrefs(
    { ...current, feedback: { ...current.feedback, [messageId]: row } },
    userId
  );
}

export function recordPostpone(sessionId: string, userId?: string | null): CoachPrefs {
  const current = readCoachPrefs(userId);
  return writeCoachPrefs(
    { ...current, postponeLog: [...current.postponeLog, `${sessionId}@${Date.now()}`].slice(-40) },
    userId
  );
}
