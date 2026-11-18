/**
 * Books from the reader shown in "My PDFs by subject" (owner, 18 Nov 2026: one place for a
 * student's books). The books stay on the device; the subject a student gives each book is a
 * private study record like the others.
 */
import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";
import { SAMPLE_CHAPTER_FILE } from "./sample-chapter";

export const BOOK_SUBJECTS_KEY = "oryzen_book_subjects_v1";
export const NO_SUBJECT = "No subject yet";
export const SAMPLE_GROUP = "Sample books";

/** The example books the reader adds for every student. */
const SAMPLE_FILE_NAMES = new Set([
  "energy-constitution-sample.pdf",
  "newton-first-law.pdf",
  "marketing-blueprint.pdf",
  "mathematics-rectangle-area.pdf",
  SAMPLE_CHAPTER_FILE,
]);

export interface LibraryBook {
  id: string;
  title: string;
  fileName: string;
  pageCount: number;
  updatedAt: string;
}

export interface BookGroup {
  subject: string;
  books: LibraryBook[];
}

export function isSampleBook(book: Pick<LibraryBook, "fileName">): boolean {
  return SAMPLE_FILE_NAMES.has(book.fileName);
}

function cleanSubject(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const subject = value.replace(/\s+/g, " ").trim().slice(0, 60);
  return subject && subject !== NO_SUBJECT ? subject : null;
}

export function readBookSubjects(userId: string | null): Record<string, string> {
  try {
    const parsed = JSON.parse(readPrivateString(BOOK_SUBJECTS_KEY, userId) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const subject = cleanSubject(value);
      if (subject) out[id] = subject;
    }
    return out;
  } catch {
    return {};
  }
}

/** Gives a book a subject (or clears it with null). Returns the new map. */
export function setBookSubject(
  userId: string | null,
  bookId: string,
  subject: string | null
): Record<string, string> {
  const next = { ...readBookSubjects(userId) };
  const clean = cleanSubject(subject);
  if (clean) next[bookId] = clean;
  else delete next[bookId];
  writePrivateString(BOOK_SUBJECTS_KEY, JSON.stringify(next), userId);
  return next;
}

/** Subjects A–Z, then books without a subject, then the sample books. Newest book first. */
export function groupBooksBySubject(books: LibraryBook[], subjects: Record<string, string>): BookGroup[] {
  const groups = new Map<string, LibraryBook[]>();
  for (const book of books) {
    const subject = isSampleBook(book) ? SAMPLE_GROUP : subjects[book.id] ?? NO_SUBJECT;
    groups.set(subject, [...(groups.get(subject) ?? []), book]);
  }
  const rank = (subject: string) => (subject === SAMPLE_GROUP ? 2 : subject === NO_SUBJECT ? 1 : 0);
  return [...groups.entries()]
    .map(([subject, list]) => ({
      subject,
      books: list.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
    .sort((a, b) => rank(a.subject) - rank(b.subject) || a.subject.localeCompare(b.subject));
}

/** Subject names to choose from: the library's collections plus any already given to a book. */
export function subjectChoices(collectionTitles: string[], subjects: Record<string, string>): string[] {
  const all = new Set<string>();
  for (const title of [...collectionTitles, ...Object.values(subjects)]) {
    const clean = cleanSubject(title);
    if (clean) all.add(clean);
  }
  return [...all].sort((a, b) => a.localeCompare(b));
}
