import type { ThemeDefinition, ThemeId, ThemeTokens } from "./types";

const SHARED_DANGER = { danger: "#8F2F2F", dangerBg: "#F8ECEC" } as const;

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: "classic",
    name: "Classic Soft Beige",
    mood: "The existing ORYZEN paper. Default.",
    group: "classic",
    tokens: {
      bg: "#FAF8F5",
      bgSecondary: "#F7F3EE",
      card: "#FFFDFC",
      beigePrimary: "#E8D9C8",
      beigeSecondary: "#F2E9DF",
      selected: "#EDE0D1",
      heading: "#20242B",
      body: "#303640",
      textSecondary: "#59616B",
      borders: "#E7DED4",
      accent: "#766454",
      focusRing: "#766454",
      ...SHARED_DANGER,
      success: "#2F5D3A",
      successBg: "#EEF5EF",
    },
  },
  {
    id: "warm-grounded",
    name: "Warm & Grounded",
    mood: "Warm ivory and a gentle terracotta. Vata-inspired.",
    group: "primary",
    tokens: {
      bg: "#F7F1E8",
      bgSecondary: "#F1E8DC",
      card: "#FDF8F2",
      beigePrimary: "#E4D4C0",
      beigeSecondary: "#EDE3D4",
      selected: "#E8D8C4",
      heading: "#2A241E",
      body: "#3A342C",
      textSecondary: "#6A6156",
      borders: "#E0D2C0",
      accent: "#8F4A32",
      focusRing: "#8F4A32",
      ...SHARED_DANGER,
      success: "#3F5A3A",
      successBg: "#EEF2EA",
    },
  },
  {
    id: "cool-clear",
    name: "Cool & Clear",
    mood: "Cool ivory and muted teal. Pitta-inspired.",
    group: "primary",
    tokens: {
      bg: "#F3F6F8",
      bgSecondary: "#EBF1F4",
      card: "#FAFCFD",
      beigePrimary: "#D4DFE6",
      beigeSecondary: "#E6EEF2",
      selected: "#D8E4EB",
      heading: "#1C2A32",
      body: "#2A3A42",
      textSecondary: "#55656E",
      borders: "#D0DBE2",
      accent: "#2F6B6A",
      focusRing: "#2F6B6A",
      ...SHARED_DANGER,
      success: "#2F5D3A",
      successBg: "#E8F2F1",
    },
  },
  {
    id: "fresh-energizing",
    name: "Fresh & Energizing",
    mood: "Cream, peach, and muted coral. Kapha-inspired.",
    group: "primary",
    tokens: {
      bg: "#FBF6F0",
      bgSecondary: "#F7EEE6",
      card: "#FFFCF8",
      beigePrimary: "#F0D4C2",
      beigeSecondary: "#F7E8DC",
      selected: "#F3D8C8",
      heading: "#2A221E",
      body: "#3C342E",
      textSecondary: "#655850",
      borders: "#E6D2C2",
      accent: "#8E4034",
      focusRing: "#8E4034",
      ...SHARED_DANGER,
      success: "#2E6B5A",
      successBg: "#E8F3EE",
    },
  },
  {
    id: "grounded-clarity",
    name: "Grounded Clarity",
    mood: "Warm paper, cool links. A named mix — not an RGB blend.",
    group: "mixed",
    tokens: {
      bg: "#F7F1E8",
      bgSecondary: "#F1E8DC",
      card: "#FDF8F2",
      beigePrimary: "#E4D4C0",
      beigeSecondary: "#EDE3D4",
      selected: "#E8D8C4",
      heading: "#2A241E",
      body: "#3A342C",
      textSecondary: "#6A6156",
      borders: "#E0D2C0",
      accent: "#2A5F5E",
      focusRing: "#2A5F5E",
      ...SHARED_DANGER,
      success: "#3F5A3A",
      successBg: "#EEF2EA",
    },
  },
  {
    id: "clear-energy",
    name: "Clear Energy",
    mood: "Cool paper, coral links. A named mix — not an RGB blend.",
    group: "mixed",
    tokens: {
      bg: "#F3F6F8",
      bgSecondary: "#EBF1F4",
      card: "#FAFCFD",
      beigePrimary: "#D4DFE6",
      beigeSecondary: "#E6EEF2",
      selected: "#D8E4EB",
      heading: "#1C2A32",
      body: "#2A3A42",
      textSecondary: "#55656E",
      borders: "#D0DBE2",
      accent: "#8E4034",
      focusRing: "#8E4034",
      ...SHARED_DANGER,
      success: "#2E6B5A",
      successBg: "#E8F3EE",
    },
  },
  {
    id: "warm-lift",
    name: "Warm Lift",
    mood: "Warm paper, coral links. A named mix — not an RGB blend.",
    group: "mixed",
    tokens: {
      bg: "#F7F1E8",
      bgSecondary: "#F1E8DC",
      card: "#FDF8F2",
      beigePrimary: "#E8D0BE",
      beigeSecondary: "#EDE3D4",
      selected: "#E8D8C4",
      heading: "#2A241E",
      body: "#3A342C",
      textSecondary: "#6A6156",
      borders: "#E0D2C0",
      accent: "#8E4034",
      focusRing: "#8E4034",
      ...SHARED_DANGER,
      success: "#2E6B5A",
      successBg: "#E8F3EE",
    },
  },
];

