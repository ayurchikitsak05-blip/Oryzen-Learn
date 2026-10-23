/** Server-side study-plan caps. Local storage may keep a copy even when upload is rejected. */

export const ROADMAP_MAX_BYTES = 512 * 1024;
export const ROADMAP_MAX_DAYS = 400;
export const ROADMAP_MAX_SESSIONS_PER_DAY = 24;
export const ROADMAP_MAX_SUBJECTS = 40;
export const ROADMAP_MAX_CHAPTERS_PER_SUBJECT = 80;
export const ROADMAP_MAX_COMMITMENTS = 40;
export const ROADMAP_MAX_COMPLETIONS = 8_000;
export const ROADMAP_MAX_UNSCHEDULED = 80;

export type RoadmapLimitCode =
  | "malformed"
  | "payload_too_large"
  | "too_complex";

export type RoadmapLimitError = {
  ok: false;
  status: 400 | 413;
  code: RoadmapLimitCode;
  error: string;
};

export function utf8ByteLength(text: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }
  return Buffer.byteLength(text, "utf8");
}

export function jsonByteLength(value: unknown): number {
  try {
    return utf8ByteLength(JSON.stringify(value));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function rejectRawPayloadSize(rawText: string): RoadmapLimitError | null {
  if (utf8ByteLength(rawText) <= ROADMAP_MAX_BYTES) return null;
  return {
    ok: false,
    status: 413,
    code: "payload_too_large",
    error: "This study plan is too large to save. Keep it on this device or shorten the calendar.",
  };
}

export function assessRoadmapLimits(input: {
  days: number;
  maxSessionsPerDay: number;
  subjects: number;
  maxChaptersPerSubject: number;
  commitments: number;
  completions: number;
  byteLength: number;
}): RoadmapLimitError | null {
  if (input.byteLength > ROADMAP_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "payload_too_large",
      error: "This study plan is too large to save. Keep it on this device or shorten the calendar.",
    };
  }
  if (
    input.days > ROADMAP_MAX_DAYS ||
    input.maxSessionsPerDay > ROADMAP_MAX_SESSIONS_PER_DAY ||
    input.subjects > ROADMAP_MAX_SUBJECTS ||
    input.maxChaptersPerSubject > ROADMAP_MAX_CHAPTERS_PER_SUBJECT ||
    input.commitments > ROADMAP_MAX_COMMITMENTS ||
    input.completions > ROADMAP_MAX_COMPLETIONS
  ) {
    return {
      ok: false,
      status: 400,
      code: "too_complex",
      error: "This study plan has more days or sessions than we can keep in your account.",
    };
  }
  return null;
}
