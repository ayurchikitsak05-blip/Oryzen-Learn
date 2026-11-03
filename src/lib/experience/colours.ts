import { applyThemeToDocument, readRhythmPrefs, writeRhythmPrefs } from "@/lib/rhythm/persist";
import { themeById } from "@/lib/rhythm/themes";
import type { ThemeId } from "@/lib/rhythm/types";
import {
  applyExperienceToDocument,
  clearExperienceInline,
  defaultExperiencePrefs,
  experienceVisibleTo,
  readExperienceRecord,
  writeExperiencePrefs,
} from "./persist";
import { EXPERIENCE_THEMES } from "./themes";
import { EXPERIENCE_STORAGE_KEY } from "./types";

/**
 * Personalize → Colours (design board "Personalize my space", 3 Nov 2026).
 * Light colours are the contrast-checked study themes; Night is the dark Momentum look.
 */

export type ColourId = "beige" | "clay" | "teal" | "peach" | "night";

export interface ColourChoice {
  id: ColourId;
  label: string;
  /** Light colours use a study theme; Night uses the dark look. */
  themeId: ThemeId | null;
  swatch: { bg: string; accent: string };
}

const light = (id: ColourId, label: string, themeId: ThemeId): ColourChoice => {
  const tokens = themeById(themeId).tokens;
  return { id, label, themeId, swatch: { bg: tokens.bg, accent: tokens.accent } };
};

export const COLOUR_CHOICES: readonly ColourChoice[] = [
  light("beige", "Beige", "classic"),
  light("clay", "Clay", "warm-grounded"),
  light("teal", "Teal", "cool-clear"),
  light("peach", "Peach", "fresh-energizing"),
  {
    id: "night",
    label: "Night",
    themeId: null,
    swatch: {
      bg: EXPERIENCE_THEMES.momentum.tokens.bg,
      accent: EXPERIENCE_THEMES.momentum.tokens.accent,
    },
  },
];

/** The study style suggests a colour: Spark → Clay, Laser → Teal, Anchor → Peach. */
export function colourForTheme(themeId: ThemeId | string | null | undefined): ColourId | null {
  return COLOUR_CHOICES.find((choice) => choice.themeId === themeId)?.id ?? null;
}

/** What the student sees now. */
export function currentColour(userId: string | null): ColourId | null {
  const experience = experienceVisibleTo(userId);
  if (experience?.experience === "momentum") return "night";
  // The older Focus and Studio looks have their own palettes, so no swatch is ticked for them.
  if (experience) return null;
  return colourForTheme(readRhythmPrefs().themeId) ?? "beige";
}

export function applyColour(id: ColourId, userId: string | null): void {
  const choice = COLOUR_CHOICES.find((item) => item.id === id);
  if (!choice || typeof window === "undefined") return;
  if (choice.themeId) {
    try {
      writeRhythmPrefs({ ...readRhythmPrefs(), themeId: choice.themeId, suggestionState: "applied" });
      // Only drop the older look if it belongs to this student (or nobody): phones get shared.
      const stored = readExperienceRecord();
      if (stored && (!stored.ownerId || stored.ownerId === userId)) {
        window.localStorage.removeItem(EXPERIENCE_STORAGE_KEY);
      }
    } catch {
      /* storage blocked: the colour still applies for this visit */
    }
    clearExperienceInline(document.documentElement);
    applyThemeToDocument(choice.themeId);
    window.dispatchEvent(new Event("oryzen-experience-changed"));
    return;
  }
  const prefs = { ...defaultExperiencePrefs(userId), experience: "momentum" as const, usePrakritiAccent: false };
  let saved = prefs;
  try {
    saved = writeExperiencePrefs(prefs);
  } catch {
    /* storage blocked: Night still applies for this visit */
  }
  applyExperienceToDocument({ mode: "momentum", prefs: saved, prakritiThemeId: readRhythmPrefs().themeId });
}