export const THEME_IDS: ThemeId[] = THEME_DEFINITIONS.map((theme) => theme.id);

export const THEME_BY_ID: Record<ThemeId, ThemeDefinition> = Object.fromEntries(
  THEME_DEFINITIONS.map((theme) => [theme.id, theme])
) as Record<ThemeId, ThemeDefinition>;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}

export function themeById(id: ThemeId | string | undefined): ThemeDefinition {
  if (id && isThemeId(id)) return THEME_BY_ID[id];
  return THEME_BY_ID.classic;
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const raw = hex.replace("#", "").trim();
  const full = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastPair {
  id: string;
  foreground: keyof ThemeTokens;
  background: keyof ThemeTokens;
  minimum: number;
  classicException?: number;
}

export const REQUIRED_CONTRAST_PAIRS: ContrastPair[] = [
  { id: "heading / bg", foreground: "heading", background: "bg", minimum: 4.5 },
  { id: "body / card", foreground: "body", background: "card", minimum: 4.5 },
  { id: "muted / bg", foreground: "textSecondary", background: "bg", minimum: 4.5 },
  {
    id: "heading / beige-primary",
    foreground: "heading",
    background: "beigePrimary",
    minimum: 4.5,
  },
  { id: "heading / selected", foreground: "heading", background: "selected", minimum: 4.5 },
  { id: "accent / card", foreground: "accent", background: "card", minimum: 4.5 },
  { id: "accent / bg", foreground: "accent", background: "bg", minimum: 4.5 },
  {
    id: "accent / beige-primary",
    foreground: "accent",
    background: "beigePrimary",
    minimum: 4.5,
    classicException: 4.08,
  },
  { id: "success / success-bg", foreground: "success", background: "successBg", minimum: 4.5 },
  { id: "danger / danger-bg", foreground: "danger", background: "dangerBg", minimum: 4.5 },
  { id: "focus / bg", foreground: "focusRing", background: "bg", minimum: 3 },
];

export function pairMinimum(themeId: ThemeId, pair: ContrastPair): number {
  if (themeId === "classic" && pair.classicException != null) return pair.classicException;
  return pair.minimum;
}

export const CSS_TOKEN_NAMES: Array<{ key: keyof ThemeTokens; css: string }> = [
  { key: "bg", css: "--bg" },
  { key: "bgSecondary", css: "--bg-secondary" },
  { key: "card", css: "--card" },
  { key: "beigePrimary", css: "--beige-primary" },
  { key: "beigeSecondary", css: "--beige-secondary" },
  { key: "selected", css: "--selected" },
  { key: "heading", css: "--heading" },
  { key: "body", css: "--body" },
  { key: "textSecondary", css: "--text-secondary" },
  { key: "borders", css: "--borders" },
  { key: "accent", css: "--accent" },
  { key: "focusRing", css: "--focus-ring" },
  { key: "danger", css: "--danger" },
  { key: "dangerBg", css: "--danger-bg" },
  { key: "success", css: "--success" },
  { key: "successBg", css: "--success-bg" },
];
