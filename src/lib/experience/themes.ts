import { contrastRatio, themeById } from "@/lib/rhythm/themes";
import type { ThemeId } from "@/lib/rhythm/types";
import type { ExperienceId, ExperienceTokens } from "./types";

const SHARED_DANGER = { danger: "#8F2F2F", dangerBg: "#F8ECEC" } as const;

export const EXPERIENCE_THEMES: Record<
  ExperienceId,
  { id: ExperienceId; name: string; mood: string; tokens: ExperienceTokens }
> = {
  focus: {
    id: "focus",
    name: "Focus",
    mood: "A quiet exam desk for plans, reading, and recorded results.",
    tokens: {
      bg: "#F7F4EE",
      bgSecondary: "#F1EBE3",
      card: "#FFFDFB",
      beigePrimary: "#D5E4D6",
      beigeSecondary: "#E7EFE6",
      selected: "#E3EFE4",
      heading: "#1E2420",
      body: "#2C3330",
      textSecondary: "#5C6560",
      borders: "#DDD6CC",
      accent: "#3D6B4F",
      focusRing: "#3D6B4F",
      ...SHARED_DANGER,
      success: "#2F5D3A",
      successBg: "#EEF5EF",
    },
  },
  studio: {
    id: "studio",
    name: "Studio",
    mood: "An optional study room, stickers, garden, and a small pet.",
    tokens: {
      bg: "#F8F4FB",
      bgSecondary: "#F6EFE8",
      card: "#FFFAFD",
      beigePrimary: "#E7D8F2",
      beigeSecondary: "#F8E4D6",
      selected: "#E3F3EE",
      heading: "#2A2433",
      body: "#3A3344",
      textSecondary: "#6A6174",
      borders: "#E4D8EA",
      accent: "#4C3D6E",
      focusRing: "#4C3D6E",
      ...SHARED_DANGER,
      success: "#2E6B5A",
      successBg: "#E8F3EE",
    },
  },
  momentum: {
    id: "momentum",
    name: "Momentum",
    mood: "Countdowns, recorded minutes, and progress against the saved plan.",
    tokens: {
      bg: "#0F1C2E",
      bgSecondary: "#15263C",
      card: "#18293F",
      beigePrimary: "#24486A",
      beigeSecondary: "#1C3A56",
      selected: "#1A4552",
      heading: "#F3F7FB",
      body: "#D5DEEA",
      textSecondary: "#A9B7C9",
      borders: "#2C425C",
      accent: "#7EC8FF",
      focusRing: "#7EC8FF",
      danger: "#F0B4B4",
      dangerBg: "#3A2428",
      success: "#9ED9B8",
      successBg: "#1A3330",
    },
  },
};

export function isExperienceId(value: unknown): value is ExperienceId {
  return value === "focus" || value === "studio" || value === "momentum";
}

function channel(hex: string, index: number): number {
  return parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

function mixToward(color: string, toward: string, amount: number): string {
  const parts = [0, 1, 2].map((index) =>
    Math.round(channel(color, index) + (channel(toward, index) - channel(color, index)) * amount)
  );
  return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Shift a Prakriti accent toward white or black until it is readable. Stored themes stay unchanged. */
function readableOn(color: string, background: string): string | null {
  const toward = contrastRatio(color, "#FFFFFF") > contrastRatio(color, "#000000") ? "#FFFFFF" : "#000000";
  for (let step = 0; step <= 8; step += 1) {
    const next = step === 0 ? color : mixToward(color, toward, step / 8);
    if (contrastRatio(next, background) >= 4.5) return next;
  }
  return null;
}

/** Prakriti may tint the accent only when the pair stays readable on the experience. */
export function resolveExperienceAccent(input: {
  experience: ExperienceId;
  prakritiThemeId: ThemeId | string | undefined;
  usePrakritiAccent: boolean;
}): string {
  const experience = EXPERIENCE_THEMES[input.experience];
  const fallback = experience.tokens.accent;
  if (!input.usePrakritiAccent) return fallback;
  const prakriti = themeById(input.prakritiThemeId).tokens.accent;
  return readableOn(prakriti, experience.tokens.bg) ?? fallback;
}
