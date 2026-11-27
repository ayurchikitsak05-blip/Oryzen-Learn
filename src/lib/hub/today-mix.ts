/**
 * "Today's mix" on Today (owner, 27 Nov 2026): three small things to start with, built only
 * from the student's own data. No AI, so no cost.
 */
export type MixKind = "revision" | "lecture" | "note";

export interface MixItem {
  kind: MixKind;
  kicker: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
}

export interface MixInput {
  today: string;
  /** Cards due today; null while unknown. */
  revisionDue: number | null;
  /** How many of the student's notes can become cards. */
  noteCount: number;
  lastLecture: { videoId: string; title: string; topics: number } | null;
  notes: ReadonlyArray<{ title: string; body: string | null }>;
  /** A pre-written study tip for days without notes. */
  fallbackTip: string | null;
}

function dayIndex(day: string, length: number): number {
  if (length <= 0) return 0;
  let hash = 0;
  for (const ch of day) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % length;
}

export function plainText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`~]+/g, "")
    .replace(/^[ \t]*(?:#{1,6}|>|[-+]|\d+\.)[ \t]+/gm, "")
    .replace(/[[\]|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

export function buildTodayMix(input: MixInput): MixItem[] {
  const items: MixItem[] = [];

  if (input.revisionDue != null && input.revisionDue > 0) {
    const minutes = Math.max(1, Math.round(input.revisionDue * 0.6));
    items.push({
      kind: "revision",
      kicker: "Quick check",
      title: `${input.revisionDue} card${input.revisionDue === 1 ? "" : "s"} due today`,
      detail: `From your own notes · about ${minutes} min`,
      href: "/revise",
      cta: "Start",
    });
  } else if (input.noteCount > 0) {
    items.push({
      kind: "revision",
      kicker: "Quick check",
      title: "All caught up",
      detail: "Practise 5 extra cards from your notes",
      href: "/revise",
      cta: "Practise",
    });
  } else {
    items.push({
      kind: "revision",
      kicker: "Quick check",
      title: "Make your first revision cards",
      detail: "Save a highlight or a note while reading; it becomes a card",
      href: "/reader",
      cta: "Open a book",
    });
  }

  if (input.lastLecture) {
    const topics = input.lastLecture.topics;
    items.push({
      kind: "lecture",
      kicker: "Lecture recap",
      title: clip(input.lastLecture.title || "Your lecture", 60),
      detail: topics > 0 ? `${topics} topic${topics === 1 ? "" : "s"} marked · pick up where you left off` : "Pick up where you left off",
      href: `/video?v=${encodeURIComponent(input.lastLecture.videoId)}`,
      cta: "Resume",
    });
  } else {
    items.push({
      kind: "lecture",
      kicker: "Lectures",
      title: "Study from a YouTube lecture",
      detail: "Paste a link; jump to each topic. Free",
      href: "/video",
      cta: "Add",
    });
  }

  const usable = input.notes.filter((note) => plainText(`${note.title} ${note.body ?? ""}`).length > 12);
  if (usable.length > 0) {
    const note = usable[dayIndex(input.today, usable.length)];
    const body = plainText(note.body ?? "");
    items.push({
      kind: "note",
      kicker: "From your notes",
      title: clip(plainText(note.title) || "A note to look at again", 60),
      detail: body ? clip(body, 110) : "Read it once more today",
      href: "/notes",
      cta: "Open",
    });
  } else if (input.fallbackTip) {
    items.push({
      kind: "note",
      kicker: "Idea of the day",
      title: clip(input.fallbackTip, 70),
      detail: "A study tip for today",
      href: "/techniques",
      cta: "More",
    });
  }
  return items;
}
