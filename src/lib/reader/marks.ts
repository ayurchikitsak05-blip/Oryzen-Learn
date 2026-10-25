import type { ReaderMarginNote } from "@/lib/reader/annotations";
import type { ReaderTextMark } from "@/components/reader/PassageText";
import { scopedReaderStorageKey } from "@/lib/reader/local-scope";

export const READER_MARKS_STORAGE_KEY = "oryzen_reader_text_marks_v1";
export const READER_NOTES_STORAGE_KEY = "oryzen_reader_margin_notes_v1";

function readJsonArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function readTextMarks(userId?: string | null): ReaderTextMark[] {
  return readJsonArray<ReaderTextMark>(
    scopedReaderStorageKey(READER_MARKS_STORAGE_KEY, userId)
  );
}

export function writeTextMarks(
  marks: readonly ReaderTextMark[],
  userId?: string | null
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    scopedReaderStorageKey(READER_MARKS_STORAGE_KEY, userId),
    JSON.stringify(marks)
  );
}

export function readMarginNotes(userId?: string | null): ReaderMarginNote[] {
  return readJsonArray<ReaderMarginNote>(
    scopedReaderStorageKey(READER_NOTES_STORAGE_KEY, userId)
  );
}

export function writeMarginNotes(
  notes: readonly ReaderMarginNote[],
  userId?: string | null
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    scopedReaderStorageKey(READER_NOTES_STORAGE_KEY, userId),
    JSON.stringify(notes)
  );
}

export function unclaimedLegacyMarksExist(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.localStorage.getItem(READER_MARKS_STORAGE_KEY) ||
      window.localStorage.getItem(READER_NOTES_STORAGE_KEY)
  );
}
