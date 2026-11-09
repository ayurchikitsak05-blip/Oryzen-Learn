import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";
import type { TimestampedLectureNote } from "./sync-engine";

/** Notes from the student's own recorded classes, kept in their private record on this device. */
export const RECORDED_LECTURES_KEY = "oryzen_recorded_lectures_v1";
export const MAX_RECORDED_LECTURES = 20;

export interface RecordedLecture {
  id: string;
  title: string;
  createdAt: string;
  notes: TimestampedLectureNote[];
}

export function readRecordedLectures(userId?: string | null): RecordedLecture[] {
  try {
    const raw = readPrivateString(RECORDED_LECTURES_KEY, userId);
    const value = raw ? (JSON.parse(raw) as RecordedLecture[]) : [];
    return Array.isArray(value) ? value.filter((row) => row && typeof row.id === "string" && Array.isArray(row.notes)) : [];
  } catch {
    return [];
  }
}

export function addRecordedLecture(lecture: RecordedLecture, userId?: string | null): RecordedLecture[] {
  const next = [lecture, ...readRecordedLectures(userId).filter((row) => row.id !== lecture.id)].slice(0, MAX_RECORDED_LECTURES);
  writePrivateString(RECORDED_LECTURES_KEY, JSON.stringify(next), userId);
  return next;
}

export function removeRecordedLecture(id: string, userId?: string | null): RecordedLecture[] {
  const next = readRecordedLectures(userId).filter((row) => row.id !== id);
  writePrivateString(RECORDED_LECTURES_KEY, JSON.stringify(next), userId);
  return next;
}

/** One note for My Notes: every section with its time. */
export function recordedLectureAsText(lecture: Pick<RecordedLecture, "notes">): string {
  return lecture.notes
    .map((note) =>
      [`${note.timestampBadge} ${note.heading}`, note.studyNoteMarkdown, note.highYieldKeyPoint ? `Exam point: ${note.highYieldKeyPoint}` : ""]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}
