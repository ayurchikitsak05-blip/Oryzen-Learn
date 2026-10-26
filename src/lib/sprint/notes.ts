import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";
import { scopedReaderStorageKey } from "@/lib/reader/local-scope";
import { markNotesLinked } from "./engine";
import { upsertSprintSession } from "./persist";
import type { SprintSession } from "./types";

export const SPRINT_NOTES_KEY = "oryzen_sprint_notes_v1";

export type SprintNoteKind = "session" | "companion" | "explanation";

export interface SprintNote {
  id: string;
  sessionId: string;
  kind: SprintNoteKind;
  title: string;
  body: string;
  source: string;
  documentTitle: string;
  pageNumber: number;
  createdAt: string;
}

export function sprintNotesKey(userId?: string | null): string {
  return scopedReaderStorageKey(SPRINT_NOTES_KEY, userId);
}

function sanitizeNote(value: unknown): SprintNote | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<SprintNote>;
  if (typeof raw.id !== "string" || !raw.id.trim()) return null;
  if (typeof raw.body !== "string" || !raw.body.trim()) return null;
  return {
    id: raw.id.trim(),
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : "",
    kind:
      raw.kind === "companion" || raw.kind === "explanation" || raw.kind === "session"
        ? raw.kind
        : "session",
    title: typeof raw.title === "string" ? raw.title.trim() : "Study note",
    body: raw.body.trim().slice(0, 8000),
    source: typeof raw.source === "string" ? raw.source.trim() : "StudySprint",
    documentTitle: typeof raw.documentTitle === "string" ? raw.documentTitle.trim() : "",
    pageNumber: Math.max(0, Math.round(Number(raw.pageNumber) || 0)),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
}

export function listSprintNotes(userId?: string | null): SprintNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = readPrivateString(SPRINT_NOTES_KEY, userId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed)
      ? parsed.map(sanitizeNote).filter((item): item is SprintNote => Boolean(item)).slice(-80)
      : [];
  } catch {
    return [];
  }
}

export function saveSprintNote(
  input: {
    session: SprintSession;
    kind: SprintNoteKind;
    title: string;
    body: string;
    source?: string;
  },
  userId?: string | null
): SprintNote {
  const title = input.title.replace(/\s+/g, " ").trim() || input.session.goal;
  const body = input.body.replace(/\s+/g, " ").trim();
  const source =
    input.source ??
    [
      input.session.documentTitle || input.session.subject || "StudySprint",
      input.session.pageNumber ? `p.${input.session.pageNumber}` : "",
      input.session.sectionHeading || input.session.chapter || input.session.topic,
    ]
      .filter(Boolean)
      .join(" · ");
  const note: SprintNote = {
    id: `snote-${Date.now().toString(36)}`,
    sessionId: input.session.id,
    kind: input.kind,
    title,
    body,
    source,
    documentTitle: input.session.documentTitle,
    pageNumber: input.session.pageNumber,
    createdAt: new Date().toISOString(),
  };
  const next = [...listSprintNotes(userId), note].slice(-80);
  if (typeof window !== "undefined") {
    writePrivateString(SPRINT_NOTES_KEY, JSON.stringify(next), userId);
  }
  upsertSprintSession(markNotesLinked(input.session), userId);
  return note;
}
