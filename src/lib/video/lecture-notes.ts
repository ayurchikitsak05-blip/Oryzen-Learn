import { formatTimestampBadge, type TimestampedLectureNote } from "./sync-engine";

/**
 * YouTube lecture notes made by Gemini (owner plan, 4 Nov 2026).
 * One set of notes per public video, shared by every student; a monthly limit on new videos.
 * All the numbers that drive cost live here.
 */

export const LECTURE_NOTES_MODEL = "gemini-3.5-flash-lite" as const;
/** Only the first 90 minutes are used, which caps the cost of one lecture. */
export const LECTURE_MAX_SECONDS = 90 * 60;
/** One picture every 5 seconds (plus all the audio) is enough for boards and slides. */
export const LECTURE_FRAMES_PER_SECOND = 0.2;
export const LECTURE_MAX_OUTPUT_TOKENS = 16384;
/** New lectures a month. Notes another student already made don't count. */
export const MONTHLY_NEW_LECTURES = { free: 1, pro: 8 } as const;

export type LecturePlan = keyof typeof MONTHLY_NEW_LECTURES;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isVideoId(value: unknown): value is string {
  return typeof value === "string" && VIDEO_ID.test(value);
}

/** First day of this month in India (UTC+05:30), as a UTC ISO timestamp. */
export function indiaMonthStartIso(now: Date = new Date()): string {
  const offsetMs = 330 * 60 * 1000;
  const india = new Date(now.getTime() + offsetMs);
  return new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), 1) - offsetMs).toISOString();
}

export interface LectureAllowance {
  plan: LecturePlan;
  limit: number;
  used: number;
  left: number;
}

export function lectureAllowance(plan: LecturePlan, used: number): LectureAllowance {
  const limit = MONTHLY_NEW_LECTURES[plan];
  return { plan, limit, used, left: Math.max(0, limit - used) };
}

export function lectureLimitMessage(allowance: LectureAllowance): string {
  const what = allowance.limit === 1 ? "1 new lecture" : `${allowance.limit} new lectures`;
  return allowance.plan === "pro"
    ? `You've made notes for ${what} this month. Lectures someone else has already added still open free. More on the 1st.`
    : `The free plan includes ${what} a month. Lectures someone else has already added still open free, or get Pro for ${MONTHLY_NEW_LECTURES.pro} a month.`;
}

export const LECTURE_NOTES_PROMPT = [
  "You are making study notes from a recorded class lecture for a student in India (Class 10 and up).",
  "Watch the video and listen to the teacher. Write notes in the same language the teacher mostly uses; if the teacher mixes Hindi and English, write in simple English and keep key Hindi terms.",
  "Split the lecture into sections of roughly 3 to 8 minutes, in order (at most 30 sections). For each section give:",
  "- start_seconds: when the section starts, in seconds from the beginning of the video;",
  "- heading: a short topic heading;",
  "- points: 2 to 6 short study points (definitions, formulas, steps, examples written on the board);",
  "- key_point: the one thing most likely to be asked in an exam, or an empty string.",
  "Only write what the teacher actually says or shows. Do not add facts from elsewhere. If the video is not a lecture, return an empty sections list.",
  "Also return title: a short title for the lecture.",
].join("\n");

export const LECTURE_NOTES_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    sections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          start_seconds: { type: "NUMBER" },
          heading: { type: "STRING" },
          points: { type: "ARRAY", items: { type: "STRING" } },
          key_point: { type: "STRING" },
        },
        required: ["start_seconds", "heading", "points"],
      },
    },
  },
  required: ["title", "sections"],
} as const;

/** The Gemini request: the YouTube link, clipped to 90 minutes, low detail, sparse frames. */
export function lectureNotesRequestBody(videoId: string) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            fileData: { fileUri: `https://www.youtube.com/watch?v=${videoId}` },
            videoMetadata: { endOffset: `${LECTURE_MAX_SECONDS}s`, fps: LECTURE_FRAMES_PER_SECOND },
          },
          { text: LECTURE_NOTES_PROMPT },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      mediaResolution: "MEDIA_RESOLUTION_LOW",
      maxOutputTokens: LECTURE_MAX_OUTPUT_TOKENS,
      responseMimeType: "application/json",
      responseSchema: LECTURE_NOTES_SCHEMA,
    },
  };
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export interface ParsedLectureNotes {
  title: string;
  notes: TimestampedLectureNote[];
  coveredSeconds: number;
}

