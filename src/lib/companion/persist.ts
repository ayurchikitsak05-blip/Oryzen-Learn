import { scopedReaderStorageKey } from "@/lib/reader/local-scope";
import {
  COMPANION_CHARACTERS,
  COMPANION_STORAGE_KEY,
  COMPANION_STYLES,
  DEFAULT_COMPANION_PREFS,
  type CompanionCharacter,
  type CompanionPrefs,
  type CompanionStore,
  type CompanionStyle,
  type CompanionTurn,
} from "./types";

export function companionStorageKey(userId?: string | null): string {
  return scopedReaderStorageKey(COMPANION_STORAGE_KEY, userId);
}

function asStyle(value: unknown): CompanionStyle {
  return typeof value === "string" && (COMPANION_STYLES as readonly string[]).includes(value)
    ? (value as CompanionStyle)
    : DEFAULT_COMPANION_PREFS.style;
}

function asCharacter(value: unknown): CompanionCharacter {
  return typeof value === "string" && (COMPANION_CHARACTERS as readonly string[]).includes(value)
    ? (value as CompanionCharacter)
    : DEFAULT_COMPANION_PREFS.character;
}

export function sanitizeCompanionPrefs(value: unknown): CompanionPrefs {
  if (!value || typeof value !== "object") return { ...DEFAULT_COMPANION_PREFS };
  const raw = value as Partial<CompanionPrefs>;
  const name = typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim() : "";
  return {
    version: 1,
    name: name.slice(0, 24) || DEFAULT_COMPANION_PREFS.name,
    style: asStyle(raw.style),
    character: asCharacter(raw.character),
    onboarded: Boolean(raw.onboarded),
  };
}

function sanitizeTurn(value: unknown): CompanionTurn | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CompanionTurn>;
  if (raw.role !== "student" && raw.role !== "companion") return null;
  if (typeof raw.text !== "string" || !raw.text.trim()) return null;
  return {
    id: typeof raw.id === "string" ? raw.id : `turn-${Date.now()}`,
    role: raw.role,
    text: raw.text.trim().slice(0, 4000),
    mocked: Boolean(raw.mocked),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
}

export function sanitizeCompanionStore(value: unknown): CompanionStore {
  if (!value || typeof value !== "object") {
    return { version: 1, prefs: { ...DEFAULT_COMPANION_PREFS }, turns: [] };
  }
  const raw = value as Partial<CompanionStore> & Partial<CompanionPrefs>;
  return {
    version: 1,
    prefs: sanitizeCompanionPrefs(raw.prefs ?? raw),
    turns: Array.isArray(raw.turns)
      ? raw.turns.map(sanitizeTurn).filter((item): item is CompanionTurn => Boolean(item)).slice(-40)
      : [],
  };
}

export function readCompanionStore(userId?: string | null): CompanionStore {
  if (typeof window === "undefined") {
    return { version: 1, prefs: { ...DEFAULT_COMPANION_PREFS }, turns: [] };
  }
  try {
    const raw = window.localStorage.getItem(companionStorageKey(userId));
    if (!raw) return { version: 1, prefs: { ...DEFAULT_COMPANION_PREFS }, turns: [] };
    return sanitizeCompanionStore(JSON.parse(raw));
  } catch {
    return { version: 1, prefs: { ...DEFAULT_COMPANION_PREFS }, turns: [] };
  }
}

export function writeCompanionStore(
  store: CompanionStore,
  userId?: string | null
): CompanionStore {
  const next = sanitizeCompanionStore(store);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(companionStorageKey(userId), JSON.stringify(next));
  }
  return next;
}

export function writeCompanionPrefs(
  prefs: CompanionPrefs,
  userId?: string | null
): CompanionStore {
  const current = readCompanionStore(userId);
  return writeCompanionStore({ ...current, prefs: sanitizeCompanionPrefs({ ...prefs, onboarded: true }) }, userId);
}

export function appendCompanionTurn(
  turn: CompanionTurn,
  userId?: string | null
): CompanionStore {
  const current = readCompanionStore(userId);
  return writeCompanionStore({ ...current, turns: [...current.turns, turn] }, userId);
}
