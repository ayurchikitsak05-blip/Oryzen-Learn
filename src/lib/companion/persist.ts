import { scopedReaderStorageKey } from "@/lib/reader/local-scope";
import {
  COMPANION_CHARACTERS,
  COMPANION_STORAGE_KEY,
  COMPANION_STYLES,
  DEFAULT_COMPANION_PREFS,
  type CompanionCharacter,
  type CompanionMember,
  type CompanionPrefs,
  type CompanionStore,
  type CompanionStyle,
  type CompanionTurn,
} from "./types";
import { openingCompanionTurn } from "./replies";

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

export function memberFromPrefs(prefs: CompanionPrefs, id?: string): CompanionMember {
  return {
    id: id ?? `member-${prefs.style}`,
    name: prefs.name,
    style: prefs.style,
    character: prefs.character,
  };
}

function sanitizeMember(value: unknown): CompanionMember | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CompanionMember>;
  if (typeof raw.id !== "string" || !raw.id.trim()) return null;
  return {
    id: raw.id.trim().slice(0, 40),
    name: (typeof raw.name === "string" ? raw.name : DEFAULT_COMPANION_PREFS.name)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 24) || DEFAULT_COMPANION_PREFS.name,
    style: asStyle(raw.style),
    character: asCharacter(raw.character),
  };
}

function emptyCompanionStore(): CompanionStore {
  return {
    version: 1,
    prefs: { ...DEFAULT_COMPANION_PREFS },
    turns: [],
    collection: [],
    activeId: "",
  };
}

export function sanitizeCompanionStore(value: unknown): CompanionStore {
  if (!value || typeof value !== "object") return emptyCompanionStore();
  const raw = value as Partial<CompanionStore> & Partial<CompanionPrefs>;
  const prefs = sanitizeCompanionPrefs(raw.prefs ?? raw);
  let collection = Array.isArray(raw.collection)
    ? raw.collection.map(sanitizeMember).filter((item): item is CompanionMember => Boolean(item))
    : [];
  if (prefs.onboarded && collection.length === 0) {
    collection = [memberFromPrefs(prefs)];
  } else if (prefs.onboarded && !collection.some((member) => member.style === prefs.style && member.name === prefs.name)) {
    const existing = collection.find((member) => member.style === prefs.style);
    collection = existing
      ? collection.map((member) =>
          member.id === existing.id
            ? { ...member, name: prefs.name, character: prefs.character }
            : member
        )
      : [...collection, memberFromPrefs(prefs)];
  }
  const activeId =
    typeof raw.activeId === "string" && collection.some((member) => member.id === raw.activeId)
      ? raw.activeId
      : collection.find((member) => member.style === prefs.style)?.id ?? collection[0]?.id ?? "";
  return {
    version: 1,
    prefs,
    turns: Array.isArray(raw.turns)
      ? raw.turns.map(sanitizeTurn).filter((item): item is CompanionTurn => Boolean(item)).slice(-40)
      : [],
    collection,
    activeId,
  };
}

export function readCompanionStore(userId?: string | null): CompanionStore {
  if (typeof window === "undefined") return emptyCompanionStore();
  try {
    const raw = window.localStorage.getItem(companionStorageKey(userId));
    if (!raw) return emptyCompanionStore();
    return sanitizeCompanionStore(JSON.parse(raw));
  } catch {
    return emptyCompanionStore();
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
  const nextPrefs = sanitizeCompanionPrefs({ ...prefs, onboarded: true });
  const active = current.collection.find((member) => member.id === current.activeId);
  const collection = active
    ? current.collection.map((member) =>
        member.id === active.id
          ? {
              ...member,
              name: nextPrefs.name,
              style: nextPrefs.style,
              character: nextPrefs.character,
            }
          : member
      )
    : [memberFromPrefs(nextPrefs), ...current.collection];
  const activeId = active?.id ?? collection[0]?.id ?? "";
  return writeCompanionStore({ ...current, prefs: nextPrefs, collection, activeId }, userId);
}

export function switchCompanion(memberId: string, userId?: string | null): CompanionStore {
  const current = readCompanionStore(userId);
  const member = current.collection.find((item) => item.id === memberId);
  if (!member) return current;
  const prefs: CompanionPrefs = {
    version: 1,
    name: member.name,
    style: member.style,
    character: member.character,
    onboarded: true,
  };
  return writeCompanionStore(
    {
      ...current,
      prefs,
      activeId: member.id,
      turns: [openingCompanionTurn(prefs)],
    },
    userId
  );
}

export function createCompanionMember(
  input: {
    name: string;
    style: CompanionStyle;
    character: CompanionCharacter;
  },
  userId?: string | null
): CompanionStore {
  const current = readCompanionStore(userId);
  const name =
    input.name.replace(/\s+/g, " ").trim().slice(0, 24) || DEFAULT_COMPANION_PREFS.name;
  const member: CompanionMember = {
    id: `member-${Date.now().toString(36)}`,
    name,
    style: asStyle(input.style),
    character: asCharacter(input.character),
  };
  const prefs: CompanionPrefs = {
    version: 1,
    name: member.name,
    style: member.style,
    character: member.character,
    onboarded: true,
  };
  return writeCompanionStore(
    {
      ...current,
      collection: [...current.collection, member],
      prefs,
      activeId: member.id,
      turns: [openingCompanionTurn(prefs)],
    },
    userId
  );
}

export function upsertCompanionMember(
  member: CompanionMember,
  userId?: string | null
): CompanionStore {
  const current = readCompanionStore(userId);
  const index = current.collection.findIndex((item) => item.id === member.id);
  const collection =
    index >= 0
      ? current.collection.map((item) => (item.id === member.id ? member : item))
      : [...current.collection, member];
  const isActive = !current.activeId || current.activeId === member.id || collection.length === 1;
  const prefs = isActive
    ? {
        version: 1 as const,
        name: member.name,
        style: member.style,
        character: member.character,
        onboarded: true,
      }
    : current.prefs;
  return writeCompanionStore(
    {
      ...current,
      collection,
      prefs,
      activeId: isActive ? member.id : current.activeId,
    },
    userId
  );
}

export function appendCompanionTurn(
  turn: CompanionTurn,
  userId?: string | null
): CompanionStore {
  const current = readCompanionStore(userId);
  return writeCompanionStore({ ...current, turns: [...current.turns, turn] }, userId);
}
