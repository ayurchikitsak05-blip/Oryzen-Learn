import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";

/** Sticky notes: up to 5 short notes pinned to the top of Today (owner list A, 8 Nov 2026). */
export const PINS_KEY = "oryzen_sticky_notes_v1";
export const MAX_PINS = 5;
export const PINS_EVENT = "oryzen-pins-changed";

export interface PinnedNote {
  id: string;
  title: string;
  body: string;
}

export function readPins(userId?: string | null): PinnedNote[] {
  try {
    const raw = readPrivateString(PINS_KEY, userId);
    const value = raw ? (JSON.parse(raw) as PinnedNote[]) : [];
    return Array.isArray(value)
      ? value.filter((pin) => pin && typeof pin.id === "string").slice(0, MAX_PINS)
      : [];
  } catch {
    return [];
  }
}

function write(pins: PinnedNote[], userId?: string | null) {
  writePrivateString(PINS_KEY, JSON.stringify(pins.slice(0, MAX_PINS)), userId);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PINS_EVENT));
}

export function isPinned(id: string, userId?: string | null): boolean {
  return readPins(userId).some((pin) => pin.id === id);
}

/** Pins a note (newest first). Returns false when 5 are already pinned. */
export function pinNote(note: PinnedNote, userId?: string | null): boolean {
  const pins = readPins(userId).filter((pin) => pin.id !== note.id);
  if (pins.length >= MAX_PINS) return false;
  write([{ id: note.id, title: note.title.slice(0, 120), body: note.body.slice(0, 400) }, ...pins], userId);
  return true;
}

export function unpinNote(id: string, userId?: string | null): void {
  write(readPins(userId).filter((pin) => pin.id !== id), userId);
}
