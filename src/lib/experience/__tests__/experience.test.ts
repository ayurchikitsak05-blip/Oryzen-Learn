import { beforeEach, describe, expect, it } from "vitest";
import { achievementsFromSignals } from "../achievements";
import { READINESS_FEELINGS, READINESS_NOTE, readinessSuggestion } from "../check-in";
import {
  applyExperienceToDocument,
  experienceVisibleTo,
  resolveExperienceMode,
  writeExperiencePrefs,
} from "../persist";
import { EXPERIENCE_THEMES, resolveExperienceAccent } from "../themes";
import { contrastRatio } from "@/lib/rhythm/themes";
import { RHYTHM_STORAGE_KEY } from "@/lib/rhythm/types";
import { EXPERIENCE_STORAGE_KEY } from "../types";

describe("visual experiences", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-experience");
    document.documentElement.setAttribute("data-theme", "classic");
  });

  it("keeps readable text on every experience", () => {
    for (const theme of Object.values(EXPERIENCE_THEMES)) {
      expect(contrastRatio(theme.tokens.heading, theme.tokens.bg), theme.id).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.tokens.body, theme.tokens.bg), theme.id).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.tokens.heading, theme.tokens.beigePrimary), theme.id).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.tokens.accent, theme.tokens.bg), theme.id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses a Prakriti accent only when contrast holds", () => {
    const vataOnFocus = resolveExperienceAccent({
      experience: "focus",
      prakritiThemeId: "warm-grounded",
      usePrakritiAccent: true,
    });
    expect(vataOnFocus).toBe("#8F4A32");
    const vataOnMomentum = resolveExperienceAccent({
      experience: "momentum",
      prakritiThemeId: "warm-grounded",
      usePrakritiAccent: true,
    });
    expect(vataOnMomentum).not.toBe(EXPERIENCE_THEMES.momentum.tokens.accent);
    expect(contrastRatio(vataOnMomentum, EXPERIENCE_THEMES.momentum.tokens.bg)).toBeGreaterThanOrEqual(4.5);
    expect(
      resolveExperienceAccent({
        experience: "studio",
        prakritiThemeId: "cool-clear",
        usePrakritiAccent: false,
      })
    ).toBe(EXPERIENCE_THEMES.studio.tokens.accent);
  });

  it("leaves an existing student's theme alone until they choose", () => {
    localStorage.setItem(RHYTHM_STORAGE_KEY, JSON.stringify({ version: 1, themeId: "warm-grounded" }));
    expect(resolveExperienceMode("student-a").mode).toBe("preserve");
    applyExperienceToDocument({ mode: "preserve", prefs: null, prakritiThemeId: "warm-grounded" });
    expect(document.documentElement.dataset.experience).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("");
  });

  it("defaults a new student to Focus and hides another account's choice", () => {
    expect(resolveExperienceMode(null).mode).toBe("focus");
    writeExperiencePrefs({
      version: 1,
      ownerId: "student-a",
      experience: "studio",
      usePrakritiAccent: true,
      decorations: true,
      animations: true,
      rewards: true,
    });
    expect(experienceVisibleTo("student-b")).toBeNull();
    expect(experienceVisibleTo("student-a")?.experience).toBe("studio");
    expect(localStorage.getItem(EXPERIENCE_STORAGE_KEY)).toContain("studio");
  });

  it("earns rewards only from known study activity", () => {
    expect(achievementsFromSignals({}).every((item) => !item.earned)).toBe(true);
    const earned = achievementsFromSignals({
      hasBook: true,
      hasNote: false,
      studiedMinutes: 25,
    });
    expect(earned.find((item) => item.id === "first-book")?.earned).toBe(true);
    expect(earned.find((item) => item.id === "first-note")?.earned).toBe(false);
    expect(earned.find((item) => item.id === "focus-block")?.earned).toBe(true);
  });

  it("keeps the readiness check-in as a study suggestion", () => {
    expect(readinessSuggestion("tired")).toMatch(/revision/i);
    expect(READINESS_NOTE.toLowerCase()).toMatch(/not a health/);
    expect(READINESS_FEELINGS.map((item) => item.label).join(" ")).not.toMatch(/diagnosis|disorder|clinical/i);
  });
});
