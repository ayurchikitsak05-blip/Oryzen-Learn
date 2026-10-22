import { isThemeId } from "./themes";
import {
  DEFAULT_RHYTHM_PREFS,
  RHYTHM_STORAGE_KEY,
  type CoachStyleId,
  type StudyRhythmPrefs,
  type ThemeId,
} from "./types";

const COACH_STYLES: CoachStyleId[] = ["calm", "mastery", "momentum", "balanced", "off"];

function isCoachStyle(value: unknown): value is CoachStyleId {
  return typeof value === "string" && COACH_STYLES.includes(value as CoachStyleId);
}

export function sanitizeRhythmPrefs(value: unknown): StudyRhythmPrefs {
  if (!value || typeof value !== "object") return { ...DEFAULT_RHYTHM_PREFS };
  const raw = value as Partial<StudyRhythmPrefs>;
  return {
    version: 1,
    themeId: isThemeId(raw.themeId) ? raw.themeId : DEFAULT_RHYTHM_PREFS.themeId,
    coachStyle: isCoachStyle(raw.coachStyle) ? raw.coachStyle : DEFAULT_RHYTHM_PREFS.coachStyle,
    encouragementOff: Boolean(raw.encouragementOff),
    pdfPaperOptIn: Boolean(raw.pdfPaperOptIn),
    ageBand:
      raw.ageBand === "13-17" || raw.ageBand === "18-22" || raw.ageBand === "23+"
        ? raw.ageBand
        : undefined,
    suggestionState:
      raw.suggestionState === "applied" ||
      raw.suggestionState === "dismissed" ||
      raw.suggestionState === "idle"
        ? raw.suggestionState
        : "idle",
  };
}

export function readRhythmPrefs(): StudyRhythmPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_RHYTHM_PREFS };
  try {
    const raw = window.localStorage.getItem(RHYTHM_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RHYTHM_PREFS };
    return sanitizeRhythmPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_RHYTHM_PREFS };
  }
}

export function writeRhythmPrefs(prefs: StudyRhythmPrefs): StudyRhythmPrefs {
  const next = sanitizeRhythmPrefs(prefs);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(RHYTHM_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function applyThemeToDocument(themeId: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", themeId);
}

export const RHYTHM_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  RHYTHM_STORAGE_KEY
)};var raw=localStorage.getItem(k);var theme="classic";if(raw){var p=JSON.parse(raw);if(p&&typeof p.themeId==="string")theme=p.themeId;}document.documentElement.setAttribute("data-theme",theme);}catch(e){document.documentElement.setAttribute("data-theme","classic");}})();`;
