import { afterEach, describe, expect, it } from "vitest";
import {
  readRhythmPrefs,
  sanitizeRhythmPrefs,
  writeRhythmPrefs,
} from "../persist";
import { DEFAULT_RHYTHM_PREFS, RHYTHM_STORAGE_KEY } from "../types";

describe("study rhythm persist", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("stores theme and coach placeholders under oryzen_study_rhythm_v1", () => {
    const saved = writeRhythmPrefs({
      ...DEFAULT_RHYTHM_PREFS,
      themeId: "warm-grounded",
      coachStyle: "calm",
      encouragementOff: true,
    });
    expect(window.localStorage.getItem(RHYTHM_STORAGE_KEY)).toContain("warm-grounded");
    expect(readRhythmPrefs().themeId).toBe("warm-grounded");
    expect(readRhythmPrefs().coachStyle).toBe("calm");
    expect(readRhythmPrefs().encouragementOff).toBe(true);
    expect(saved.pdfPaperOptIn).toBe(false);
  });

  it("falls back to Classic Soft Beige for corrupt or unknown values", () => {
    expect(sanitizeRhythmPrefs({ themeId: "neon" }).themeId).toBe("classic");
    expect(sanitizeRhythmPrefs(null).themeId).toBe("classic");
    window.localStorage.setItem(RHYTHM_STORAGE_KEY, "{not-json");
    expect(readRhythmPrefs().themeId).toBe("classic");
  });
});
