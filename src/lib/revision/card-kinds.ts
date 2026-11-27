import type { RevisionNote } from "@/lib/revision/cards";

/**
 * More card types from the student's own notes (owner, 27 Nov 2026, after StudyTab), with no AI:
 * fill-the-gap, multiple choice (the wrong options are answers from the student's other notes)
 * and matching. Plain flip cards stay for everything else.
 */
export type CardKind = "flip" | "cloze" | "choice";

export interface ClozeCard {
  kind: "cloze";
  text: string; // with "_____" for the gap
  answer: string;
}

export interface ChoiceCard {
  kind: "choice";
  question: string;
  options: string[];
  correct: number;
}

export type CardView = { kind: "flip" } | ClozeCard | ChoiceCard;

export const GAP = "_____";

export function plain(text: string): string {
  return text
    .replace(/\{\{c\d+::([^}]*?)(?:::[^}]*)?\}\}/g, "$1")
    .replace(/[*_`~=]+/g, "")
    .replace(/^[ \t]*(?:#{1,6}|>|[-+]|\d+\.)[ \t]+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first sentence, up to ~140 characters: the short answer used in choices and matching. */
export function shortAnswer(body: string): string {
  const text = plain(body);
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return sentence.length <= 140 ? sentence : `${sentence.slice(0, 137).replace(/\s+\S*$/, "")}…`;
}

function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A gap for: an Anki cloze ({{c1::term}}), a **bold** or ==marked== word, or the note's title
 * when the title appears in the text. Null when there is nothing sensible to hide.
 */
export function clozeFrom(note: Pick<RevisionNote, "title" | "body">): ClozeCard | null {
  const body = note.body ?? "";
  const marked = /\{\{c\d+::([^}]*?)(?:::[^}]*)?\}\}/.exec(body) ?? /\*\*([^*\n]{2,60})\*\*/.exec(body) ?? /==([^=\n]{2,60})==/.exec(body);
  const source = plain(body);
  if (source.length < 20) return null;
  let answer = marked ? plain(marked[1]) : "";
  if (!answer) {
    const title = plain(note.title).replace(/[:?.!]+$/, "");
    if (title.length >= 3 && title.split(" ").length <= 5 && new RegExp(`\\b${escapeRe(title)}\\b`, "i").test(source)) {
      answer = title;
    }
  }
  if (!answer || answer.length > 60) return null;
  const sentence =
    source.split(/(?<=[.!?])\s/).find((part) => new RegExp(escapeRe(answer), "i").test(part)) ?? source;
  const text = sentence.replace(new RegExp(escapeRe(answer), "i"), GAP);
  if (!text.includes(GAP) || text.length > 320) return null;
  return { kind: "cloze", text, answer };
}

/** Multiple choice: the note's short answer and three from other notes (same subject first). */
export function choiceFrom(note: RevisionNote, pool: readonly RevisionNote[], seed: string): ChoiceCard | null {
  const correct = shortAnswer(note.body);
  if (correct.length < 3) return null;
  const seen = new Set([correct.toLowerCase()]);
  const others = [...pool]
    .filter((other) => other.id !== note.id && !other.audioId && other.body.trim())
    .sort((a, b) => Number(b.subject === note.subject) - Number(a.subject === note.subject));
  const distractors: string[] = [];
  for (const other of others) {
    const option = shortAnswer(other.body);
    if (option.length < 3 || seen.has(option.toLowerCase())) continue;
    seen.add(option.toLowerCase());
    distractors.push(option);
    if (distractors.length === 3) break;
  }
  if (distractors.length < 3) return null;
  const random = seeded(seed);
  const options = [correct, ...distractors];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { kind: "choice", question: plain(note.title), options, correct: options.indexOf(correct) };
}

/** Which way to show a card today: varies by day, so the same note is asked different ways. */
export function cardView(note: RevisionNote, pool: readonly RevisionNote[], day: string): CardView {
  if (note.audioId) return { kind: "flip" };
  const cloze = clozeFrom(note);
  const choice = choiceFrom(note, pool, `${note.id}:${day}`);
  const kinds: CardView[] = [{ kind: "flip" }];
  if (cloze) kinds.push(cloze);
  if (choice) kinds.push(choice);
  return kinds[Math.floor(seeded(`${note.id}|${day}`)() * kinds.length)];
}

export interface MatchRound {
  pairs: Array<{ id: string; left: string; right: string }>;
  /** The right-hand answers in shuffled order (indexes into pairs). */
  order: number[];
}

/** A matching round: up to 4 notes, title on the left, short answer on the right. */
export function matchRound(notes: readonly RevisionNote[], seed: string, size = 4): MatchRound | null {
  const usable = notes.filter((note) => !note.audioId && note.title.trim() && shortAnswer(note.body).length >= 3);
  const unique = new Map<string, RevisionNote>();
  for (const note of usable) {
    const key = shortAnswer(note.body).toLowerCase();
    if (!unique.has(key)) unique.set(key, note);
  }
  const random = seeded(seed);
  const picked = [...unique.values()].sort(() => random() - 0.5).slice(0, size);
  if (picked.length < 3) return null;
  const pairs = picked.map((note) => ({ id: note.id, left: plain(note.title), right: shortAnswer(note.body) }));
  const order = pairs.map((_, index) => index).sort(() => random() - 0.5);
  if (order.every((value, index) => value === index)) order.push(order.shift() as number);
  return { pairs, order };
}

/** Typed answer for a gap: forgiving about case, spaces and punctuation. */
export function gapAnswerMatches(typed: string, answer: string): boolean {
  const norm = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return norm(typed) !== "" && norm(typed) === norm(answer);
}
