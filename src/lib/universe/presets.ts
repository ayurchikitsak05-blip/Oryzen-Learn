import type { CanonicalPrakritiKey } from "@/lib/prakriti/config";
import { DEFAULT_UNIVERSE_PREFS, type UniversePreset, type UniversePrefs, type UniverseProfileId } from "./types";

export const UNIVERSE_PRESETS: Record<UniverseProfileId, UniversePreset> = {
  vata: {
    id: "vata",
    prakritiLabel: "Vata",
    modernName: "Spark & Sprint",
    tagline: "Short, varied blocks with stories, sketches, and a light reset.",
    themeId: "warm-grounded",
    sessionMinutes: 25,
    breakMinutes: 5,
    reminderTone: "gentle",
    reminderFrequency: "frequent",
    explanationFormat: "story",
    storyEmphasis: 3,
    illustrationEmphasis: 3,
    diagramEmphasis: 1,
    revisionEmphasis: 1,
    noteStyle: "mind_map",
    companionStyle: "buddy",
    companionName: "Nia",
    companionCharacter: "leaf",
    suggestedSound: "rain",
    sprintRhythm: "spark",
  },
  pitta: {
    id: "pitta",
    prakritiLabel: "Pitta",
    modernName: "Laser & Logic",
    tagline: "Clear targets, longer focus, and a quiz or table at the end.",
    themeId: "cool-clear",
    sessionMinutes: 45,
    breakMinutes: 5,
    reminderTone: "clear",
    reminderFrequency: "moderate",
    explanationFormat: "structured",
    storyEmphasis: 1,
    illustrationEmphasis: 1,
    diagramEmphasis: 3,
    revisionEmphasis: 3,
    noteStyle: "revision_table",
    companionStyle: "teacher",
    companionName: "Ira",
    companionCharacter: "stone",
    suggestedSound: "silence",
    sprintRhythm: "laser",
  },
  kapha: {
    id: "kapha",
    prakritiLabel: "Kapha",
    modernName: "Anchor & Endurance",
    tagline: "A gentle start, then longer reading once you are underway.",
    themeId: "fresh-energizing",
    sessionMinutes: 45,
    breakMinutes: 8,
    reminderTone: "steady",
    reminderFrequency: "sparse",
    explanationFormat: "steady",
    storyEmphasis: 1,
    illustrationEmphasis: 2,
    diagramEmphasis: 2,
    revisionEmphasis: 3,
    noteStyle: "memory_aid",
    companionStyle: "guide",
    companionName: "Sora",
    companionCharacter: "kite",
    suggestedSound: "forest",
    sprintRhythm: "anchor",
  },
  vata_pitta: {
    id: "vata_pitta",
    prakritiLabel: "Vata–Pitta",
    modernName: "Spark with Structure",
    tagline: "Varied short blocks that still end with a clean check.",
    themeId: "grounded-clarity",
    sessionMinutes: 25,
    breakMinutes: 5,
    reminderTone: "gentle",
    reminderFrequency: "moderate",
    explanationFormat: "mixed",
    storyEmphasis: 2,
    illustrationEmphasis: 2,
    diagramEmphasis: 2,
    revisionEmphasis: 2,
    noteStyle: "mixed",
    companionStyle: "coach",
    companionName: "Kai",
    companionCharacter: "lamp",
    suggestedSound: "rain",
    sprintRhythm: "spark",
  },
  pitta_kapha: {
    id: "pitta_kapha",
    prakritiLabel: "Pitta–Kapha",
    modernName: "Clear and Steady",
    tagline: "Structured work with a calmer pace and a firm revision pass.",
    themeId: "clear-energy",
    sessionMinutes: 45,
    breakMinutes: 8,
    reminderTone: "clear",
    reminderFrequency: "sparse",
    explanationFormat: "structured",
    storyEmphasis: 1,
    illustrationEmphasis: 1,
    diagramEmphasis: 3,
    revisionEmphasis: 3,
    noteStyle: "revision_table",
    companionStyle: "teacher",
    companionName: "Ira",
    companionCharacter: "stone",
    suggestedSound: "forest",
    sprintRhythm: "laser",
  },
  vata_kapha: {
    id: "vata_kapha",
    prakritiLabel: "Vata–Kapha",
    modernName: "Warm Lift",
    tagline: "A soft start, story-led explanations, and room to settle in.",
    themeId: "warm-lift",
    sessionMinutes: 25,
    breakMinutes: 8,
    reminderTone: "gentle",
    reminderFrequency: "frequent",
    explanationFormat: "story",
    storyEmphasis: 3,
    illustrationEmphasis: 2,
    diagramEmphasis: 1,
    revisionEmphasis: 2,
    noteStyle: "memory_aid",
    companionStyle: "guide",
    companionName: "Sora",
    companionCharacter: "kite",
    suggestedSound: "water",
    sprintRhythm: "anchor",
  },
  balanced: {
    id: "balanced",
    prakritiLabel: "Balanced Vata–Pitta–Kapha",
    modernName: "Even Blend",
    tagline: "The current ORYZEN paper look with a mixed, editable plan.",
    themeId: "classic",
    sessionMinutes: 25,
    breakMinutes: 5,
    reminderTone: "gentle",
    reminderFrequency: "moderate",
    explanationFormat: "mixed",
    storyEmphasis: 2,
    illustrationEmphasis: 2,
    diagramEmphasis: 2,
    revisionEmphasis: 2,
    noteStyle: "mixed",
    companionStyle: "buddy",
    companionName: "Nia",
    companionCharacter: "leaf",
    suggestedSound: "silence",
    sprintRhythm: "custom",
  },
};

