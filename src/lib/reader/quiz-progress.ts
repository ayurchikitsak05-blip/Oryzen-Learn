import { saveToNotebook } from "@/lib/notes/save-to-notebook";
import { scopedReaderStorageKey } from "@/lib/reader/local-scope";

export const READER_QUIZ_PROGRESS_KEY = "oryzen_reader_quiz_progress_v1";

export function quizProgressStorageKey(userId?: string | null): string {
  return scopedReaderStorageKey(READER_QUIZ_PROGRESS_KEY, userId);
}

export interface ReaderQuizProgress {
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  selectionKey: string;
  answers: Record<number, number>;
  weakConcepts: string[];
  completed: boolean;
  updatedAt: string;
}

export function selectionKeyFromText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 180);
}

export function quizProgressId(
  documentId: string,
  pageNumber: number,
  selectionKey: string
): string {
  return `${documentId}::${pageNumber}::${selectionKey}`;
}

function readMap(userId?: string | null): Record<string, ReaderQuizProgress> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(quizProgressStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ReaderQuizProgress>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeQuizProgress(
  progress: ReaderQuizProgress,
  userId?: string | null
): ReaderQuizProgress {
  const next = {
    ...progress,
    updatedAt: progress.updatedAt || new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    const map = readMap(userId);
    map[quizProgressId(next.documentId, next.pageNumber, next.selectionKey)] = next;
    window.localStorage.setItem(quizProgressStorageKey(userId), JSON.stringify(map));
  }
  return next;
}

export function readQuizProgress(
  documentId: string,
  pageNumber: number,
  selectedText: string,
  userId?: string | null
): ReaderQuizProgress | null {
  const key = quizProgressId(documentId, pageNumber, selectionKeyFromText(selectedText));
  return readMap(userId)[key] ?? null;
}

export function readAllQuizProgress(userId?: string | null): ReaderQuizProgress[] {
  return Object.values(readMap(userId));
}

export function replaceAllQuizProgress(
  items: readonly ReaderQuizProgress[],
  userId?: string | null
): ReaderQuizProgress[] {
  if (typeof window !== "undefined") {
    const map: Record<string, ReaderQuizProgress> = {};
    for (const item of items) {
      map[quizProgressId(item.documentId, item.pageNumber, item.selectionKey)] = item;
    }
    window.localStorage.setItem(quizProgressStorageKey(userId), JSON.stringify(map));
  }
  return [...items];
}

export function formatQuizProgressNote(progress: ReaderQuizProgress): string {
  const answered = Object.keys(progress.answers).length;
  const weak =
    progress.weakConcepts.length > 0
      ? progress.weakConcepts.join(", ")
      : "none recorded";
  return [
    `Quiz progress · ${progress.documentTitle} · p.${progress.pageNumber}`,
    `Answered: ${answered}`,
    `Completed: ${progress.completed ? "yes" : "not yet"}`,
    `Weak concepts: ${weak}`,
    `Updated: ${progress.updatedAt}`,
  ].join("\n");
}

export async function persistQuizProgressNote(
  progress: ReaderQuizProgress
): Promise<{ local: true; notebook: "saved" | "device_only" | "error" }> {
  const result = await saveToNotebook({
    subjectTitle: `${progress.documentTitle} · Study progress`,
    title: `${progress.documentTitle} · quiz p.${progress.pageNumber}`,
    noteBody: formatQuizProgressNote(progress),
  });
  if (result.ok) return { local: true, notebook: "saved" };
  if (result.status === 401) return { local: true, notebook: "device_only" };
  return { local: true, notebook: "error" };
}
