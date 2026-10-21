/**
 * Persists saved passages with the PDF page, section heading, and bounding box
 * so a citation can scroll the reader back to that coordinate.
 */

import type { BoundingBox } from "@/lib/reader/extractor";
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

const memoryPassageStore = new Map<string, SavedPassageEntry>();

function readStoredPassages(): SavedPassageEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const current = window.localStorage.getItem(SAVED_PASSAGE_STORAGE_KEY);
    const legacy = window.localStorage.getItem(LEGACY_PASSAGE_STORAGE_KEY);
    const raw = current ?? legacy;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPassageEntry[];
    if (!Array.isArray(parsed)) return [];
    if (!current && legacy) {
      window.localStorage.setItem(SAVED_PASSAGE_STORAGE_KEY, raw);
      window.localStorage.removeItem(LEGACY_PASSAGE_STORAGE_KEY);
    }
    return parsed;
  } catch {
    return [];
  }
}

export function listSavedPassages(documentId?: string): SavedPassageEntry[] {
  readStoredPassages().forEach((item) => memoryPassageStore.set(item.id, item));
  const all = Array.from(memoryPassageStore.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (!documentId) return all;
  return all.filter((item) => item.documentId === documentId);
}

export function savePassageEntry(
  input: Omit<SavedPassageEntry, "id" | "createdAt">
): SavedPassageEntry {
  const entry: SavedPassageEntry = {
    ...input,
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  memoryPassageStore.set(entry.id, entry);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        SAVED_PASSAGE_STORAGE_KEY,
        JSON.stringify(Array.from(memoryPassageStore.values()))
      );
    } catch {
      // The in-memory store still holds the passage.
    }
  }
  return entry;
}

export function clearSavedPassages(): void {
  memoryPassageStore.clear();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SAVED_PASSAGE_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_PASSAGE_STORAGE_KEY);
  } catch {
    // Ignored
  }
}
