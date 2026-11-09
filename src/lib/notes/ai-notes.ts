/**
 * Group B (owner, 9 Nov 2026): Photo to notes and Short notes.
 *
 * Photo to notes: a photo of a handwritten or printed page becomes typed notes the student
 * checks and saves to My Notes. One AI help per page (about ₹0.6).
 * Short notes: a chapter of the student's own book becomes one page of short notes.
 * Two AI helps per chapter (about ₹1.5–2). The book is a private upload, so the answer is
 * never shared with other students; it is kept on the student's device and in My Notes.
 *
 * Both count against the daily AI helps and the monthly safety net, like every other help.
 */

import { calculateCallCostInr } from "@/lib/ai/spend-guard";

export const AI_NOTES_MODEL = "gemini-3.5-flash-lite" as const;

export type AiNotesKind = "photo" | "short";

export const AI_NOTES_LENS: Record<AiNotesKind, string> = {
  photo: "photo_notes",
  short: "short_notes",
};

/** Photos are shrunk on the phone first; this is the most a page may weigh when it arrives. */
export const PHOTO_MAX_BYTES = 3_000_000;
export const PHOTO_MAX_EDGE_PX = 1600;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX_OUTPUT_TOKENS = 4096;
/** About 15,000 words of book text: a long chapter. */
export const SHORT_NOTES_MAX_CHARS = 60_000;
export const SHORT_NOTES_MIN_CHARS = 200;
export const SHORT_NOTES_MAX_OUTPUT_TOKENS = 6144;
/** A photo costs about 1,100 tokens to read at full detail. */
const PHOTO_PROMPT_TOKENS = 1_120 + 600;

export const AI_NOTES_TIMEOUT_MS: Record<AiNotesKind, number> = { photo: 60_000, short: 120_000 };

/** The most one request can cost, used before calling and when we can't see the real figure. */
export function worstCaseAiNotesCostInr(kind: AiNotesKind): number {
  if (kind === "photo") return calculateCallCostInr(AI_NOTES_MODEL, PHOTO_PROMPT_TOKENS, PHOTO_MAX_OUTPUT_TOKENS);
  return calculateCallCostInr(AI_NOTES_MODEL, Math.ceil(SHORT_NOTES_MAX_CHARS / 3.5) + 800, SHORT_NOTES_MAX_OUTPUT_TOKENS);
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";
}

function cleanLine(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanList(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanLine(item, maxChars)).filter(Boolean).slice(0, maxItems);
}

// ---------------------------------------------------------------------------
// Photo to notes
// ---------------------------------------------------------------------------

export const PHOTO_NOTES_PROMPT = `You are helping an Indian school or college student turn a photo of a study page into typed notes.
The photo may be handwritten notes, a printed textbook page, a whiteboard or a coaching-class sheet, in English or Hindi.

Rules:
- Type out what is on the page faithfully, in the same language. Do not add facts that are not on the page.
- Tidy it into clear notes: short headings, bullet points, numbered steps. Keep formulas and units exactly (write them in plain text, e.g. v = u + at, H2SO4).
- If a word can't be read, write [unclear]. Describe a diagram in one line in square brackets, e.g. [Diagram: parts of a flower].
- If the photo is not a study page, or is too blurred to read, set readable to false and leave body empty.
- title: a short title for these notes (max 8 words). subject: the school subject if clear (e.g. Physics, Biology), else "".`;

const PHOTO_NOTES_SCHEMA = {
  type: "OBJECT",
  properties: {
    readable: { type: "BOOLEAN" },
    title: { type: "STRING" },
    subject: { type: "STRING" },
    body: { type: "STRING" },
  },
  required: ["readable", "title", "subject", "body"],
};

export function photoNotesRequestBody(image: { data: string; mimeType: string }) {
  return {
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType: image.mimeType, data: image.data } }, { text: PHOTO_NOTES_PROMPT }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: PHOTO_MAX_OUTPUT_TOKENS,
      responseMimeType: "application/json",
      responseSchema: PHOTO_NOTES_SCHEMA,
    },
  };
}

export interface PhotoNotes {
  readable: boolean;
  title: string;
  subject: string;
  body: string;
}

export function parsePhotoNotes(raw: unknown): PhotoNotes {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const body = clean(value.body, 12_000);
  const readable = value.readable !== false && body.length > 0;
  return {
    readable,
    title: cleanLine(value.title, 80) || "Notes from a photo",
    subject: cleanLine(value.subject, 40),
    body: readable ? body : "",
  };
}

/** Checks the photo the phone sent: an allowed picture type, base64, not too big. */
export function checkPhoto(input: unknown): { data: string; mimeType: string } | null {
  if (!input || typeof input !== "object") return null;
  const { data, mimeType } = input as { data?: unknown; mimeType?: unknown };
  if (typeof data !== "string" || typeof mimeType !== "string") return null;
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(mimeType)) return null;
  if (!/^[A-Za-z0-9+/]+=*$/.test(data) || data.length < 100) return null;
  if (Math.floor((data.length * 3) / 4) > PHOTO_MAX_BYTES) return null;
  return { data, mimeType };
}

// ---------------------------------------------------------------------------
// Short notes
// ---------------------------------------------------------------------------

