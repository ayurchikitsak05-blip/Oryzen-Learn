/**
 * Note formats (owner, 11 Nov 2026): Cornell, Outline, Table, Flowchart and Mind map.
 * Free to run: no AI and no new storage. A formatted note is saved as ordinary, readable
 * text in My Notes, starting with a "Format: …" line that tells the app how to draw it.
 * Cornell questions become Morning revision cards ("cover the answer, recall, check").
 */

export type NoteFormat = "plain" | "cornell" | "outline" | "table" | "flowchart" | "mindmap";

export const NOTE_FORMATS: readonly { id: NoteFormat; label: string; hint: string; bestFor: string }[] = [
  { id: "plain", label: "Plain", hint: "Write freely, one point per line.", bestFor: "Quick notes in class" },
  {
    id: "cornell",
    label: "Cornell",
    hint: "A question on the left, its answer on the right, and a short summary. Each question becomes a revision card.",
    bestFor: "Remembering facts for exams",
  },
  { id: "outline", label: "Outline", hint: "Headings, sub-headings and points.", bestFor: "Long chapters and theory answers" },
  { id: "table", label: "Table", hint: "Compare things side by side.", bestFor: "Differences, types, drug or dosha comparisons" },
  { id: "flowchart", label: "Flowchart", hint: "Steps in order, joined by arrows.", bestFor: "Processes, mechanisms, pathogenesis" },
  { id: "mindmap", label: "Mind map", hint: "One main topic with branches.", bestFor: "Seeing a whole chapter at a glance" },
];

const HEADER: Record<Exclude<NoteFormat, "plain">, string> = {
  cornell: "Format: Cornell",
  outline: "Format: Outline",
  table: "Format: Table",
  flowchart: "Format: Flowchart",
  mindmap: "Format: Mind map",
};

export interface CornellPair {
  q: string;
  a: string;
}

export interface OutlineItem {
  level: 0 | 1 | 2;
  text: string;
}

export type FormattedNote =
  | { format: "plain"; text: string }
  | { format: "cornell"; pairs: CornellPair[]; summary: string }
  | { format: "outline" | "mindmap"; items: OutlineItem[] }
  | { format: "table"; rows: string[][] }
  | { format: "flowchart"; steps: string[] };

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cell(value: string): string {
  return oneLine(value).replace(/\|/g, "/");
}

/** Which format a saved note is in. */
export function noteFormatOf(body: string | null | undefined): NoteFormat {
  const first = (body ?? "").split("\n", 1)[0].trim().toLowerCase();
  for (const [format, header] of Object.entries(HEADER) as [Exclude<NoteFormat, "plain">, string][]) {
    if (first === header.toLowerCase()) return format;
  }
  return "plain";
}

/** Turns a structured note into the text saved in My Notes. */
export function serializeNote(note: FormattedNote): string {
  switch (note.format) {
    case "plain":
      return note.text.trim();
    case "cornell": {
      const pairs = note.pairs
        .map((pair) => ({ q: oneLine(pair.q), a: pair.a.trim() }))
        .filter((pair) => pair.q || pair.a)
        .map((pair) => `Q: ${pair.q}\nA: ${pair.a.replace(/\n+/g, " / ")}`);
      const summary = oneLine(note.summary);
      return [HEADER.cornell, ...pairs, ...(summary ? [`Summary: ${summary}`] : [])].join("\n\n");
    }
    case "outline":
    case "mindmap": {
      const lines = note.items
        .filter((item) => oneLine(item.text))
        .map((item) => `${"  ".repeat(item.level)}- ${oneLine(item.text)}`);
      return [HEADER[note.format], ...lines].join("\n");
    }
    case "table": {
      const width = Math.max(0, ...note.rows.map((row) => row.length));
      const rows = note.rows
        .map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")].map(cell))
        .filter((row) => row.some(Boolean))
        .map((row) => row.join(" | "));
      return [HEADER.table, ...rows].join("\n");
    }
    case "flowchart": {
      const steps = note.steps.map(oneLine).filter(Boolean).map((step, index) => `${index + 1}. ${step}`);
      return [HEADER.flowchart, ...steps].join("\n");
    }
  }
}

/** Reads a saved note back into its structure (tolerant of hand edits). */
export function parseNote(body: string | null | undefined): FormattedNote {
  const text = (body ?? "").replace(/\r\n/g, "\n");
  const format = noteFormatOf(text);
  if (format === "plain") return { format: "plain", text };
  const lines = text.split("\n").slice(1);

  if (format === "cornell") {
    const pairs: CornellPair[] = [];
    let summary = "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^q\s*:/i.test(line)) pairs.push({ q: line.replace(/^q\s*:\s*/i, ""), a: "" });
      else if (/^a\s*:/i.test(line)) {
        const answer = line.replace(/^a\s*:\s*/i, "");
        if (pairs.length && !pairs[pairs.length - 1].a) pairs[pairs.length - 1].a = answer;
        else pairs.push({ q: "", a: answer });
      } else if (/^summary\s*:/i.test(line)) summary = line.replace(/^summary\s*:\s*/i, "");
      else if (pairs.length) {
        const last = pairs[pairs.length - 1];
        if (last.a) last.a = `${last.a} ${line}`;
        else last.q = `${last.q} ${line}`.trim();
      } else summary = `${summary} ${line}`.trim();
    }
    return { format, pairs, summary };
  }

  if (format === "outline" || format === "mindmap") {
    const items: OutlineItem[] = [];
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const indent = raw.match(/^\s*/)?.[0].replace(/\t/g, "  ").length ?? 0;
      const level = Math.min(2, Math.floor(indent / 2)) as 0 | 1 | 2;
      items.push({ level, text: raw.trim().replace(/^[-*•]\s*/, "") });
    }
    return { format, items };
  }

  if (format === "table") {
    const rows = lines.filter((line) => line.trim()).map((line) => line.split("|").map((value) => value.trim()));
    return { format, rows };
  }

  const steps = lines
    .map((line) => line.trim().replace(/^(\d+[.)]|→|->|-)\s*/, ""))
    .filter(Boolean);
  return { format: "flowchart", steps };
}

