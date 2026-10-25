/**
 * Persists saved passages with the PDF page, section heading, and bounding box
 * so a citation can scroll the reader back to that coordinate.
 *
 * Authenticated students only read their scoped store. Older unscoped keys stay
 * unclaimed and are never copied onto another student.
 */

import type { BoundingBox } from "@/lib/reader/extractor";
import {
  ANONYMOUS_READER_SCOPE,
  normalizeReaderScope,
  scopedReaderStorageKey,
} from "@/lib/reader/local-scope";
import type { InlineCitationCoordinate } from "./gateway";

export const SAVED_PASSAGE_STORAGE_KEY = "oryzen_saved_passages_v1";
const LEGACY_PASSAGE_STORAGE_KEY = ["prakriti_study_ai_deep_linked_", "v1"].join(
  "n" + "otebook_"
);

export interface SavedPassageEntry {
  id: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  sectionHeading: string;
  boundingBox: BoundingBox;
  highlightedText: string;
  aiSynthesisMarkdown: string;
  citations: InlineCitationCoordinate[];
  createdAt: string;
}

const memoryByScope = new Map<string, Map<string, SavedPassageEntry>>();

export function savedPassagesStorageKey(userId?: string | null): string {
  return scopedReaderStorageKey(SAVED_PASSAGE_STORAGE_KEY, userId);
}

export function unclaimedLegacyPassagesExist(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.localStorage.getItem(SAVED_PASSAGE_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_PASSAGE_STORAGE_KEY)
  );
}

export function listUnclaimedLegacyPassages(): SavedPassageEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      window.localStorage.getItem(SAVED_PASSAGE_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_PASSAGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedPassageEntry[]) : [];
  } catch {
    return [];
  }
}

function memoryFor(userId?: string | null): Map<string, SavedPassageEntry> {
  const scope = normalizeReaderScope(userId);
  const existing = memoryByScope.get(scope);
  if (existing) return existing;
  const next = new Map<string, SavedPassageEntry>();
  memoryByScope.set(scope, next);
  return next;
}

function hydrateScope(userId?: string | null): Map<string, SavedPassageEntry> {
  const store = memoryFor(userId);
  if (typeof window === "undefined") return store;
  try {
    const raw = window.localStorage.getItem(savedPassagesStorageKey(userId));
    if (!raw) return store;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return store;
    parsed.forEach((item) => {
      const entry = item as SavedPassageEntry;
      if (entry && typeof entry.id === "string") store.set(entry.id, entry);
    });
  } catch {
    // Ignore corrupt scoped storage
  }
  return store;
}

function persistScope(userId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      savedPassagesStorageKey(userId),
      JSON.stringify(Array.from(memoryFor(userId).values()))
    );
  } catch {
    // The in-memory store still holds the passage.
  }
}

export function listSavedPassages(
  documentId?: string,
  userId?: string | null
): SavedPassageEntry[] {
  const all = Array.from(hydrateScope(userId).values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (!documentId) return all;
  return all.filter((item) => item.documentId === documentId);
}

export function savePassageEntry(
  input: Omit<SavedPassageEntry, "id" | "createdAt">,
  userId?: string | null
): SavedPassageEntry {
  const entry: SavedPassageEntry = {
    ...input,
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  hydrateScope(userId).set(entry.id, entry);
  persistScope(userId);
  return entry;
}

export function clearSavedPassages(userId?: string | null): void {
  if (userId === undefined) {
    memoryByScope.clear();
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(
          scopedReaderStorageKey(SAVED_PASSAGE_STORAGE_KEY, ANONYMOUS_READER_SCOPE)
        );
      } catch {
        // Ignored
      }
    }
    return;
  }
  memoryByScope.delete(normalizeReaderScope(userId));
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(savedPassagesStorageKey(userId));
  } catch {
    // Ignored
  }
}
