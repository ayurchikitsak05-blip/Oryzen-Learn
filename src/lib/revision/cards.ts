import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";

/**
 * Morning revision cards from the student's own notes (design board "Alarm quiz", 3 Nov 2026).
 * No AI: the front is the note's title, the back is what the student saved. Cards the student
 * remembers come back less often (1, 3, 7, then 14 days); ones they don't come back tomorrow.
 */

export const REVISION_STATE_KEY = "oryzen_revision_cards_v1";
export const CARDS_PER_DAY = 5;
export const BOX_INTERVAL_DAYS = [1, 3, 7, 14] as const;

export interface RevisionNote {
  id: string;
  title: string;
  body: string;
  subject: string;
  updatedAt: string;
  /** Set for a voice note: the answer is the student's own recording. */
  audioId?: string;
}

export interface CardState {
  box: number;
  due: string;
  lastSeen: string;
}

export type RevisionState = Record<string, CardState>;

export function addDaysIso(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Today's cards: due cards first (weakest first), then notes never revised (newest first). */
export function pickTodayCards(
  notes: readonly RevisionNote[],
  state: RevisionState,
  today: string,
  max: number = CARDS_PER_DAY
): RevisionNote[] {
  const usable = notes.filter((note) => note.title.trim() && note.body.trim());
  const due = usable
    .filter((note) => state[note.id] && state[note.id].due <= today)
    .sort((a, b) => state[a.id].box - state[b.id].box || state[a.id].due.localeCompare(state[b.id].due));
  const fresh = usable
    .filter((note) => !state[note.id])
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...due, ...fresh].slice(0, max);
}

export function gradeCard(state: RevisionState, noteId: string, remembered: boolean, today: string): RevisionState {
  const current = state[noteId];
  const box = remembered ? Math.min((current?.box ?? 0) + 1, BOX_INTERVAL_DAYS.length) : 0;
  const days = remembered ? BOX_INTERVAL_DAYS[box - 1] : 1;
  return { ...state, [noteId]: { box, due: addDaysIso(today, days), lastSeen: today } };
}

export function countDueToday(notes: readonly RevisionNote[], state: RevisionState, today: string): number {
  return pickTodayCards(notes, state, today).length;
}

