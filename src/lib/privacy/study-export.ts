/**
 * "Download my study data" (owner, 15 Nov 2026). Another study app lost students' work in an
 * update; ORYZEN lets a student keep their own copy at any time: notes from their account plus
 * everything private kept on this device (plans, revision progress, highlights, quiz progress).
 * Built in the browser. Nothing new is sent anywhere.
 */

export const STUDY_EXPORT_VERSION = 1;

export interface ExportNote {
  id: string;
  subject_id: string;
  title: string;
  body: string | null;
  updated_at: string;
}

export interface ExportSubject {
  id: string;
  title: string;
}

export interface StudyExport {
  app: "ORYZEN Learn";
  version: number;
  exportedAt: string;
  notes: { subjects: ExportSubject[]; notes: ExportNote[] };
  /** Private records from this device, by name; JSON values are kept as JSON. */
  deviceRecords: Record<string, unknown>;
}

function parseMaybeJson(value: string): unknown {
  const text = value.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

export function buildStudyExport(input: {
  subjects: ExportSubject[];
  notes: ExportNote[];
  records: Record<string, string>;
  now?: Date;
}): StudyExport {
  const deviceRecords: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(input.records).sort(([a], [b]) => a.localeCompare(b))) {
    deviceRecords[name] = parseMaybeJson(value);
  }
  return {
    app: "ORYZEN Learn",
    version: STUDY_EXPORT_VERSION,
    exportedAt: (input.now ?? new Date()).toISOString(),
    notes: { subjects: input.subjects, notes: input.notes },
    deviceRecords,
  };
}

/** The notes as plain text anyone can open: subject, then each note with its title. */
export function notesAsText(subjects: ExportSubject[], notes: ExportNote[], now: Date = new Date()): string {
  const names = new Map(subjects.map((subject) => [subject.id, subject.title]));
  const bySubject = new Map<string, ExportNote[]>();
  for (const note of notes) {
    const key = names.get(note.subject_id) ?? "Other notes";
    bySubject.set(key, [...(bySubject.get(key) ?? []), note]);
  }
  const lines = [`My ORYZEN notes (downloaded ${now.toISOString().slice(0, 10)})`, ""];
  for (const [subject, list] of [...bySubject.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`=== ${subject} ===`, "");
    for (const note of list) {
      lines.push(`## ${note.title || "Untitled"}`, (note.body ?? "").trim(), "");
    }
  }
  if (notes.length === 0) lines.push("No notes saved yet.");
  return `${lines.join("\n").trim()}\n`;
}

export function exportFileName(kind: "json" | "txt", now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return kind === "json" ? `oryzen-study-data-${day}.json` : `oryzen-notes-${day}.txt`;
}
