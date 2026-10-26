import { afterEach, describe, expect, it } from "vitest";
import { unlockTestVault } from "@/test/unlock-vault";
import { createCompanionMember, readCompanionStore } from "@/lib/companion";
import { readRhythmPrefs } from "@/lib/rhythm/persist";
import { readSprintStore } from "@/lib/sprint/persist";
import {
  applyUniversePreset,
  buildDayPlan,
  customizeUniverse,
  DEFAULT_UNIVERSE_PREFS,
  FOCUS_SOUND_CATALOG,
  FocusSoundEngine,
  planStudyMinutes,
  prefsFromPreset,
  readUniversePrefs,
  rescheduleMissedPlan,
  skipUniverse,
  suggestUniverseProfile,
  UNIVERSE_PRESET_LIST,
  UNIVERSE_PRESETS,
  UNIVERSE_PROFILE_IDS,
  UNIVERSE_STORAGE_KEY,
  universeStorageKey,
} from "@/lib/universe";

describe("My Study Universe", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("defines seven distinct presets, including mixed profiles that are not copies", () => {
    expect(UNIVERSE_PROFILE_IDS).toHaveLength(7);
    expect(UNIVERSE_PRESET_LIST).toHaveLength(7);
    const signatures = UNIVERSE_PRESET_LIST.map((preset) =>
      [
        preset.themeId,
        preset.sessionMinutes,
        preset.breakMinutes,
        preset.explanationFormat,
        preset.noteStyle,
        preset.companionStyle,
        preset.suggestedSound,
        preset.storyEmphasis,
        preset.revisionEmphasis,
      ].join("|")
    );
    expect(new Set(signatures).size).toBe(7);
    expect(UNIVERSE_PRESETS.vata_pitta.themeId).not.toBe(UNIVERSE_PRESETS.vata.themeId);
    expect(UNIVERSE_PRESETS.vata_pitta.themeId).not.toBe(UNIVERSE_PRESETS.pitta.themeId);
    expect(UNIVERSE_PRESETS.vata_pitta.companionStyle).not.toBe(UNIVERSE_PRESETS.vata.companionStyle);
    expect(UNIVERSE_PRESETS.pitta_kapha.breakMinutes).not.toBe(UNIVERSE_PRESETS.pitta.breakMinutes);
    expect(UNIVERSE_PRESETS.vata_kapha.suggestedSound).not.toBe(UNIVERSE_PRESETS.vata.suggestedSound);
    expect(UNIVERSE_PRESETS.vata_kapha.suggestedSound).not.toBe(UNIVERSE_PRESETS.kapha.suggestedSound);
    expect(UNIVERSE_PRESETS.balanced.themeId).toBe("classic");
  });

  it("maps even scores to Balanced and keeps mixed canonical types", () => {
    expect(
      suggestUniverseProfile({
        scores: { Vata: 34, Pitta: 33, Kapha: 33 },
      })
    ).toBe("balanced");
    expect(suggestUniverseProfile({ canonicalType: "Vata-Pitta" })).toBe("vata_pitta");
    expect(suggestUniverseProfile({ canonicalType: "Pitta-Kapha" })).toBe("pitta_kapha");
    expect(suggestUniverseProfile({ canonicalType: "Vata-Kapha" })).toBe("vata_kapha");
    expect(suggestUniverseProfile({ canonicalType: "Vata" })).toBe("vata");
  });

  it("applies a preset as a coordinated set and lets every setting be overridden", async () => {
    await unlockTestVault("user-a");
    applyUniversePreset("vata", "user-a");
    const prefs = readUniversePrefs("user-a");
    expect(prefs.activated).toBe(true);
    expect(prefs.themeId).toBe("warm-grounded");
    expect(prefs.sessionMinutes).toBe(25);
    expect(prefs.companionStyle).toBe("buddy");
    expect(readRhythmPrefs().themeId).toBe("warm-grounded");
    expect(readSprintStore("user-a").preferredDuration).toBe(25);
    expect(readCompanionStore("user-a").collection).toHaveLength(4);
    expect(readCompanionStore("user-a").prefs.style).toBe("buddy");

    const next = customizeUniverse(
      { sessionMinutes: 45, explanationFormat: "structured", reminderTone: "steady" },
      "user-a"
    );
    expect(next.sessionMinutes).toBe(45);
    expect(next.explanationFormat).toBe("structured");
    expect(next.reminderTone).toBe("steady");
    expect(next.customized).toBe(true);
    expect(next.themeId).toBe("warm-grounded");
    expect(readSprintStore("user-a").preferredDuration).toBe(45);

    createCompanionMember({ name: "Luna", style: "guide", character: "kite" }, "user-a");
    applyUniversePreset("pitta", "user-a");
    expect(readCompanionStore("user-a").collection.some((member) => member.name === "Luna")).toBe(true);
    expect(readCompanionStore("user-a").prefs.style).toBe("teacher");
  });

  it("builds editable day plans from a daily goal without asking for each break", () => {
    const prefs = prefsFromPreset(UNIVERSE_PRESETS.vata, { dailyGoalMinutes: 90 });
    const plan = buildDayPlan({ prefs });
    const kinds = plan.blocks.map((block) => block.kind);
    expect(kinds).toContain("focus");
    expect(kinds).toContain("break");
    expect(kinds).toContain("quiz");
    expect(kinds).toContain("revision");
    expect(kinds).toContain("buffer");
    expect(planStudyMinutes(plan)).toBeGreaterThanOrEqual(80);
    expect(plan.nextSuggestedSession).toMatch(/Next suggested session/i);

    const short = buildDayPlan({
      prefs: prefsFromPreset(UNIVERSE_PRESETS.pitta, { dailyGoalMinutes: 45 }),
    });
    expect(short.blocks.some((block) => block.kind === "focus")).toBe(true);
    expect(short.dailyGoalMinutes).toBe(45);

    const long = buildDayPlan({
      prefs: prefsFromPreset(UNIVERSE_PRESETS.kapha, { dailyGoalMinutes: 120 }),
    });
    expect(long.blocks.filter((block) => block.kind === "focus").length).toBeGreaterThanOrEqual(2);

    const missed = rescheduleMissedPlan({ prefs, previous: plan });
    expect(missed.missedRescheduled).toBe(true);
    expect(missed.nextSuggestedSession).toMatch(/Later today/i);
    expect(missed.blocks.some((block) => block.kind === "buffer")).toBe(true);
  });

  it("skips personalization and keeps students isolated", async () => {
    await unlockTestVault("user-a");
    applyUniversePreset("pitta", "user-a");
    await unlockTestVault("user-b");
    skipUniverse("user-b");
    expect(readUniversePrefs("user-b").skipped).toBe(true);
    expect(readUniversePrefs("user-b").activated).toBe(false);
    await unlockTestVault("user-a");
    expect(readUniversePrefs("user-a").activated).toBe(true);
    expect(universeStorageKey("user-a")).not.toBe(universeStorageKey("user-b"));
    expect(readUniversePrefs("user-a").themeId).toBe("cool-clear");
    expect(DEFAULT_UNIVERSE_PREFS.soundEnabled).toBe(false);
    expect(DEFAULT_UNIVERSE_PREFS.focusSound).toBe("silence");
    window.localStorage.setItem(
      UNIVERSE_STORAGE_KEY,
      JSON.stringify({ activated: true, profileId: "vata" })
    );
    expect(readUniversePrefs("user-c").activated).toBe(false);
  });

  it("keeps focus sounds off until play is called", () => {
    const engine = new FocusSoundEngine();
    expect(engine.isPlaying()).toBe(false);
    expect(engine.currentSound()).toBe("silence");
    expect(engine.isMuted()).toBe(false);
    engine.setVolume(0.5);
    engine.setMuted(true);
    expect(engine.getVolume()).toBe(0.5);
    expect(engine.isMuted()).toBe(true);
    expect(FOCUS_SOUND_CATALOG.map((item) => item.id)).toEqual([
      "silence",
      "rain",
      "water",
      "forest",
      "white",
    ]);
    expect(FOCUS_SOUND_CATALOG.every((item) => item.source === "generated")).toBe(true);
  });
});
