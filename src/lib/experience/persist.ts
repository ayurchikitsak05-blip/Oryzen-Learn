import { RHYTHM_STORAGE_KEY } from "@/lib/rhythm/types";
import { EXPERIENCE_THEMES, isExperienceId, resolveExperienceAccent } from "./themes";
import { EXPERIENCE_STORAGE_KEY, type ExperienceId, type ExperiencePrefs } from "./types";

const TOKEN_VARS: Record<string, string> = {
  bg: "--bg",
  bgSecondary: "--bg-secondary",
  card: "--card",
  beigePrimary: "--beige-primary",
  beigeSecondary: "--beige-secondary",
  selected: "--selected",
  heading: "--heading",
  body: "--body",
  textSecondary: "--text-secondary",
  borders: "--borders",
  accent: "--accent",
  focusRing: "--focus-ring",
  danger: "--danger",
  dangerBg: "--danger-bg",
  success: "--success",
  successBg: "--success-bg",
};

export function defaultExperiencePrefs(ownerId: string | null): ExperiencePrefs {
  return {
    version: 1,
    ownerId,
    experience: "focus",
    usePrakritiAccent: true,
    decorations: false,
    animations: true,
    rewards: true,
  };
}

function sanitize(value: unknown): ExperiencePrefs | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ExperiencePrefs>;
  if (!isExperienceId(raw.experience)) return null;
  return {
    version: 1,
    ownerId: typeof raw.ownerId === "string" && raw.ownerId ? raw.ownerId : null,
    experience: raw.experience,
    usePrakritiAccent: raw.usePrakritiAccent !== false,
    decorations: Boolean(raw.decorations),
    animations: raw.animations !== false,
    rewards: raw.rewards !== false,
  };
}

export function readExperienceRecord(): ExperiencePrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(EXPERIENCE_STORAGE_KEY);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function experienceVisibleTo(userId: string | null): ExperiencePrefs | null {
  const stored = readExperienceRecord();
  if (!stored) return null;
  if (stored.ownerId && stored.ownerId !== userId) return null;
  if (stored.ownerId && !userId) return null;
  return stored;
}

export function hasExistingRhythmChoice(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(RHYTHM_STORAGE_KEY));
}

export type ExperienceMode = ExperienceId | "preserve";

export function resolveExperienceMode(userId: string | null): {
  mode: ExperienceMode;
  prefs: ExperiencePrefs | null;
} {
  const visible = experienceVisibleTo(userId);
  if (visible) return { mode: visible.experience, prefs: visible };
  if (hasExistingRhythmChoice()) return { mode: "preserve", prefs: null };
  return { mode: "focus", prefs: defaultExperiencePrefs(userId) };
}

export function writeExperiencePrefs(prefs: ExperiencePrefs): ExperiencePrefs {
  const next = sanitize(prefs) ?? defaultExperiencePrefs(prefs.ownerId);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(EXPERIENCE_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("oryzen-experience-changed"));
  }
  return next;
}

export function clearExperienceInline(root: HTMLElement): void {
  for (const cssVar of Object.values(TOKEN_VARS)) root.style.removeProperty(cssVar);
  delete root.dataset.experience;
  delete root.dataset.decor;
  delete root.dataset.motion;
  root.style.colorScheme = "";
}

export function applyExperienceToDocument(input: {
  mode: ExperienceMode;
  prefs: ExperiencePrefs | null;
  prakritiThemeId?: string;
}): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (input.mode === "preserve" || !input.prefs) {
    clearExperienceInline(root);
    return;
  }
  const tokens = EXPERIENCE_THEMES[input.mode].tokens;
  for (const [key, cssVar] of Object.entries(TOKEN_VARS)) {
    const value = tokens[key as keyof typeof tokens];
    if (value) root.style.setProperty(cssVar, value);
  }
  const accent = resolveExperienceAccent({
    experience: input.mode,
    prakritiThemeId: input.prakritiThemeId,
    usePrakritiAccent: input.prefs.usePrakritiAccent,
  });
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--focus-ring", accent);
  root.dataset.experience = input.mode;
  root.dataset.decor = input.prefs.decorations ? "on" : "off";
  root.dataset.motion = input.prefs.animations ? "on" : "off";
  root.style.colorScheme = input.mode === "momentum" ? "dark" : "light";
}

export const EXPERIENCE_BOOT_SCRIPT = `(function(){try{var raw=localStorage.getItem(${JSON.stringify(
  EXPERIENCE_STORAGE_KEY
)});var rhythm=localStorage.getItem(${JSON.stringify(
  RHYTHM_STORAGE_KEY
)});var root=document.documentElement;if(!raw){if(!rhythm)root.setAttribute("data-experience","focus");return;}var prefs=JSON.parse(raw);if(!prefs||prefs.experience!=="focus"&&prefs.experience!=="studio"&&prefs.experience!=="momentum")return;root.setAttribute("data-experience",prefs.experience);root.setAttribute("data-decor",prefs.decorations?"on":"off");root.setAttribute("data-motion",prefs.animations===false?"off":"on");}catch(e){}})();`;