/** Turns Gemini's JSON into the timed notes the video screen already shows. Never throws. */
export function parseLectureNotes(raw: unknown, videoId: string): ParsedLectureNotes {
  const value = (raw && typeof raw === "object" ? raw : {}) as { title?: unknown; sections?: unknown };
  const sections = Array.isArray(value.sections) ? value.sections.slice(0, 60) : [];
  const rows = sections
    .map((item) => {
      const section = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const start = Number(section.start_seconds);
      const points = Array.isArray(section.points)
        ? section.points.map((point) => cleanText(point, 400)).filter(Boolean).slice(0, 8)
        : [];
      return {
        start: Number.isFinite(start) ? Math.min(Math.max(0, Math.floor(start)), LECTURE_MAX_SECONDS) : 0,
        heading: cleanText(section.heading, 120),
        points,
        key: cleanText(section.key_point, 300),
      };
    })
    .filter((row) => row.heading || row.points.length > 0)
    .sort((a, b) => a.start - b.start);

  const lectureId = `lec-student-${videoId}`;
  const notes: TimestampedLectureNote[] = rows.map((row, index) => {
    const next = rows[index + 1]?.start;
    const end = next && next > row.start ? next : Math.min(row.start + 300, LECTURE_MAX_SECONDS);
    return {
      id: `ai-${videoId}-${index}`,
      lectureId,
      startSeconds: row.start,
      endSeconds: end,
      timestampBadge: formatTimestampBadge(row.start),
      heading: row.heading || `Part ${index + 1}`,
      speakerTranscript: "",
      studyNoteMarkdown: row.points.map((point) => `- ${point}`).join("\n"),
      highYieldKeyPoint: row.key,
      modificationHistory: [],
    };
  });
  return {
    title: cleanText(value.title, 120) || "Your lecture",
    notes,
    coveredSeconds: notes.length ? notes[notes.length - 1].endSeconds : 0,
  };
}

/** Sanitizes notes read back from the shared table before sending them to a student. */
export function sanitizeStoredNotes(value: unknown, videoId: string): TimestampedLectureNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 60)
    .map((item, index) => {
      const note = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const start = Number(note.startSeconds);
      const end = Number(note.endSeconds);
      const safeStart = Number.isFinite(start) && start >= 0 ? start : 0;
      return {
        id: `ai-${videoId}-${index}`,
        lectureId: `lec-student-${videoId}`,
        startSeconds: safeStart,
        endSeconds: Number.isFinite(end) && end > safeStart ? end : safeStart + 300,
        timestampBadge: formatTimestampBadge(safeStart),
        heading: cleanText(note.heading, 120),
        speakerTranscript: "",
        studyNoteMarkdown: typeof note.studyNoteMarkdown === "string" ? note.studyNoteMarkdown.slice(0, 4000) : "",
        highYieldKeyPoint: cleanText(note.highYieldKeyPoint, 300),
        modificationHistory: [],
      };
    })
    .filter((note) => note.heading || note.studyNoteMarkdown);
}

/** Gemini's "this video can't be used" errors (private, unlisted, removed, too long). */
export function lectureFailureMessage(status: number, detail: string): string {
  const text = detail.toLowerCase();
  if (status === 400 || status === 403 || status === 404) {
    if (text.includes("private") || text.includes("unlisted") || text.includes("not available") || text.includes("permission")) {
      return "This video can't be used. Only public YouTube videos work (not private or unlisted).";
    }
    return "This video couldn't be read. Check that it's a public YouTube lecture and try again.";
  }
  if (status === 429) return "Lecture notes are busy right now. Please try again in a few minutes.";
  return "Lecture notes couldn't be made just now. Nothing was counted. Please try again later.";
}
