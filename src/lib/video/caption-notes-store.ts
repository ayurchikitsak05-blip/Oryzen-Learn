import type { TimestampedLectureNote } from "@/lib/video/sync-engine";

const STORAGE_KEY = "oryzen_video_caption_notes_v1";
const MAX_LECTURES = 8;

export type StoredCaptionLecture = {
  videoId: string;
  url: string;
  title: string;
  notes: TimestampedLectureNote[];
};

type StoredCaptionRecord = {
  version: 1;
  ownerId: string;
  lectures: StoredCaptionLecture[];
};

export function readVideoCaptionNotes(ownerId: string): StoredCaptionLecture[] {
  if (!ownerId || typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "") as StoredCaptionRecord;
    if (parsed?.version !== 1 || parsed.ownerId !== ownerId || !Array.isArray(parsed.lectures)) {
      return [];
    }
    return parsed.lectures.filter((item) => item.videoId && item.notes?.length);
  } catch {
    return [];
  }
}

export function writeVideoCaptionNotes(ownerId: string, lecture: StoredCaptionLecture): void {
  if (!ownerId || !lecture.videoId || lecture.notes.length === 0) return;
  const lectures = [
    ...readVideoCaptionNotes(ownerId).filter((item) => item.videoId !== lecture.videoId),
    lecture,
  ].slice(-MAX_LECTURES);
  const record: StoredCaptionRecord = { version: 1, ownerId, lectures };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}
