/**
 * Anki import (owner, 27 Nov 2026, after StudyTab). Turns an Anki deck into the student's own
 * notes, which become revision cards. Works in the browser; no AI. Supports Anki's plain-text
 * export (.txt / .csv / .tsv) and deck packages (.apkg) saved with "Support older Anki versions".
 */
export interface ImportedCard {
  title: string;
  body: string;
}

export interface ImportedDeck {
  name: string;
  cards: ImportedCard[];
  /** Cards skipped because they were empty or duplicates. */
  skipped: number;
}

export const MAX_IMPORT_CARDS = 2000;
const MAX_TITLE = 300;
const MAX_BODY = 5000;

/** Plain text from an Anki field: line breaks kept, tags and sound/image references removed. */
export function cleanField(html: string): string {
  return html
    .replace(/\[sound:[^\]]*\]/g, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const CLOZE = /\{\{c\d+::(.*?)(?:::.*?)?\}\}/g;

/** One card from Anki fields. A cloze note keeps its {{c1::…}} so it becomes a fill-the-gap card. */
export function cardFromFields(fields: readonly string[]): ImportedCard | null {
  const front = cleanField(fields[0] ?? "");
  const back = cleanField(fields.slice(1).filter(Boolean).join("\n\n"));
  if (!front) return null;
  if (CLOZE.test(front)) {
    CLOZE.lastIndex = 0;
    const title = front.replace(CLOZE, "…").split("\n")[0].slice(0, MAX_TITLE);
    return { title, body: `${front}${back ? `\n\n${back}` : ""}`.slice(0, MAX_BODY) };
  }
  if (!back) return null;
  return { title: front.replace(/\n+/g, " ").slice(0, MAX_TITLE), body: back.slice(0, MAX_BODY) };
}

function finish(name: string, cards: Array<ImportedCard | null>, total: number): ImportedDeck {
  const seen = new Set<string>();
  const out: ImportedCard[] = [];
  for (const card of cards) {
    if (!card) continue;
    const key = `${card.title}\u0000${card.body}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
    if (out.length >= MAX_IMPORT_CARDS) break;
  }
  return { name: name.trim() || "Imported deck", cards: out, skipped: Math.max(0, total - out.length) };
}

/** Splits one line of a delimited file, honouring double quotes. */
function splitLine(line: string, separator: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === separator) {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
}

/** Anki "Notes in Plain Text" (and simple CSV/TSV): front, back per line; "#key:value" headers. */
export function parseAnkiText(text: string, fileName = "Imported deck"): ImportedDeck {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let separator = "";
  let deck = fileName.replace(/\.(txt|csv|tsv)$/i, "");
  const rows: string[] = [];
  for (const line of lines) {
    const header = /^#([a-z ]+):(.*)$/i.exec(line);
    if (header) {
      const key = header[1].trim().toLowerCase();
      const value = header[2].trim();
      if (key === "separator") separator = { tab: "\t", comma: ",", semicolon: ";", pipe: "|", space: " " }[value.toLowerCase()] ?? value;
      if (key === "deck") deck = value || deck;
      continue;
    }
    if (line.trim()) rows.push(line);
  }
  if (!separator) {
    const sample = rows.slice(0, 20).join("\n");
    separator = sample.includes("\t") ? "\t" : (sample.match(/;/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? ";" : ",";
  }
  const cards = rows.map((row) => cardFromFields(splitLine(row, separator)));
  return finish(deck, cards, rows.length);
}

/** Deck name from the collection's deck list (the first one that isn't "Default"). */
export function deckNameFrom(decksJson: string | null, fallback: string): string {
  try {
    const decks = Object.values(JSON.parse(decksJson ?? "{}") as Record<string, { name?: string }>)
      .map((deck) => deck.name ?? "")
      .filter((name) => name && name !== "Default");
    const name = decks.sort((a, b) => a.length - b.length)[0];
    return name ? name.split("::").pop() ?? name : fallback;
  } catch {
    return fallback;
  }
}

export class NewAnkiFormatError extends Error {
  constructor() {
    super(
      "This deck uses Anki's newest format. In Anki, choose File → Export → “Anki Deck Package” and tick “Support older Anki versions”, or export “Notes in Plain Text”, then import that file."
    );
  }
}

/** Reads an .apkg (zip with an SQLite collection) in the browser. */
export async function parseApkg(bytes: Uint8Array, fileName = "Imported deck", wasmUrl = "/vendor/sql-wasm-1.12.0.wasm"): Promise<ImportedDeck> {
  const { unzipSync } = await import("fflate");
  const files = unzipSync(bytes, { filter: (file) => /^collection\.anki2(1b?)?$/.test(file.name) });
  const legacy = files["collection.anki21"] ?? files["collection.anki2"];
  if (!legacy) {
    if (files["collection.anki21b"]) throw new NewAnkiFormatError();
    throw new Error("This file doesn't look like an Anki deck.");
  }
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database(legacy);
  try {
    const fallback = fileName.replace(/\.apkg$/i, "");
    const decks = db.exec("SELECT decks FROM col LIMIT 1")[0]?.values?.[0]?.[0];
    const name = deckNameFrom(typeof decks === "string" ? decks : null, fallback);
    const rows = db.exec("SELECT flds FROM notes")[0]?.values ?? [];
    // An old-format placeholder deck (new Anki writes one card saying "please update").
    if (rows.length === 1 && /update to the latest anki/i.test(String(rows[0][0]))) throw new NewAnkiFormatError();
    const cards = rows.map((row) => cardFromFields(String(row[0] ?? "").split("\u001f")));
    return finish(name, cards, rows.length);
  } finally {
    db.close();
  }
}
