export const COMPANION_STORAGE_KEY = "oryzen_study_companion_v1";
export const COMPANION_STYLES = ["buddy", "coach", "teacher", "guide"] as const;
export const COMPANION_CHARACTERS = ["leaf", "lamp", "stone", "kite"] as const;

export type CompanionStyle = (typeof COMPANION_STYLES)[number];
export type CompanionCharacter = (typeof COMPANION_CHARACTERS)[number];

export interface CompanionPrefs {
  version: 1;
  name: string;
  style: CompanionStyle;
  character: CompanionCharacter;
  onboarded: boolean;
}

export interface CompanionTurn {
  id: string;
  role: "student" | "companion";
  text: string;
  mocked: boolean;
  createdAt: string;
}

export interface CompanionMember {
  id: string;
  name: string;
  style: CompanionStyle;
  character: CompanionCharacter;
}

export interface CompanionStore {
  version: 1;
  prefs: CompanionPrefs;
  turns: CompanionTurn[];
  collection: CompanionMember[];
  activeId: string;
}

export const DEFAULT_COMPANION_PREFS: CompanionPrefs = {
  version: 1,
  name: "Aarav",
  style: "buddy",
  character: "leaf",
  onboarded: false,
};

export const STYLE_COPY: Record<CompanionStyle, { label: string; hint: string }> = {
  buddy: {
    label: "Buddy",
    hint: "Warm, informal, and beside you while you work.",
  },
  coach: {
    label: "Coach",
    hint: "Brief prompts, one next step, and a check on the clock.",
  },
  teacher: {
    label: "Teacher",
    hint: "Clearer explanations, a question to check understanding, then the next task.",
  },
  guide: {
    label: "Guide",
    hint: "Unhurried, plain language, and space to pause.",
  },
};

export const STARTER_COMPANIONS: CompanionMember[] = [
  { id: "buddy", name: "Aarav", style: "buddy", character: "leaf" },
  { id: "teacher", name: "Meera", style: "teacher", character: "stone" },
  { id: "coach", name: "Kabir", style: "coach", character: "lamp" },
  { id: "guide", name: "Tara", style: "guide", character: "kite" },
];

export const CHARACTER_COPY: Record<
  CompanionCharacter,
  { label: string; hint: string }
> = {
  leaf: { label: "Aarav", hint: "Warm, informal, and beside you while you work." },
  lamp: { label: "Kabir", hint: "Brief prompts, one next step, and a check on the clock." },
  stone: { label: "Meera", hint: "Clearer explanations, then the next task." },
  kite: { label: "Tara", hint: "Unhurried, plain language, and space to pause." },
};

const PREVIOUS_COMPANION_NAMES: Record<CompanionCharacter, string> = {
  leaf: "Nia",
  lamp: "Kai",
  stone: "Ira",
  kite: "Sora",
};

export function companionDisplayName(character: CompanionCharacter, name: string): string {
  const cleaned = name.replace(/\s+/g, " ").trim().slice(0, 24);
  const official = CHARACTER_COPY[character].label;
  if (!cleaned || cleaned === PREVIOUS_COMPANION_NAMES[character]) return official;
  return cleaned;
}
