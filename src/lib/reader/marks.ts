import type { ReaderMarginNote } from "@/lib/reader/annotations";
import type { ReaderTextMark } from "@/components/reader/PassageText";
import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";

export const READER_MARKS_STORAGE_KEY = "oryzen_reader_text_marks_v1";
export const READER_NOTES_STORAGE_KEY = "oryzen_reader_margin_notes_v1";

function readJsonArray<T>(baseKey: string, userId?: string | null): T[] {
  try {
    const raw = readPrivateString(baseKey, userId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function readTextMarks(userId?: string | null): ReaderTextMark[] {
  return readJsonArray<ReaderTextMark>(READER_MARKS_STORAGE_KEY, userId);
}

export function writeTextMarks(
  marks: readonly ReaderTextMark[],
  userId?: string | null
): void {
  writePrivateString(READER_MARKS_STORAGE_KEY, JSON.stringify(marks), userId);
}

export function readMarginNotes(userId?: string | null): ReaderMarginNote[] {
  return readJsonArray<ReaderMarginNote>(READER_NOTES_STORAGE_KEY, userId);
}

export function writeMarginNotes(
  notes: readonly ReaderMarginNote[],
  userId?: string | null
): void {
  writePrivateString(READER_NOTES_STORAGE_KEY, JSON.stringify(notes), userId);
}

export function unclaimedLegacyMarksExist(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.localStorage.getItem(READER_MARKS_STORAGE_KEY) ||
      window.localStorage.getItem(READER_NOTES_STORAGE_KEY)
  );
}