/** An empty note to start the editor with. */
export function blankNote(format: NoteFormat): FormattedNote {
  switch (format) {
    case "plain":
      return { format, text: "" };
    case "cornell":
      return { format, pairs: [{ q: "", a: "" }, { q: "", a: "" }], summary: "" };
    case "outline":
      return { format, items: [{ level: 0, text: "" }, { level: 1, text: "" }] };
    case "mindmap":
      return { format, items: [{ level: 0, text: "" }, { level: 1, text: "" }, { level: 0, text: "" }] };
    case "table":
      return { format, rows: [["", "", ""], ["", "", ""], ["", "", ""]] };
    case "flowchart":
      return { format, steps: ["", "", ""] };
  }
}

/** Something has been written (a note with only empty rows isn't worth saving). */
export function noteHasContent(note: FormattedNote): boolean {
  switch (note.format) {
    case "plain":
      return Boolean(note.text.trim());
    case "cornell":
      return note.pairs.some((pair) => pair.q.trim() && pair.a.trim()) || Boolean(note.summary.trim());
    case "outline":
    case "mindmap":
      return note.items.some((item) => item.text.trim());
    case "table":
      return note.rows.flat().some((value) => value.trim());
    case "flowchart":
      return note.steps.some((step) => step.trim());
  }
}

/** Text for Listen: no "Format:" line, and questions read naturally. */
export function noteTextForReading(title: string, body: string): string {
  const note = parseNote(body);
  switch (note.format) {
    case "plain":
      return `${title}. ${note.text}`;
    case "cornell":
      return [title, ...note.pairs.map((pair) => `${pair.q} ${pair.a}`), note.summary ? `Summary. ${note.summary}` : ""]
        .filter(Boolean)
        .join(". ");
    case "outline":
    case "mindmap":
      return [title, ...note.items.map((item) => item.text)].join(". ");
    case "table": {
      const [head = [], ...rows] = note.rows;
      return [title, ...rows.map((row) => row.map((value, index) => (head[index] ? `${head[index]}: ${value}` : value)).join(", "))].join(". ");
    }
    case "flowchart":
      return [title, ...note.steps.map((step, index) => `Step ${index + 1}. ${step}`)].join(". ");
  }
}

/** Short preview text for sticky notes and lists (no "Format:" line). */
export function notePreviewText(body: string): string {
  const note = parseNote(body);
  if (note.format === "plain") return note.text;
  if (note.format === "cornell") return note.pairs.map((pair) => `${pair.q} ${pair.a}`).join("\n");
  if (note.format === "outline" || note.format === "mindmap") return note.items.map((item) => item.text).join("\n");
  if (note.format === "table") return note.rows.map((row) => row.join(" | ")).join("\n");
  return note.steps.join(" → ");
}

/** Cornell questions with answers, for revision cards. */
export function cornellCards(body: string): CornellPair[] {
  const note = parseNote(body);
  if (note.format !== "cornell") return [];
  return note.pairs.filter((pair) => pair.q.trim() && pair.a.trim());
}

/** Card ids for a Cornell note: one per question. */
export function cornellCardId(noteId: string, index: number): string {
  return `${noteId}#q${index + 1}`;
}

// ---------------------------------------------------------------------------
// Saving an AI answer the student already has as a note (no new AI call).
// ---------------------------------------------------------------------------

/** Lines that look like steps or points, from an answer's text. */
export function linesFromAnswer(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^(\d+[.)]|[-*•→]|->)\s*/, "").replace(/\*\*/g, ""))
    .filter((line) => line.length > 1 && !/^#+\s*$/.test(line))
    .map((line) => line.replace(/^#+\s*/, ""))
    .slice(0, 30);
}

export function answerAsFlowchart(text: string): FormattedNote {
  return { format: "flowchart", steps: linesFromAnswer(text) };
}

export function answerAsOutline(text: string): FormattedNote {
  const items: OutlineItem[] = text
    .split("\n")
    .filter((line) => line.trim())
    .slice(0, 40)
    .map((raw) => {
      const heading = /^\s*#+\s/.test(raw);
      const indent = raw.match(/^\s*/)?.[0].length ?? 0;
      const level = (heading ? 0 : indent >= 4 ? 2 : 1) as 0 | 1 | 2;
      return { level, text: raw.trim().replace(/^(#+|\d+[.)]|[-*•])\s*/, "").replace(/\*\*/g, "") };
    })
    .filter((item) => item.text.length > 1);
  return { format: "outline", items };
}

/** A markdown or "a | b" table in an answer, as table rows; null if there isn't one. */
export function answerAsTable(text: string): FormattedNote | null {
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("|") && !/^\|?\s*:?-{2,}/.test(line))
    .map((line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((value) => value.trim().replace(/\*\*/g, "")));
  if (rows.length < 2 || rows[0].length < 2) return null;
  return { format: "table", rows: rows.slice(0, 20) };
}