export const UNIVERSE_PRESET_LIST = Object.values(UNIVERSE_PRESETS);

export function isUniverseProfileId(value: unknown): value is UniverseProfileId {
  return typeof value === "string" && value in UNIVERSE_PRESETS;
}

export function prefsFromPreset(
  preset: UniversePreset,
  patch: Partial<UniversePrefs> = {}
): UniversePrefs {
  return {
    ...DEFAULT_UNIVERSE_PREFS,
    profileId: preset.id,
    themeId: preset.themeId,
    sessionMinutes: preset.sessionMinutes,
    breakMinutes: preset.breakMinutes,
    reminderTone: preset.reminderTone,
    reminderFrequency: preset.reminderFrequency,
    explanationFormat: preset.explanationFormat,
    storyEmphasis: preset.storyEmphasis,
    illustrationEmphasis: preset.illustrationEmphasis,
    diagramEmphasis: preset.diagramEmphasis,
    revisionEmphasis: preset.revisionEmphasis,
    noteStyle: preset.noteStyle,
    companionStyle: preset.companionStyle,
    focusSound: "silence",
    soundEnabled: false,
    ...patch,
  };
}

export function suggestUniverseProfile(input?: {
  canonicalType?: string | null;
  classification?: string | null;
  scores?: { Vata?: number; Pitta?: number; Kapha?: number } | null;
} | null): UniverseProfileId {
  const scores = input?.scores;
  if (
    scores &&
    typeof scores.Vata === "number" &&
    typeof scores.Pitta === "number" &&
    typeof scores.Kapha === "number"
  ) {
    const spread = Math.max(scores.Vata, scores.Pitta, scores.Kapha) - Math.min(scores.Vata, scores.Pitta, scores.Kapha);
    if (spread <= 15) return "balanced";
  }
  const key = `${input?.canonicalType ?? ""} ${input?.classification ?? ""}`.toLowerCase();
  if (key.includes("vata") && key.includes("pitta")) return "vata_pitta";
  if (key.includes("pitta") && key.includes("kapha")) return "pitta_kapha";
  if (key.includes("vata") && key.includes("kapha")) return "vata_kapha";
  if (/\bvata\b/.test(key)) return "vata";
  if (/\bpitta\b/.test(key)) return "pitta";
  if (/\bkapha\b/.test(key)) return "kapha";
  return "balanced";
}

export function suggestUniverseProfileFromCanonical(
  canonical?: CanonicalPrakritiKey | string | null
): UniverseProfileId {
  return suggestUniverseProfile({ canonicalType: canonical });
}
