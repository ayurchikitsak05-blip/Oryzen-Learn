/**
 * Layer 3: Bi-Directional Deep-Linked Study Compendium Store
 * Persists student highlights alongside exact PDF page numbers, section headings,
 * and bounding-box coordinates (`x, y, width, height`) so tapping any compendium
 * entry or citation scrolls the virtualized PDF reader directly to that coordinate.
 */

import type { BoundingBox } from "@/lib/reader/extractor";
import type { InlineCitationCoordinate } from "./gateway";

export const SAVED_PASSAGE_STORAGE_KEY =
  "prakriti_study_ai_deep_linked_notebook_v1";

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

const memoryNotebookStore = new Map<string, SavedPassageEntry>();

export function listSavedPassages(
  documentId?: string
): SavedPassageEntry[] {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(SAVED_PASSAGE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedPassageEntry[];
        parsed.forEach((item) => memoryNotebookStore.set(item.id, item));
      }
    } catch {
      // Ignore corrupt localStorage
    }
  }

  const all = Array.from(memoryNotebookStore.values()).sort(
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

  memoryNotebookStore.set(entry.id, entry);

  if (typeof window !== "undefined") {
    try {
      const all = Array.from(memoryNotebookStore.values());
      window.localStorage.setItem(
        SAVED_PASSAGE_STORAGE_KEY,
        JSON.stringify(all)
      );
    } catch {
      // Memory fallback already holds entry
    }
  }

  return entry;
}

export function clearSavedPassages(): void {
  memoryNotebookStore.clear();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(SAVED_PASSAGE_STORAGE_KEY);
    } catch {
      // Ignored
    }
  }
}
