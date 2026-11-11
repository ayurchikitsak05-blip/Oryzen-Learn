import type { UniverseProfileId } from "@/lib/universe/types";
import type { SprintDuration } from "@/lib/sprint/types";

/**
 * Study techniques matched to the 7 study styles (owner list A, 8 Nov 2026). Written content,
 * no AI. "Try it" sets the sprint timer where the technique has one. For owner review.
 */

export interface Technique {
  id: string;
  name: string;
  oneLine: string;
  steps: string[];
  bestFor: UniverseProfileId[];
  sprint?: { minutes: SprintDuration; breakMinutes: number };
  link?: { href: string; label: string };
}

export const TECHNIQUES: readonly Technique[] = [
  {
    id: "pomodoro",
    name: "Pomodoro (25 + 5)",
    oneLine: "Short, timed bursts with a break after each. Great when focus drifts or starting is hard.",
    steps: ["Pick one small task", "Study for 25 minutes, no phone", "Take a 5-minute break away from the screen", "After four rounds, take a 20-minute break"],
    bestFor: ["vata", "vata_pitta", "vata_kapha", "balanced"],
    sprint: { minutes: 25, breakMinutes: 5 },
  },
  {
    id: "long-block",
    name: "Long focus block (45 + 15)",
    oneLine: "Longer deep work for steady minds, with a proper break after each block.",
    steps: ["Choose your hardest topic", "Study for 45 minutes without switching", "Take a proper 15-minute break: walk, water, no phone", "Do two or three blocks a day at most"],
    bestFor: ["pitta", "kapha", "pitta_kapha"],
    sprint: { minutes: 45, breakMinutes: 15 },
  },
  {
    id: "warm-start",
    name: "Warm start (15 then go)",
    oneLine: "Beat a slow start: promise only one short sprint, then let momentum carry you.",
    steps: ["Open the page and read just the headings", "Set the timer for 15 minutes", "When it ends, decide: stop or one more round", "Most days you'll choose to keep going"],
    bestFor: ["kapha", "vata_kapha"],
    sprint: { minutes: 15, breakMinutes: 5 },
  },
  {
    id: "active-recall",
    name: "Active recall",
    oneLine: "Close the book and pull the answer out of your memory. Harder than re-reading, and far more effective.",
    steps: ["Read a section once", "Close it and write or say everything you remember", "Open it and check what you missed", "Use Test me in the reader for quick questions"],
    bestFor: ["pitta", "vata_pitta", "pitta_kapha", "balanced"],
    link: { href: "/reader?lens=test_me", label: "Open Test me" },
  },
  {
    id: "spaced",
    name: "Spaced revision",
    oneLine: "Revise after 1, 3, 7 and 14 days, so it moves into long-term memory.",
    steps: ["Save key points to My Notes", "Do Morning revision every day: 5 cards, 3 minutes", "Cards you forget come back tomorrow", "Cards you remember come back later and later"],
    bestFor: ["vata", "vata_pitta", "vata_kapha", "balanced", "kapha", "pitta", "pitta_kapha"],
    link: { href: "/revise", label: "Open Morning revision" },
  },
  {
    id: "feynman",
    name: "Teach it (Feynman method)",
    oneLine: "Explain the topic in simple words as if to a younger student. Where you get stuck is what to study.",
    steps: ["Write the topic name at the top of a page", "Explain it in plain words, with an example", "Mark the parts where you got stuck", "Go back to the book for just those parts"],
    bestFor: ["pitta", "pitta_kapha", "vata_pitta"],
  },
  {
    id: "story-picture",
    name: "Stories and pictures",
    oneLine: "Turn ideas into a story, a diagram or a mind map. Easier to remember for quick, creative minds.",
    steps: ["Select a hard paragraph in the reader", "Tap Story or Illustrate", "Redraw the idea by hand in your own way", "Save the best version to My Notes"],
    bestFor: ["vata", "vata_kapha", "vata_pitta"],
    link: { href: "/reader", label: "Open my books" },
  },
  {
    id: "mix-topics",
    name: "Mix topics (interleaving)",
    oneLine: "Switch between two or three related topics in one session instead of one long block.",
    steps: ["Pick two or three chapters you've already read", "Do a few questions from each, mixed up", "Notice which ones you confuse", "Make a small table comparing them"],
    bestFor: ["vata", "balanced", "vata_pitta"],
  },
  {
    id: "blurting",
    name: "Blurting",
    oneLine: "After studying, write everything you remember on a blank page in 5 minutes. Then fill the gaps.",
    steps: ["Study a topic for one sprint", "Close everything and write all you remember", "Compare with the book in a different colour", "The gaps are tomorrow's revision"],
    bestFor: ["kapha", "pitta_kapha", "pitta", "balanced"],
  },
];

export function techniquesFor(profileId: UniverseProfileId | null | undefined): { suited: Technique[]; others: Technique[] } {
  if (!profileId) return { suited: [], others: [...TECHNIQUES] };
  return {
    suited: TECHNIQUES.filter((technique) => technique.bestFor.includes(profileId)),
    others: TECHNIQUES.filter((technique) => !technique.bestFor.includes(profileId)),
  };
}

/**
 * Which note style to use (owner, 11 Nov 2026). Free: these are formats in My Notes.
 * Start with Cornell, Outline and Flowchart; then Table and Mind map.
 */
export interface NoteStyleTip {
  format: "cornell" | "outline" | "table" | "flowchart" | "mindmap";
  name: string;
  when: string;
  how: string;
  bestFor: UniverseProfileId[];
}

export const NOTE_STYLE_TIPS: readonly NoteStyleTip[] = [
  {
    format: "cornell",
    name: "Cornell notes",
    when: "Facts you must remember for the exam: definitions, causes, features, values.",
    how: "Write a short question on the left and its answer on the right. Cover the answers and test yourself. Each question also becomes a Morning revision card.",
    bestFor: ["vata", "kapha", "vata_kapha", "pitta_kapha", "balanced"],
  },
  {
    format: "outline",
    name: "Outline",
    when: "Long chapters and theory answers.",
    how: "Main heading, then sub-headings, then points. Revise by recalling the headings first, then the points under each.",
    bestFor: ["kapha", "pitta_kapha", "vata_kapha"],
  },
  {
    format: "flowchart",
    name: "Flowchart",
    when: "Anything that happens in steps: a process, a mechanism, a reaction, how a disease develops.",
    how: "Write the first step, then what happens next, down to the result. Practise redrawing it from memory.",
    bestFor: ["pitta", "vata_pitta", "pitta_kapha", "balanced"],
  },
  {
    format: "table",
    name: "Table",
    when: "Comparing things: types, differences, two diseases or drugs side by side.",
    how: "Put the things to compare across the top and the features down the side. Fill every box so the gaps show.",
    bestFor: ["pitta", "vata_pitta", "balanced"],
  },
  {
    format: "mindmap",
    name: "Mind map",
    when: "Seeing a whole chapter at a glance before you start, or for a quick last-day revision.",
    how: "The topic in the centre, main ideas as branches, small details under each. Keywords only, no long sentences.",
    bestFor: ["vata", "vata_pitta", "vata_kapha"],
  },
];

export function noteStylesFor(profileId: UniverseProfileId | null | undefined): NoteStyleTip[] {
  if (!profileId) return [...NOTE_STYLE_TIPS];
  return [...NOTE_STYLE_TIPS].sort(
    (a, b) => Number(b.bestFor.includes(profileId)) - Number(a.bestFor.includes(profileId))
  );
}
