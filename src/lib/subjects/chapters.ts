import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";

/**
 * Chapter status on a subject page (owner, 27 Nov 2026). Built from the book's contents and
 * how far the student has read; "Exam-ready" is the student's own tick. No AI.
 */
export const CHAPTER_READY_KEY = "oryzen_chapter_ready_v1";

export type ChapterStatus = "ready" | "read" | "reading" | "new";

export interface ChapterBook {
  id: string;
  title: string;
  pageCount: number;
  chapters: ReadonlyArray<{ title: string; pageNumber: number }>;
  /** Furthest page the student has reached in this book. */
  reachedPage: number;
}

export interface ChapterRow {
  key: string;
  bookId: string;
  bookTitle: string;
  title: string;
  startPage: number;
  endPage: number;
  percent: number;
  status: ChapterStatus;
}

export function chapterKey(bookId: string, startPage: number): string {
  return `${bookId}:${startPage}`;
}

/** Page ranges from the contents: each chapter runs to the page before the next one starts. */
export function chapterRows(books: readonly ChapterBook[], ready: ReadonlySet<string>): ChapterRow[] {
  const rows: ChapterRow[] = [];
  for (const book of books) {
    const pages = Math.max(1, book.pageCount || 1);
    const seen = new Set<number>();
    const starts = [...book.chapters]
      .filter((chapter) => chapter.title.trim().length >= 3 && chapter.pageNumber >= 1 && chapter.pageNumber <= pages)
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .filter((chapter) => (seen.has(chapter.pageNumber) ? false : (seen.add(chapter.pageNumber), true)));
    starts.forEach((chapter, index) => {
      const startPage = chapter.pageNumber;
      const endPage = Math.max(startPage, (starts[index + 1]?.pageNumber ?? pages + 1) - 1);
      const span = endPage - startPage + 1;
      const done = Math.min(span, Math.max(0, book.reachedPage - startPage + 1));
      const percent = Math.round((done / span) * 100);
      const key = chapterKey(book.id, startPage);
      const status: ChapterStatus = ready.has(key)
        ? "ready"
        : book.reachedPage >= endPage
          ? "read"
          : book.reachedPage >= startPage
            ? "reading"
            : "new";
      rows.push({ key, bookId: book.id, bookTitle: book.title, title: chapter.title.trim(), startPage, endPage, percent, status });
    });
  }
  return rows;
}

export function chapterSummary(rows: readonly ChapterRow[]): Record<ChapterStatus | "total", number> {
  const out = { ready: 0, read: 0, reading: 0, new: 0, total: rows.length };
  for (const row of rows) out[row.status] += 1;
  return out;
}

export function readChapterReady(userId: string | null): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const parsed = JSON.parse(readPrivateString(CHAPTER_READY_KEY, userId) ?? "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeChapterReady(userId: string | null, ready: ReadonlySet<string>): void {
  if (!userId || typeof window === "undefined") return;
  writePrivateString(CHAPTER_READY_KEY, JSON.stringify([...ready].slice(-2000)), userId);
}
