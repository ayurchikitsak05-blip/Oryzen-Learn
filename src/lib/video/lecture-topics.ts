/**
 * Lecture topics: the video's own chapter list, plus topics the student marks while watching
 * ("Mark topic"). Free: no AI. Kept with the lecture's other timed notes on the device.
 */
import { formatTimestampBadge, type TimestampedLectureNote } from "./sync-engine";
import type { LectureChapter } from "./youtube-chapters";

export const CHAPTER_PREFIX = "chapter-";
export const MARKED_PREFIX = "mine-";
const MAX_TOPICS = 120;

function topicNote(lectureId: string, id: string, startSeconds: number, heading: string, endSeconds: number): TimestampedLectureNote {
  return {
    id,
    lectureId,
    startSeconds,
    endSeconds: Math.max(startSeconds + 1, endSeconds),
    timestampBadge: formatTimestampBadge(startSeconds),
    heading,
    speakerTranscript: "",
    studyNoteMarkdown: "",
    highYieldKeyPoint: "",
    modificationHistory: [],
  };
}

/** Each topic runs until the next one starts (the last one for 10 minutes). */
function withEnds(notes: TimestampedLectureNote[]): TimestampedLectureNote[] {
  const sorted = notes.slice().sort((a, b) => a.startSeconds - b.startSeconds);
  return sorted.map((note, index) => ({
    ...note,
    endSeconds: Math.max(note.startSeconds + 1, sorted[index + 1]?.startSeconds ?? note.startSeconds + 600),
  }));
}

export function topicsFromChapters(lectureId: string, chapters: LectureChapter[]): TimestampedLectureNote[] {
  return withEnds(
    chapters.slice(0, MAX_TOPICS).map((chapter, index) =>
      topicNote(lectureId, `${CHAPTER_PREFIX}${index + 1}-${chapter.startSeconds}`, chapter.startSeconds, chapter.title, chapter.startSeconds + 1)
    )
  );
}

/** True when a lecture's notes are only topic headings (no AI or demo notes with text). */
export function isTopicsOnly(notes: TimestampedLectureNote[]): boolean {
  return notes.every((note) => !note.studyNoteMarkdown.trim() && !note.speakerTranscript.trim());
}

export function isMarkedTopic(note: Pick<TimestampedLectureNote, "id">): boolean {
  return note.id.startsWith(MARKED_PREFIX);
}

/** Adds a topic the student marked at this moment. Returns null if the heading is empty. */
export function markTopic(
  notes: TimestampedLectureNote[],
  input: { lectureId: string; seconds: number; heading: string; now?: number }
): TimestampedLectureNote[] | null {
  const heading = input.heading.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!heading) return null;
  const seconds = Math.max(0, Math.floor(input.seconds));
  const id = `${MARKED_PREFIX}${seconds}-${(input.now ?? Date.now()).toString(36)}`;
  return withEnds([...notes, topicNote(input.lectureId, id, seconds, heading, seconds + 1)].slice(-MAX_TOPICS));
}

export function removeTopic(notes: TimestampedLectureNote[], id: string): TimestampedLectureNote[] {
  return withEnds(notes.filter((note) => note.id !== id));
}

/** The topic playing now: the last one that has started. */
export function currentTopicId(notes: TimestampedLectureNote[], seconds: number): string | null {
  let current: string | null = null;
  for (const note of notes.slice().sort((a, b) => a.startSeconds - b.startSeconds)) {
    if (note.startSeconds <= seconds) current = note.id;
  }
  return current;
}

/** The topics as an Outline note for My Notes (and so for revision). */
export function topicsAsOutline(notes: TimestampedLectureNote[]): string {
  const lines = notes
    .slice()
    .sort((a, b) => a.startSeconds - b.startSeconds)
    .map((note) => `- ${note.timestampBadge} ${note.heading}`);
  return ["Format: Outline", ...lines].join("\n");
}
