/**
 * Record a lecture (group B, owner 9 Nov 2026). The student records a class in the app, or
 * uploads a recording from their phone, and gets the same timed notes as a YouTube lecture.
 *
 * The audio goes to a private storage folder only long enough to be read by the AI, then is
 * deleted. A recording is the student's own, so its notes are never shared with anyone.
 * It uses one of the month's lectures (Free 1, Pro 8), like a new YouTube lecture.
 * Cost: about ₹3–5 an hour of class.
 */

import { LECTURE_MAX_SECONDS } from "./lecture-notes";

export const RECORDING_BUCKET = "lecture-audio";
/**
 * The Supabase Free plan accepts uploads up to 50 MB. 90 minutes recorded in the app is about
 * 22 MB; a 64 kbps phone voice memo is about 43 MB.
 */
export const RECORDING_MAX_BYTES = 50 * 1024 * 1024;
/** While recording, stop a little before the limit so the class can still be sent. */
export const RECORDING_STOP_AT_BYTES = 48 * 1024 * 1024;
/** What the app asks the phone for when recording: clear speech, small files (about 22 MB for 90 min). */
export const RECORDING_BITS_PER_SECOND = 32_000;
/** Gemini counts about 32 tokens for each second of audio. */
export const AUDIO_TOKENS_PER_SECOND = 32;
export const RECORDING_MAX_PROMPT_TOKENS = LECTURE_MAX_SECONDS * AUDIO_TOKENS_PER_SECOND + 3_000;

export interface AudioFormat {
  /** Type the file is stored with. */
  upload: string;
  ext: string;
  /** Type Gemini is told first, and a second type to try if it refuses the first. */
  gemini: string;
  fallback: string | null;
}

const FORMATS: Record<string, AudioFormat> = {
  webm: { upload: "audio/webm", ext: "webm", gemini: "audio/webm", fallback: "video/webm" },
  mp4: { upload: "audio/mp4", ext: "m4a", gemini: "audio/mp4", fallback: "video/mp4" },
  mp3: { upload: "audio/mpeg", ext: "mp3", gemini: "audio/mp3", fallback: null },
  ogg: { upload: "audio/ogg", ext: "ogg", gemini: "audio/ogg", fallback: null },
  wav: { upload: "audio/wav", ext: "wav", gemini: "audio/wav", fallback: null },
  aac: { upload: "audio/aac", ext: "aac", gemini: "audio/aac", fallback: null },
};

export const RECORDING_UPLOAD_TYPES = Array.from(new Set(Object.values(FORMATS).map((format) => format.upload)));

/** Works out the format from the browser's type (and the file name, as phones often send none). */
export function audioFormatFor(mimeType: string | null | undefined, fileName = ""): AudioFormat | null {
  const base = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (base === "audio/webm" || base === "video/webm" || ext === "webm") return FORMATS.webm;
  // Safari's recorder sometimes labels audio-only recordings "video/mp4".
  if (["audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac-mp4", "video/mp4"].includes(base) || ext === "m4a") {
    return FORMATS.mp4;
  }
  if (base === "audio/mpeg" || base === "audio/mp3" || ext === "mp3") return FORMATS.mp3;
  if (base === "audio/ogg" || base === "audio/opus" || ext === "ogg" || ext === "oga" || ext === "opus") return FORMATS.ogg;
  if (base === "audio/wav" || base === "audio/x-wav" || base === "audio/wave" || ext === "wav") return FORMATS.wav;
  if (base === "audio/aac" || ext === "aac") return FORMATS.aac;
  return null;
}

export function formatForExt(ext: unknown): AudioFormat | null {
  return Object.values(FORMATS).find((format) => format.ext === ext) ?? null;
}

const RECORDING_ID = /^rec-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isRecordingId(value: unknown): value is string {
  return typeof value === "string" && RECORDING_ID.test(value);
}

export function recordingPath(userId: string, recordingId: string, ext: string): string {
  return `users/${userId}/${recordingId}.${ext}`;
}

export const RECORDING_NOTES_PROMPT = [
  "You are making study notes from an audio recording of a class lecture for a student in India (Class 10 and up).",
  "Listen to the teacher. Write notes in the same language the teacher mostly uses; if the teacher mixes Hindi and English, write in simple English and keep key Hindi terms.",
  "Ignore background noise, other students' chatter and breaks.",
  "Cover the whole recording from start to end. Start a new section about every 5 minutes or whenever the topic changes, in the order they happen (a 60-minute class should have about 10 to 14 sections; at most 30). For each section give:",
  "- start_time: when the section starts in the recording, written as MM:SS (or H:MM:SS after an hour). Never give a time past the end of the recording;",
  "- heading: a short topic heading;",
  "- points: 2 to 6 short study points (definitions, formulas, steps, examples the teacher says or dictates);",
  "- key_point: the one thing most likely to be asked in an exam, or an empty string.",
  "Only write what the teacher actually says. Do not add facts from elsewhere. If the recording is not a lesson (silence, music, a conversation), return an empty sections list.",
  "Also return title: a short title for the lecture.",
].join("\n");

/** Google answers a type it can't read with a 400 (often just "invalid argument"); that isn't billed. */
export function isUnsupportedTypeError(status: number): boolean {
  return status === 400;
}

/** Notes waiting for a student whose connection dropped are kept this long. */
export const RECORDING_RESULT_DAYS = 7;
/** A leftover upload is only cleared after this long, so another open tab isn't disturbed. */
export const RECORDING_LEFTOVER_MS = 30 * 60 * 1000;
/** Vercel stops the request at 300 s; everything must finish before this. */
export const RECORDING_DEADLINE_MS = 280_000;
