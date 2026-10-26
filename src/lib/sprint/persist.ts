import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";
import { scopedReaderStorageKey } from "@/lib/reader/local-scope";
import { nearestDuration } from "./plan";
import {
  DEFAULT_SPRINT_STORE,
  SPRINT_DURATIONS,
  SPRINT_STATUSES,
  SPRINT_STORAGE_KEY,
  type SprintDuration,
  type SprintRhythm,
  type SprintSession,
  type SprintStatus,
  type SprintStore,
} from "./types";

const RHYTHMS: SprintRhythm[] = ["spark", "laser", "anchor", "custom"];

export function sprintStorageKey(userId?: string | null): string {
  return scopedReaderStorageKey(SPRINT_STORAGE_KEY, userId);
}

function asStatus(value: unknown): SprintStatus {
  return typeof value === "string" && (SPRINT_STATUSES as readonly string[]).includes(value)
    ? (value as SprintStatus)
    : "planned";
}

function asDuration(value: unknown): SprintDuration {
  return SPRINT_DURATIONS.includes(value as SprintDuration)
    ? (value as SprintDuration)
    : nearestDuration(Number(value) || 25);
}

function asRhythm(value: unknown): SprintRhythm {
  return typeof value === "string" && RHYTHMS.includes(value as SprintRhythm)
    ? (value as SprintRhythm)
    : "custom";
}

function sanitizeSession(value: unknown): SprintSession | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<SprintSession>;
  if (typeof raw.id !== "string" || !raw.id.trim()) return null;
  return {
    id: raw.id.trim(),
    goal: typeof raw.goal === "string" ? raw.goal.replace(/\s+/g, " ").trim() : "Study this passage",
    subject: typeof raw.subject === "string" ? raw.subject.trim() : "",
    topic: typeof raw.topic === "string" ? raw.topic.trim() : "",
    documentId: typeof raw.documentId === "string" ? raw.documentId.trim() : "",
    documentTitle: typeof raw.documentTitle === "string" ? raw.documentTitle.trim() : "",
    chapter: typeof raw.chapter === "string" ? raw.chapter.trim() : "",
    durationMinutes: asDuration(raw.durationMinutes),
    breakMinutes: Math.min(15, Math.max(3, Number(raw.breakMinutes) || 5)),
    dailyTargetMinutes: Math.min(360, Math.max(15, Number(raw.dailyTargetMinutes) || 90)),
    status: asStatus(raw.status),
    elapsedMs: Math.max(0, Number(raw.elapsedMs) || 0),
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : null,
    completedAt: typeof raw.completedAt === "string" ? raw.completedAt : null,
    date: typeof raw.date === "string" ? raw.date : "",
    quizLinked: Boolean(raw.quizLinked),
    notesLinked: Boolean(raw.notesLinked),
    passageText: typeof raw.passageText === "string" ? raw.passageText.replace(/\s+/g, " ").trim().slice(0, 2400) : "",
    pageNumber: Math.max(0, Math.round(Number(raw.pageNumber) || 0)),
    sectionHeading: typeof raw.sectionHeading === "string" ? raw.sectionHeading.trim() : "",
  };
}

export function sanitizeSprintStore(value: unknown): SprintStore {
  if (!value || typeof value !== "object") return { ...DEFAULT_SPRINT_STORE, sessions: [] };
  const raw = value as Partial<SprintStore>;
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.map(sanitizeSession).filter((item): item is SprintSession => Boolean(item)).slice(-80)
    : [];
  return {
    version: 1,
    sessions,
    dailyTargetMinutes: Math.min(360, Math.max(15, Number(raw.dailyTargetMinutes) || 90)),
    preferredDuration: asDuration(raw.preferredDuration),
    preferredBreakMinutes: Math.min(15, Math.max(3, Number(raw.preferredBreakMinutes) || 5)),
    rhythm: asRhythm(raw.rhythm),
  };
}

export function readSprintStore(userId?: string | null): SprintStore {
  if (typeof window === "undefined") return { ...DEFAULT_SPRINT_STORE, sessions: [] };
  try {
    const raw = readPrivateString(SPRINT_STORAGE_KEY, userId);
    if (!raw) return { ...DEFAULT_SPRINT_STORE, sessions: [] };
    return sanitizeSprintStore(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SPRINT_STORE, sessions: [] };
  }
}

export function writeSprintStore(store: SprintStore, userId?: string | null): SprintStore {
  const next = sanitizeSprintStore(store);
  if (typeof window !== "undefined") {
    writePrivateString(SPRINT_STORAGE_KEY, JSON.stringify(next), userId);
  }
  return next;
}

export function upsertSprintSession(
  session: SprintSession,
  userId?: string | null
): SprintStore {
  const store = readSprintStore(userId);
  const index = store.sessions.findIndex((item) => item.id === session.id);
  const sessions =
    index >= 0
      ? store.sessions.map((item) => (item.id === session.id ? session : item))
      : [...store.sessions, session];
  return writeSprintStore({ ...store, sessions }, userId);
}

export function patchSprintPrefs(
  patch: Partial<Pick<SprintStore, "dailyTargetMinutes" | "preferredDuration" | "preferredBreakMinutes" | "rhythm">>,
  userId?: string | null
): SprintStore {
  return writeSprintStore({ ...readSprintStore(userId), ...patch }, userId);
}
