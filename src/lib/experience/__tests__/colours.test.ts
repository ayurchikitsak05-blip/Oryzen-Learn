import { afterEach, describe, expect, it } from "vitest";
import { applyColour, COLOUR_CHOICES, colourForTheme, currentColour } from "../colours";
import { readExperienceRecord, writeExperiencePrefs, defaultExperiencePrefs } from "../persist";
import { readRhythmPrefs } from "@/lib/rhythm/persist";
import { EXPERIENCE_STORAGE_KEY } from "../types";

describe("Personalize colours", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-theme");
    delete document.documentElement.dataset.experience;
  });

  it("offers Beige, Clay, Teal, Peach and Night", () => {
    expect(COLOUR_CHOICES.map((choice) => choice.label)).toEqual(["Beige", "Clay", "Teal", "Peach", "Night"]);
  });

  it("matches study styles to colours", () => {
    expect(colourForTheme("warm-grounded")).toBe("clay");
    expect(colourForTheme("cool-clear")).toBe("teal");
    expect(colourForTheme("fresh-energizing")).toBe("peach");
    expect(colourForTheme("warm-lift")).toBeNull();
  });

  it("a light colour switches the study theme and drops the older look", () => {
    writeExperiencePrefs({ ...defaultExperiencePrefs("student-a"), experience: "focus" });
    document.documentElement.style.setProperty("--bg", "#000000");
    expect(currentColour("student-a")).toBeNull();

    applyColour("teal", "student-a");
    expect(readRhythmPrefs().themeId).toBe("cool-clear");
    expect(window.localStorage.getItem(EXPERIENCE_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBe("cool-clear");
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("");
    expect(currentColour("student-a")).toBe("teal");
  });

  it("Night uses the dark look with its own readable accent", () => {
    applyColour("night", "student-a");
    const saved = readExperienceRecord();
    expect(saved?.experience).toBe("momentum");
    expect(saved?.usePrakritiAccent).toBe(false);
    expect(document.documentElement.dataset.experience).toBe("momentum");
    expect(currentColour("student-a")).toBe("night");
    // Another student on the same phone isn't shown this student's Night choice,
    // and their light colour doesn't erase it.
    expect(currentColour("student-b")).not.toBe("night");
    applyColour("clay", "student-b");
    expect(readExperienceRecord()?.experience).toBe("momentum");
  });
});