export const SHORT_NOTES_PROMPT = `You are making one page of short notes for revision, for an Indian student (CBSE, NEET, JEE or college).
Use ONLY the chapter text given below. Do not add facts that are not in it. Write in the same language as the chapter.

Return:
- summary: 2–3 sentences on what the chapter is about.
- keyPoints: 6–12 short points a student must remember (one line each).
- terms: up to 10 important words with a one-line meaning each, from the chapter.
- formulas: up to 10 formulas, equations, reactions or laws exactly as in the chapter (plain text), else empty.
- table: one small comparison table if the chapter compares things (e.g. types, differences), else headers and rows empty. Max 5 columns, 8 rows.
- memoryTips: up to 3 short ways to remember tricky points (a mnemonic or link), only if helpful.
- selfCheck: 3–5 short questions to test yourself, answerable from the chapter.`;

const SHORT_NOTES_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    keyPoints: { type: "ARRAY", items: { type: "STRING" } },
    terms: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { term: { type: "STRING" }, meaning: { type: "STRING" } },
        required: ["term", "meaning"],
      },
    },
    formulas: { type: "ARRAY", items: { type: "STRING" } },
    table: {
      type: "OBJECT",
      properties: {
        headers: { type: "ARRAY", items: { type: "STRING" } },
        rows: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } },
      },
      required: ["headers", "rows"],
    },
    memoryTips: { type: "ARRAY", items: { type: "STRING" } },
    selfCheck: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["summary", "keyPoints", "terms", "formulas", "table", "memoryTips", "selfCheck"],
};

export function shortNotesRequestBody(chapterTitle: string, text: string) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          { text: SHORT_NOTES_PROMPT },
          { text: `Chapter: ${chapterTitle}\n\n---\n${text}\n---` },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: SHORT_NOTES_MAX_OUTPUT_TOKENS,
      responseMimeType: "application/json",
      responseSchema: SHORT_NOTES_SCHEMA,
    },
  };
}

export interface ShortNotes {
  summary: string;
  keyPoints: string[];
  terms: { term: string; meaning: string }[];
  formulas: string[];
  table: { headers: string[]; rows: string[][] } | null;
  memoryTips: string[];
  selfCheck: string[];
}

export function parseShortNotes(raw: unknown): ShortNotes | null {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const summary = clean(value.summary, 800);
  const keyPoints = cleanList(value.keyPoints, 14, 240);
  if (!summary && keyPoints.length === 0) return null;
  const terms = Array.isArray(value.terms)
    ? value.terms
        .map((item) => {
          const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
          return { term: cleanLine(row.term, 60), meaning: cleanLine(row.meaning, 200) };
        })
        .filter((row) => row.term && row.meaning)
        .slice(0, 12)
    : [];
  const rawTable = (value.table && typeof value.table === "object" ? value.table : {}) as Record<string, unknown>;
  const headers = cleanList(rawTable.headers, 5, 40);
  const rows = Array.isArray(rawTable.rows)
    ? rawTable.rows
        .map((row) => cleanList(row, headers.length, 120))
        .filter((row) => row.length > 0)
        .map((row) => [...row, ...Array(Math.max(0, headers.length - row.length)).fill("")])
        .slice(0, 8)
    : [];
  return {
    summary,
    keyPoints,
    terms,
    formulas: cleanList(value.formulas, 12, 160),
    table: headers.length >= 2 && rows.length > 0 ? { headers, rows } : null,
    memoryTips: cleanList(value.memoryTips, 3, 200),
    selfCheck: cleanList(value.selfCheck, 5, 200),
  };
}

/** Plain text for My Notes (and Listen), with simple headings. */
export function shortNotesAsText(notes: ShortNotes): string {
  const parts: string[] = [];
  if (notes.summary) parts.push(notes.summary);
  if (notes.keyPoints.length) parts.push(`Key points\n${notes.keyPoints.map((point) => `• ${point}`).join("\n")}`);
  if (notes.terms.length) parts.push(`Words to know\n${notes.terms.map((row) => `• ${row.term}: ${row.meaning}`).join("\n")}`);
  if (notes.formulas.length) parts.push(`Formulas\n${notes.formulas.map((item) => `• ${item}`).join("\n")}`);
  if (notes.table) {
    parts.push(
      `Table\n${[notes.table.headers, ...notes.table.rows].map((row) => row.join(" | ")).join("\n")}`
    );
  }
  if (notes.memoryTips.length) parts.push(`Remember it\n${notes.memoryTips.map((item) => `• ${item}`).join("\n")}`);
  if (notes.selfCheck.length) parts.push(`Test yourself\n${notes.selfCheck.map((item, index) => `${index + 1}. ${item}`).join("\n")}`);
  return parts.join("\n\n");
}

/** Book text for one chapter, trimmed to the most we send. */
export function chapterTextForShortNotes(chunks: readonly { text: string }[]): string {
  let text = "";
  for (const chunk of chunks) {
    const piece = chunk.text.replace(/\s+/g, " ").trim();
    if (!piece) continue;
    const next = text ? `${text}\n${piece}` : piece;
    if (next.length > SHORT_NOTES_MAX_CHARS) {
      text = next.slice(0, SHORT_NOTES_MAX_CHARS);
      break;
    }
    text = next;
  }
  return text;
}

export function aiNotesFailureMessage(status: number): string {
  if (status === 429) return "The AI is busy right now. Nothing was counted. Please try again in a minute.";
  if (status === 400) return "That couldn't be read. Nothing was counted. Try a clearer photo or another chapter.";
  return "Notes couldn't be made just now. Nothing was counted. Please try again later.";
}
