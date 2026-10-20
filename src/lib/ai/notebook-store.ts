/**
 * Layer 3: Bi-Directional Deep-Linked Study Notebook Store
 * Persists student highlights alongside exact PDF page numbers, section headings,
 * and bounding-box coordinates (`x, y, width, height`) so tapping any notebook
 * entry or citation scrolls the virtualized PDF reader directly to that coordinate.
 */

import type { BoundingBox } from "@/lib/reader/extractor";
import type { InlineCitationCoordinate } from "./gateway";

export const LOCAL_NOTEBOOK_STORAGE_KEY =
  "prakriti_study_ai_deep_linked_notebook_v1";

export interface DeepLinkedNotebookEntry {
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

const memoryNotebookStore = new Map<string, DeepLinkedNotebookEntry>();

export function listNotebookEntries(
  documentId?: string
): DeepLinkedNotebookEntry[] {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(LOCAL_NOTEBOOK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DeepLinkedNotebookEntry[];
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

export function saveNotebookEntry(
  input: Omit<DeepLinkedNotebookEntry, "id" | "createdAt">
): DeepLinkedNotebookEntry {
  const entry: DeepLinkedNotebookEntry = {
    ...input,
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };

  memoryNotebookStore.set(entry.id, entry);

  if (typeof window !== "undefined") {
    try {
      const all = Array.from(memoryNotebookStore.values());
      window.localStorage.setItem(
        LOCAL_NOTEBOOK_STORAGE_KEY,
        JSON.stringify(all)
      );
    } catch {
      // Memory fallback already holds entry
    }
  }

  return entry;
}

export function clearNotebookEntries(): void {
  memoryNotebookStore.clear();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LOCAL_NOTEBOOK_STORAGE_KEY);
    } catch {
      // Ignored
    }
  }
}
