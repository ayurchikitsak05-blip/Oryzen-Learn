import { applyThemeToDocument, readRhythmPrefs, writeRhythmPrefs } from "@/lib/rhythm/persist";
import { themeById } from "@/lib/rhythm/themes";
import type { ThemeId } from "@/lib/rhythm/types";
import {
  applyExperienceToDocument,
  clearExperienceInline,
  defaultExperiencePrefs,
  experienceVisibleTo,
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

/** What the student sees now. The older Focus look counts as Beige; Studio has no match. */
export function currentColour(userId: string | null): ColourId | null {
  const experience = experienceVisibleTo(userId);
  if (experience?.experience === "momentum") return "night";
  if (experience?.experience === "focus") return "beige";
  if (experience?.experience === "studio") return null;
  return colourForTheme(readRhythmPrefs().themeId) ?? "beige";
}

export function applyColour(id: ColourId, userId: string | null): void {
  const choice = COLOUR_CHOICES.find((item) => item.id === id);
  if (!choice || typeof window === "undefined") return;
  if (choice.themeId) {
    const next = writeRhythmPrefs({ ...readRhythmPrefs(), themeId: choice.themeId, suggestionState: "applied" });
    try {
      window.localStorage.removeItem(EXPERIENCE_STORAGE_KEY);
    } catch {
      /* storage blocked: the colour still applies for this visit */
    }
    clearExperienceInline(document.documentElement);
    applyThemeToDocument(next.themeId);
    window.dispatchEvent(new Event("oryzen-experience-changed"));
    return;
  }
  const saved = writeExperiencePrefs({
    ...defaultExperiencePrefs(userId),
    experience: "momentum",
    usePrakritiAccent: false,
  });
  applyExperienceToDocument({ mode: "momentum", prefs: saved, prakritiThemeId: readRhythmPrefs().themeId });
}
