import type { ReaderBookmark } from "@/lib/reader/bookmarks";
import {
  quizProgressId,
  type ReaderQuizProgress,
} from "@/lib/reader/quiz-progress";

export function bookmarkKey(item: Pick<ReaderBookmark, "documentId" | "pageNumber">): string {
  return `${item.documentId}::${item.pageNumber}`;
}

export function mergeBookmarks(
  local: readonly ReaderBookmark[],
  remote: readonly ReaderBookmark[]
): ReaderBookmark[] {
  const map = new Map<string, ReaderBookmark>();
  for (const item of [...remote, ...local]) {
    const key = bookmarkKey(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }
    const existingTime = Date.parse(existing.createdAt) || 0;
    const nextTime = Date.parse(item.createdAt) || 0;
    map.set(key, nextTime >= existingTime ? item : existing);
  }
  return [...map.values()].sort((a, b) => {
    if (a.documentId !== b.documentId) return a.documentId.localeCompare(b.documentId);
    return a.pageNumber - b.pageNumber;
  });
}

export function mergeQuizProgress(
  local: readonly ReaderQuizProgress[],
  remote: readonly ReaderQuizProgress[]
): ReaderQuizProgress[] {
  const map = new Map<string, ReaderQuizProgress>();
  for (const item of [...remote, ...local]) {
    const key = quizProgressId(item.documentId, item.pageNumber, item.selectionKey);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }
    const existingTime = Date.parse(existing.updatedAt) || 0;
    const nextTime = Date.parse(item.updatedAt) || 0;
    map.set(key, nextTime >= existingTime ? item : existing);
  }
  return [...map.values()];
}