export function readRevisionState(userId?: string | null): RevisionState {
  try {
    const raw = readPrivateString(REVISION_STATE_KEY, userId);
    const value = raw ? (JSON.parse(raw) as RevisionState) : {};
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function writeRevisionState(state: RevisionState, userId?: string | null): void {
  try {
    writePrivateString(REVISION_STATE_KEY, JSON.stringify(state), userId);
  } catch {
    /* locked record: progress for this round isn't kept */
  }
}

/** Google Calendar link for Android phones, which can't open .ics files. */
export function googleCalendarReminderUrl(input: { time: string; startDay: string; url: string }): string {
  const [hour, minute] = input.time.split(":");
  const day = input.startDay.replace(/-/g, "");
  const start = `${day}T${hour}${minute}00`;
  const endAt = new Date(`${input.startDay}T${hour}:${minute}:00Z`);
  endAt.setUTCMinutes(endAt.getUTCMinutes() + 5);
  const end = endAt.toISOString().replace(/[-:]/g, "").slice(0, 15);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: "Morning revision (ORYZEN Learn)",
    details: `5 quick cards from your notes, about 3 minutes. Open: ${input.url}`,
    dates: `${start}/${end}`,
    recur: "RRULE:FREQ=DAILY",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Remembers that today's round is done, so a reload doesn't start a new one. */
export const REVISION_DONE_KEY = "oryzen_revision_done_v1";

export function markRevisionDone(userId: string, today: string): void {
  try {
    window.localStorage.setItem(REVISION_DONE_KEY, JSON.stringify({ userId, today }));
  } catch {
    /* ignore */
  }
}

export function revisionDoneToday(userId: string, today: string): boolean {
  try {
    const value = JSON.parse(window.localStorage.getItem(REVISION_DONE_KEY) ?? "null") as { userId?: string; today?: string } | null;
    return value?.userId === userId && value?.today === today;
  } catch {
    return false;
  }
}

/* Daily reminder in the phone's own calendar: reliable on every phone, needs no server. */

export const REVISION_TIME_KEY = "oryzen_revision_time_v1";

export function readRevisionTime(): string {
  try {
    const value = window.localStorage.getItem(REVISION_TIME_KEY) ?? "";
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "07:00";
  } catch {
    return "07:00";
  }
}

export function writeRevisionTime(value: string): void {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return;
  try {
    window.localStorage.setItem(REVISION_TIME_KEY, value);
  } catch {
    /* ignore */
  }
}

function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** A daily calendar event with an alert at the chosen time that opens /revise. */
export function revisionReminderIcs(input: { time: string; startDay: string; url: string; now?: Date }): string {
  const [hour, minute] = input.time.split(":");
  const day = input.startDay.replace(/-/g, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ORYZEN Learn//Morning revision//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    // One fixed id: adding it again with a new time replaces the old reminder instead of adding a second.
    "UID:oryzen-morning-revision@oryzen-learn",
    `DTSTAMP:${icsStamp(input.now ?? new Date())}`,
    `DTSTART:${day}T${hour}${minute}00`,
    "DURATION:PT5M",
    "RRULE:FREQ=DAILY",
    "SUMMARY:Morning revision (ORYZEN Learn)",
    `DESCRIPTION:5 quick cards from your notes\\, about 3 minutes. Open: ${input.url}`,
    `URL:${input.url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Morning revision: 5 cards\\, 3 minutes",
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/* Memorisation tracker (owner list A, 8 Nov 2026) */

/** Remembered three times in a row (now on a 7- or 14-day gap) = memorised. */
export const MEMORISED_BOX = 3;

/** "Memorise this": the note comes up in the very next revision round. */
export function memoriseNow(state: RevisionState, noteId: string, today: string): RevisionState {
  const current = state[noteId];
  return { ...state, [noteId]: { box: current?.box ?? 0, due: today, lastSeen: current?.lastSeen ?? "" } };
}

export type CardStage = "new" | "not_yet" | "learning" | "memorised";

export function cardStage(state: RevisionState, noteId: string): CardStage {
  const card = state[noteId];
  if (!card || !card.lastSeen) return "new";
  if (card.box >= MEMORISED_BOX) return "memorised";
  if (card.box === 0) return "not_yet";
  return "learning";
}

export interface SubjectProgress {
  subject: string;
  total: number;
  memorised: number;
  learning: number;
  notYet: number;
  fresh: number;
}

/** Per subject: how many notes are memorised, being learned, not remembered yet, or new. */
export function subjectProgress(notes: readonly RevisionNote[], state: RevisionState): SubjectProgress[] {
  const rows = new Map<string, SubjectProgress>();
  for (const note of notes) {
    // Voice notes and empty notes never become cards, so they aren't counted here.
    if (note.audioId || !note.title.trim() || !note.body.trim()) continue;
    const subject = note.subject || "Other";
    const row = rows.get(subject) ?? { subject, total: 0, memorised: 0, learning: 0, notYet: 0, fresh: 0 };
    row.total += 1;
    const stage = cardStage(state, note.id);
    if (stage === "memorised") row.memorised += 1;
    else if (stage === "learning") row.learning += 1;
    else if (stage === "not_yet") row.notYet += 1;
    else row.fresh += 1;
    rows.set(subject, row);
  }
  return [...rows.values()].sort((a, b) => a.subject.localeCompare(b.subject));
}

/**
 * Strengths and weak spots from the student's own revision answers (no AI): strongest =
 * most memorised for its size; weakest = most "Not yet". Needs at least 2 revised cards.
 */
export function strengthsAndWeakSpots(rows: readonly SubjectProgress[]): { strong: string[]; weak: string[] } {
  const revised = rows.filter((row) => row.memorised + row.learning + row.notYet >= 2);
  const score = (row: SubjectProgress) => (row.memorised * 2 + row.learning - row.notYet * 2) / Math.max(1, row.total);
  const ranked = [...revised].sort((a, b) => score(b) - score(a));
  const doingWell = ranked.filter((row) => score(row) > 0);
  const strong = doingWell.slice(0, 3).map((row) => row.subject);
  const weak = [...ranked]
    .reverse()
    .filter((row) => row.notYet > 0 && !doingWell.includes(row))
    .slice(0, 3)
    .map((row) => row.subject);
  return { strong, weak };
}
