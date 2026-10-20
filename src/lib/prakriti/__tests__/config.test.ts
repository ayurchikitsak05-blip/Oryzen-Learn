import { describe, it, expect } from "vitest";
import {
  calculatePrakritiProfile,
  COGNITIVE_METRIC_LABELS,
  DOSHA_STUDY_PRESETS,
  DWANDWAJA_THRESHOLD_PERCENT,
  normalizeDoshaScores,
  PRAKRITI_PROFILE_LABELS,
} from "../config";

describe("Layer 0: Prakriti Cognitive & Lifestyle Engine (config.ts)", () => {
  describe("normalizeDoshaScores", () => {
    it("normalizes arbitrary positive point totals to 100%", () => {
      const normalized = normalizeDoshaScores({
        Vata: 15,
        Pitta: 10,
        Kapha: 5,
      });
      expect(normalized.Vata).toBe(50);
      expect(normalized.Pitta).toBeCloseTo(33.33, 2);
      expect(normalized.Kapha).toBeCloseTo(16.67, 2);
      expect(
        normalized.Vata + normalized.Pitta + normalized.Kapha
      ).toBeCloseTo(100, 2);
    });

    it("handles zeroed input safely without NaN", () => {
      const normalized = normalizeDoshaScores({ Vata: 0, Pitta: 0, Kapha: 0 });
      expect(normalized.Vata).toBe(33.33);
      expect(normalized.Pitta).toBe(33.33);
      expect(normalized.Kapha).toBe(33.34);
    });
  });

  describe("Single-Dosha Dominant Profiles (> 15% margin)", () => {
    it("correctly configures a Vata-dominant student (#FBF5E8, 22m/5m sprint, illustrative lens)", () => {
      const profile = calculatePrakritiProfile(
        { Vata: 70, Pitta: 20, Kapha: 10 },
        { Vata: 65, Pitta: 25, Kapha: 10 }
      );

      // 70% * 65 + 30% * 70 = 45.5 + 21 = 66.5 Vata
      // 70% * 25 + 30% * 20 = 17.5 + 6 = 23.5 Pitta
      expect(profile.readerUiScores.Vata).toBe(66.5);
      expect(profile.readerUiScores.Pitta).toBe(23.5);
      expect(profile.isDwandwaja).toBe(false);
      expect(profile.classification).toBe("Vata");
      expect(profile.canonicalType).toBe("Vata");
      expect(profile.primaryDosha).toBe("Vata");
      expect(profile.secondaryDosha).toBeNull();

      expect(profile.activeConfiguration.theme.backgroundHex).toBe("#FBF5E8");
      expect(profile.activeConfiguration.theme.cssVariable).toBe("--theme-vata");
      expect(profile.activeConfiguration.pomodoro.studySprintMinutes).toBe(22);
      expect(profile.activeConfiguration.pomodoro.breakMinutes).toBe(5);
      expect(profile.activeConfiguration.defaultHighlightLens).toBe(
        "illustrative"
      );
      expect(profile.activeConfiguration.dinacharyaBreak.pranayama).toContain(
        "Nadi Shodhana"
      );
    });

    it("correctly configures a Pitta-dominant student (#F2F6F3, 40m/8m sprint, high_yield_revision lens)", () => {
      const profile = calculatePrakritiProfile(
        { Vata: 15, Pitta: 70, Kapha: 15 },
        { Vata: 20, Pitta: 65, Kapha: 15 }
      );

      expect(profile.isDwandwaja).toBe(false);
      expect(profile.classification).toBe("Pitta");
      expect(profile.primaryDosha).toBe("Pitta");
      expect(profile.activeConfiguration.theme.backgroundHex).toBe("#F2F6F3");
      expect(profile.activeConfiguration.theme.cssVariable).toBe(
        "--theme-pitta"
      );
      expect(profile.activeConfiguration.pomodoro.studySprintMinutes).toBe(40);
      expect(profile.activeConfiguration.pomodoro.breakMinutes).toBe(8);
      expect(profile.activeConfiguration.defaultHighlightLens).toBe(
        "high_yield_revision"
      );
      expect(
        profile.activeConfiguration.dinacharyaBreak.ocularOrPhysicalProtocol
      ).toContain("Chakshushya");
    });

    it("correctly configures a Kapha-dominant student (#FFFDF9, 30m/5m with 15m check-in, test_me lens)", () => {
      const profile = calculatePrakritiProfile(
        { Vata: 10, Pitta: 20, Kapha: 70 },
        { Vata: 15, Pitta: 20, Kapha: 65 }
      );

      expect(profile.isDwandwaja).toBe(false);
      expect(profile.classification).toBe("Kapha");
      expect(profile.primaryDosha).toBe("Kapha");
      expect(profile.activeConfiguration.theme.backgroundHex).toBe("#FFFDF9");
      expect(profile.activeConfiguration.theme.cssVariable).toBe(
        "--theme-kapha"
      );
      expect(profile.activeConfiguration.pomodoro.studySprintMinutes).toBe(30);
      expect(profile.activeConfiguration.pomodoro.breakMinutes).toBe(5);
      expect(
        profile.activeConfiguration.pomodoro.microInteractionIntervalMinutes
      ).toBe(15);
      expect(profile.activeConfiguration.defaultHighlightLens).toBe("test_me");
      expect(profile.activeConfiguration.dinacharyaBreak.pranayama).toContain(
        "Kapalabhati"
      );
    });
  });

  describe("Dual-Dosha (Dwandwaja) Classification (<= 15% threshold)", () => {
    it("classifies as Dwandwaja when top two Reader UI scores are within 15%", () => {
      // Basic: Vata 50, Pitta 40, Kapha 10
      // Reading: Vata 48, Pitta 42, Kapha 10
      // Reader UI Vata = 0.7 * 48 + 0.3 * 50 = 33.6 + 15 = 48.6
      // Reader UI Pitta = 0.7 * 42 + 0.3 * 40 = 29.4 + 12 = 41.4
      // Margin = 7.2 <= 15 -> Vata-Pitta Dwandwaja
      const profile = calculatePrakritiProfile(
        { Vata: 50, Pitta: 40, Kapha: 10 },
        { Vata: 48, Pitta: 42, Kapha: 10 }
      );

      expect(profile.topTwoMargin).toBeCloseTo(7.2, 2);
      expect(profile.topTwoMargin).toBeLessThanOrEqual(
        DWANDWAJA_THRESHOLD_PERCENT
      );
      expect(profile.isDwandwaja).toBe(true);
      expect(profile.classification).toBe("Vata-Pitta");
      expect(profile.canonicalType).toBe("Vata-Pitta");
      expect(profile.primaryDosha).toBe("Vata");
      expect(profile.secondaryDosha).toBe("Pitta");

      // Primary Dosha (Vata) governs AI format & Reader Layout
      expect(profile.activeConfiguration.defaultHighlightLens).toBe(
        DOSHA_STUDY_PRESETS.Vata.defaultHighlightLens
      );
      expect(profile.activeConfiguration.readerLayoutMode).toBe(
        DOSHA_STUDY_PRESETS.Vata.readerLayoutMode
      );

      // Secondary Dosha (Pitta) governs timer, theme, and lifestyle guardrails
      expect(profile.activeConfiguration.theme.backgroundHex).toBe(
        DOSHA_STUDY_PRESETS.Pitta.theme.backgroundHex
      );
      expect(profile.activeConfiguration.pomodoro.studySprintMinutes).toBe(
        DOSHA_STUDY_PRESETS.Pitta.pomodoro.studySprintMinutes
      );
    });

    it("handles the exact 15.0% boundary as Dwandwaja and 15.1% as Single Dosha", () => {
      // Exact 15% difference: Vata 55, Pitta 40, Kapha 5 in both
      const exactBoundary = calculatePrakritiProfile(
        { Vata: 55, Pitta: 40, Kapha: 5 },
        { Vata: 55, Pitta: 40, Kapha: 5 }
      );
      expect(exactBoundary.topTwoMargin).toBe(15);
      expect(exactBoundary.isDwandwaja).toBe(true);
      expect(exactBoundary.canonicalType).toBe("Vata-Pitta");

      // 16% difference: Vata 55.5, Pitta 39.5, Kapha 5
      const aboveBoundary = calculatePrakritiProfile(
        { Vata: 55.5, Pitta: 39.5, Kapha: 5 },
        { Vata: 55.5, Pitta: 39.5, Kapha: 5 }
      );
      expect(aboveBoundary.topTwoMargin).toBe(16);
      expect(aboveBoundary.isDwandwaja).toBe(false);
      expect(aboveBoundary.classification).toBe("Vata");
    });
  });

  describe("Divergent Physical Prakriti vs. Reading Cognitive Prakriti (70/30 vs 50/50)", () => {
    it("prioritizes Reading Prakriti (70%) for UI/AI while respecting Physical Prakriti (50%) for lifestyle breaks", () => {
      // Student has strong Kapha physical constitution (Basic: Kapha 80, Vata 10, Pitta 10)
      // but exhibits acute Vata reading restlessness/skimming on screen (Reading: Vata 70, Kapha 20, Pitta 10)
      const profile = calculatePrakritiProfile(
        { Vata: 10, Pitta: 10, Kapha: 80 },
        { Vata: 70, Pitta: 10, Kapha: 20 }
      );

      // Reader UI (70% Reading + 30% Basic):
      // Vata = 0.7 * 70 + 0.3 * 10 = 49 + 3 = 52
      // Kapha = 0.7 * 20 + 0.3 * 80 = 14 + 24 = 38
      // Pitta = 0.7 * 10 + 0.3 * 10 = 10
      expect(profile.readerUiScores.Vata).toBe(52);
      expect(profile.readerUiScores.Kapha).toBe(38);
      expect(profile.primaryDosha).toBe("Vata");

      // Lifestyle / Breaks (50% Reading + 50% Basic):
      // Vata = 0.5 * 70 + 0.5 * 10 = 40
      // Kapha = 0.5 * 20 + 0.5 * 80 = 50
      // Pitta = 10
      expect(profile.lifestyleBreakScores.Kapha).toBe(50);
      expect(profile.lifestyleBreakScores.Vata).toBe(40);
      expect(profile.lifestyleDominantDosha).toBe("Kapha");

      // Since topTwoMargin is 52 - 38 = 14 (<= 15), it is Vata-Kapha Dwandwaja:
      // Primary Dosha = Vata (AI format = illustrative, Bite-Sized Focus Card)
      // Secondary Dosha = Kapha (Timer = 30m/5m with 15m check-in, Dinacharya = Kapalabhati/movement)
      expect(profile.isDwandwaja).toBe(true);
      expect(profile.canonicalType).toBe("Vata-Kapha");
      expect(profile.activeConfiguration.defaultHighlightLens).toBe(
        "illustrative"
      );
      expect(profile.activeConfiguration.dinacharyaBreak.pranayama).toContain(
        "Kapalabhati"
      );
    });
  });

  describe("Modern Student-Friendly Terminology Mapping", () => {
    it("maps Vata, Pitta, Kapha, and Dwandwaja to modern profiles with classical Ayurvedic terms in brackets", () => {
      expect(PRAKRITI_PROFILE_LABELS.Vata).toBe(
        "The Spark & Sprint Profile (Vata)"
      );
      expect(PRAKRITI_PROFILE_LABELS.Pitta).toBe(
        "The Laser & Logic Profile (Pitta)"
      );
      expect(PRAKRITI_PROFILE_LABELS.Kapha).toBe(
        "The Anchor & Endurance Profile (Kapha)"
      );
      expect(PRAKRITI_PROFILE_LABELS.Dwandwaja).toBe(
        "The Hybrid Dynamic Profile (Mixed Dosha)"
      );

      expect(COGNITIVE_METRIC_LABELS.dhee.shortLabel).toBe("Quick-Take Speed");
      expect(COGNITIVE_METRIC_LABELS.dhriti.shortLabel).toBe("Focus Stamina");
      expect(COGNITIVE_METRIC_LABELS.smriti.shortLabel).toBe("Recall Power");
      expect(COGNITIVE_METRIC_LABELS.dinacharya.shortLabel).toBe(
        "Recovery & Flow Rituals"
      );

      const vataProfile = calculatePrakritiProfile(
        { Vata: 70, Pitta: 20, Kapha: 10 },
        { Vata: 70, Pitta: 20, Kapha: 10 }
      );
      expect(vataProfile.displayProfileTitle).toBe(
        "The Spark & Sprint Profile (Vata)"
      );

      const hybridProfile = calculatePrakritiProfile(
        { Vata: 50, Pitta: 40, Kapha: 10 },
        { Vata: 48, Pitta: 42, Kapha: 10 }
      );
      expect(hybridProfile.displayProfileTitle).toContain(
        "The Hybrid Dynamic Profile (Mixed Dosha)"
      );
    });
  });
});
