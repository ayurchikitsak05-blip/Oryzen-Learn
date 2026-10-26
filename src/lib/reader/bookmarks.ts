import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";

export const READER_BOOKMARKS_KEY = "oryzen_reader_bookmarks_v1";

export interface ReaderBookmark {
  documentId: string;
  pageNumber: number;
  label: string;
  createdAt: string;
}

function readAll(userId?: string | null): ReaderBookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = readPrivateString(READER_BOOKMARKS_KEY, userId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReaderBookmark[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: readonly ReaderBookmark[], userId?: string | null) {
  if (typeof window === "undefined") return;
  writePrivateString(READER_BOOKMARKS_KEY, JSON.stringify(items), userId);
}

export function listAllBookmarks(userId?: string | null): ReaderBookmark[] {
  return readAll(userId);
}

export function replaceAllBookmarks(
  items: readonly ReaderBookmark[],
  userId?: string | null
): ReaderBookmark[] {
  writeAll(items, userId);
  return [...items];
}

export function listBookmarks(
  documentId: string,
  userId?: string | null
): ReaderBookmark[] {
  return readAll(userId)
    .filter((item) => item.documentId === documentId)
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

export function hasBookmark(
  documentId: string,
  pageNumber: number,
  userId?: string | null
): boolean {
  return readAll(userId).some(
    (item) => item.documentId === documentId && item.pageNumber === pageNumber
  );
}

export function toggleBookmark(
  input: {
    documentId: string;
    pageNumber: number;
    label: string;
  },
  userId?: string | null
): ReaderBookmark[] {
  const current = readAll(userId);
  const exists = current.some(
    (item) =>
      item.documentId === input.documentId && item.pageNumber === input.pageNumber
  );
  const next = exists
    ? current.filter(
        (item) =>
          !(
            item.documentId === input.documentId &&
            item.pageNumber === input.pageNumber
          )
      )
    : [
        ...current,
        {
          documentId: input.documentId,
          pageNumber: input.pageNumber,
          label: input.label.trim() || `Page ${input.pageNumber}`,
          createdAt: new Date().toISOString(),
        },
      ];
  writeAll(next, userId);
  return next.filter((item) => item.documentId === input.documentId);
}
