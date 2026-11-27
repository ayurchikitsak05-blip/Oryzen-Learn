/**
 * FSRS spaced repetition (owner, 27 Nov 2026: "proper spaced repetition", as in Anki/StudyTab).
 * The open FSRS-4.5 model with its published default weights; targets 90% recall. No AI, no
 * server: a few numbers per card, kept with the student's revision record.
 */
export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export const FSRS_WEIGHTS = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246,
  1.587, 0.2272, 2.8755,
] as const;

const DECAY = -0.5;
const FACTOR = 19 / 81; // so recall is 90% when elapsed days = stability
export const MAX_INTERVAL_DAYS = 365;

const w = FSRS_WEIGHTS;
const clampD = (d: number) => Math.min(10, Math.max(1, d));

/** Chance of remembering after `elapsedDays` with this stability. */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

export function initialStability(rating: Rating): number {
  return Math.max(0.1, w[rating - 1]);
}

export function initialDifficulty(rating: Rating): number {
  return clampD(w[4] - (rating - 3) * w[5]);
}

export function nextDifficulty(d: number, rating: Rating): number {
  const next = d - w[6] * (rating - 3);
  return clampD(w[7] * initialDifficulty(3) + (1 - w[7]) * next);
}

export function stabilityAfterRecall(d: number, s: number, r: number, rating: Rating): number {
  const hard = rating === 2 ? w[15] : 1;
  const easy = rating === 4 ? w[16] : 1;
  return s * (Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hard * easy + 1);
}

export function stabilityAfterLapse(d: number, s: number, r: number): number {
  return Math.min(s, w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r)));
}

export interface FsrsMemory {
  stability: number;
  difficulty: number;
}

/** Memory after an answer. `memory` is null for a card never answered. */
export function nextMemory(memory: FsrsMemory | null, elapsedDays: number, rating: Rating): FsrsMemory {
  if (!memory) return { stability: initialStability(rating), difficulty: initialDifficulty(rating) };
  const r = retrievability(elapsedDays, memory.stability);
  const difficulty = nextDifficulty(memory.difficulty, rating);
  const stability =
    rating === 1
      ? stabilityAfterLapse(memory.difficulty, memory.stability, r)
      : stabilityAfterRecall(memory.difficulty, memory.stability, r, rating);
  return { stability: Math.max(0.1, stability), difficulty };
}

/** Whole days until the card should come back (90% recall); "Again" is tomorrow. */
export function intervalDays(memory: FsrsMemory, rating: Rating): number {
  if (rating === 1) return 1;
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(memory.stability)));
}
