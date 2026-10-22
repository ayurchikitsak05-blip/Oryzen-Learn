import { afterEach, describe, expect, it } from "vitest";
import { suggestionForCanonical } from "@/lib/rhythm/suggest";
import { detectCoachTrigger } from "../detect";
import { cacheKey, readCoachPrefs, rememberShown, writeCoachPrefs } from "../persist";
import { selectAndRemember, selectCoachMessage } from "../selector";
import { suggestedVoice, voiceFromRhythmStyle } from "../styles";
import { DEFAULT_COACH_PREFS } from "../types";

describe("coach selector", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("avoids recently shown ids and returns a different rotate pick", () => {
    const first = selectCoachMessage({
      style: "balanced_support",
      trigger: "dashboard_open",
      seed: "user-a::2026-10-22",
    });
    expect(first).toBeTruthy();
    const second = selectCoachMessage({
      style: "balanced_support",
      trigger: "dashboard_open",
      seed: "user-a::2026-10-22",
      recentIds: [first!.id],
      rotate: true,
      cachedId: first!.id,
    });
    expect(second).toBeTruthy();
    expect(second!.id).not.toBe(first!.id);
  });

  it("reuses the cached id for the same user, trigger, and day", () => {
    const first = selectAndRemember({
      style: "courage_calm",
      trigger: "overwhelmed",
      userId: "user-cache",
      day: "2026-10-22",
    });
    expect(first).toBeTruthy();
    const prefs = readCoachPrefs("user-cache");
    expect(prefs.shownByKey[cacheKey("user-cache", "overwhelmed", "2026-10-22")]).toBe(first!.id);
    const again = selectCoachMessage({
      style: "courage_calm",
      trigger: "overwhelmed",
      cachedId: first!.id,
    });
    expect(again?.id).toBe(first!.id);
    rememberShown(first!.id, "user-cache", "overwhelmed", "2026-10-22");
    expect(readCoachPrefs("user-cache").recentIds[0]).toBe(first!.id);
  });

  it("shows nothing when encouragement is off or frequency is off", () => {
    const offEnc = detectCoachTrigger({
      today: "2026-10-22",
      record: null,
      quizEntries: [],
      prefs: { ...DEFAULT_COACH_PREFS },
      frequency: "regular",
      encouragementOff: true,
      styleOff: false,
    });
    const offFreq = detectCoachTrigger({
      today: "2026-10-22",
      record: null,
      quizEntries: [],
      prefs: { ...DEFAULT_COACH_PREFS },
      frequency: "off",
      encouragementOff: false,
      styleOff: false,
    });
    expect(offEnc).toBeNull();
    expect(offFreq).toBeNull();
  });

  it("keeps gentle frequency off the dashboard-open card", () => {
    const trigger = detectCoachTrigger({
      today: "2026-10-22",
      record: null,
      quizEntries: [],
      prefs: { ...DEFAULT_COACH_PREFS },
      frequency: "gentle",
      encouragementOff: false,
      styleOff: false,
    });
    expect(trigger).toBeNull();
  });

  it("does not lock style to the Prakriti suggestion", () => {
    const suggested = suggestionForCanonical("Vata");
    expect(suggested.coachStyle).toBe("calm");
    expect(voiceFromRhythmStyle(suggested.coachStyle)).toBe("courage_calm");
    expect(suggestedVoice("Vata")).toBe("courage_calm");
    expect(suggestedVoice("Pitta")).toBe("challenge_mastery");
    expect(suggestedVoice("Kapha")).toBe("momentum_action");
    expect(suggestedVoice(null)).toBe("balanced_support");
    expect(voiceFromRhythmStyle("mastery")).not.toBe(suggestedVoice("Vata"));
    writeCoachPrefs({ ...DEFAULT_COACH_PREFS, frequency: "regular" }, "user-style");
    expect(readCoachPrefs("user-style").frequency).toBe("regular");
  });
});
