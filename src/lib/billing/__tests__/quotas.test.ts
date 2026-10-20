import { beforeEach, describe, expect, it } from "vitest";
import {
  applyExamBoosterPack,
  clearLocalBillingQuotaStore,
  evaluateAndConsumeQuota,
  EXAM_BOOSTER_PACK_SPEC,
  PLAN_ENTITLEMENTS,
  upgradeUserPlanTier,
} from "../quotas";
import {
  buildDrmSecurityPolicyForAsset,
  DEFAULT_COACHING_ORGANIZATION,
  DEFAULT_INSTITUTE_BATCH_ASSETS,
  verifySyllabusLockedPrompt,
} from "@/lib/institute/drm-portal";

describe("Layer 5: Freemium Metering, Exam Booster Packs & B2B Coaching Institute DRM Portal", () => {
  beforeEach(() => {
    clearLocalBillingQuotaStore();
  });

  describe("1. Free Tier Quotas (Max 3 PDFs, 10 AI Explanations/day, 1 AI Quiz/day)", () => {
    const freeUserId = "student-free-001";

    it("enforces max 3 active PDFs on the Free Tier and blocks the 4th PDF", async () => {
      expect(PLAN_ENTITLEMENTS.free.maxActivePdfs).toBe(3);

      for (let i = 1; i <= 3; i++) {
        const res = await evaluateAndConsumeQuota({
          userId: freeUserId,
          resource: "active_pdf",
        });
        expect(res.allowed).toBe(true);
        expect(res.state.activePdfCount).toBe(i);
      }

      // 4th PDF upload attempt on Free tier must be blocked
      const fourthAttempt = await evaluateAndConsumeQuota({
        userId: freeUserId,
        resource: "active_pdf",
      });
      expect(fourthAttempt.allowed).toBe(false);
      expect(fourthAttempt.state.activePdfCount).toBe(3);
      expect(fourthAttempt.reason).toContain("max 3 active PDFs");
    });

    it("enforces max 10 grounded AI explanations/day and max 1 AI quiz/day on Free Tier", async () => {
      for (let i = 1; i <= 10; i++) {
        const expRes = await evaluateAndConsumeQuota({
          userId: freeUserId,
          resource: "ai_explanation",
        });
        expect(expRes.allowed).toBe(true);
      }

      // 11th AI explanation on the same day is blocked
      const eleventhExplanation = await evaluateAndConsumeQuota({
        userId: freeUserId,
        resource: "ai_explanation",
      });
      expect(eleventhExplanation.allowed).toBe(false);
      expect(eleventhExplanation.reason).toContain("10/day");

      // 1st AI quiz is allowed, 2nd AI quiz on Free Tier is blocked
      const firstQuiz = await evaluateAndConsumeQuota({
        userId: freeUserId,
        resource: "ai_quiz",
      });
      expect(firstQuiz.allowed).toBe(true);

      const secondQuiz = await evaluateAndConsumeQuota({
        userId: freeUserId,
        resource: "ai_quiz",
      });
      expect(secondQuiz.allowed).toBe(false);
      expect(secondQuiz.reason).toContain("1/day");
    });
  });

  describe("2. Pro / Exam Pass Tier (₹199/mo & ₹799/6mo: 25+ PDFs, 150 AI Explanations/day, Unlimited Quizzes)", () => {
    it("unlocks 25+ active PDFs, 150 AI explanations/day, and unlimited quiz generation", async () => {
      const proUserId = "student-pro-001";
      expect(PLAN_ENTITLEMENTS.pro_monthly.priceInr).toBe(199);
      expect(PLAN_ENTITLEMENTS.pro_monthly.maxActivePdfs).toBe(25);
      expect(PLAN_ENTITLEMENTS.pro_monthly.dailyAiExplanationsLimit).toBe(150);
      expect(PLAN_ENTITLEMENTS.pro_monthly.dailyAiQuizzesLimit).toBeNull();

      expect(PLAN_ENTITLEMENTS.exam_pass_6mo.priceInr).toBe(799);
      expect(PLAN_ENTITLEMENTS.exam_pass_6mo.maxActivePdfs).toBeGreaterThanOrEqual(
        25
      );

      await upgradeUserPlanTier({
        userId: proUserId,
        newTier: "pro_monthly",
      });

      // Verify unlimited quiz generation (> 15 quizzes in a single day)
      for (let q = 1; q <= 15; q++) {
        const quizCheck = await evaluateAndConsumeQuota({
          userId: proUserId,
          resource: "ai_quiz",
        });
        expect(quizCheck.allowed).toBe(true);
      }

      // Verify > 3 PDFs (e.g. 10 PDFs) allowed
      for (let p = 1; p <= 10; p++) {
        const pdfCheck = await evaluateAndConsumeQuota({
          userId: proUserId,
          resource: "active_pdf",
        });
        expect(pdfCheck.allowed).toBe(true);
      }
    });
  });

  describe("3. Exam Booster Top-Up Pack (₹49/mo: +100 AI Explanations + 20 Quizzes)", () => {
    it("credits +100 explanations and +20 quizzes and automatically draws from Booster when daily Free limit is exhausted", async () => {
      const userId = "student-booster-001";
      expect(EXAM_BOOSTER_PACK_SPEC.priceInr).toBe(49);
      expect(EXAM_BOOSTER_PACK_SPEC.bonusAiExplanations).toBe(100);
      expect(EXAM_BOOSTER_PACK_SPEC.bonusAiQuizzes).toBe(20);

      // Exhaust the 1 daily free quiz
      const firstQuiz = await evaluateAndConsumeQuota({
        userId,
        resource: "ai_quiz",
      });
      expect(firstQuiz.allowed).toBe(true);

      const blockedQuiz = await evaluateAndConsumeQuota({
        userId,
        resource: "ai_quiz",
      });
      expect(blockedQuiz.allowed).toBe(false);

      // Purchase ₹49 Exam Booster Pack
      const boostedState = await applyExamBoosterPack({
        userId,
        packCount: 1,
      });
      expect(boostedState.boosterPacksPurchased).toBe(1);
      expect(boostedState.boosterExplanationsRemaining).toBe(100);
      expect(boostedState.boosterQuizzesRemaining).toBe(20);

      // Now the 2nd quiz succeeds by drawing from the Booster pack!
      const boosterQuiz = await evaluateAndConsumeQuota({
        userId,
        resource: "ai_quiz",
      });
      expect(boosterQuiz.allowed).toBe(true);
      expect(boosterQuiz.consumedFromBooster).toBe(true);
      expect(boosterQuiz.state.boosterQuizzesRemaining).toBe(19);
    });
  });

  describe("4. Coaching Institute B2B DRM Watermarking & Access Control (`drm-portal.ts`)", () => {
    const asset = DEFAULT_INSTITUTE_BATCH_ASSETS[0];

    it("generates dynamic student-ID and phone number watermarks and enforces download/print locks for authorized institute students", () => {
      const policy = buildDrmSecurityPolicyForAsset({
        asset,
        student: {
          studentId: "STU-2026-8841",
          studentName: "Ananya Rao",
          phoneNumber: "+91-9876543210",
          organizationId: DEFAULT_COACHING_ORGANIZATION.id,
          organizationSlug: DEFAULT_COACHING_ORGANIZATION.slug,
        },
        timestampIso: "2026-10-20T12:00:00.000Z",
      });

      expect(policy.blockLocalDownload).toBe(true);
      expect(policy.blockPrint).toBe(true);
      expect(policy.blockContextMenuAndCopy).toBe(true);
      expect(policy.dynamicWatermarkLines[0]).toContain("STU-2026-8841");
      expect(policy.dynamicWatermarkLines[1]).toContain("+91-9876543210");
      expect(policy.watermarkDiagonalText).toContain(
        "STU-2026-8841 • +91-9876543210 • DO NOT DISTRIBUTE"
      );
    });

    it("denies DRM asset access when a student belongs to a different organization_id", () => {
      expect(() =>
        buildDrmSecurityPolicyForAsset({
          asset,
          student: {
            studentId: "OUTSIDER-99",
            studentName: "Unauthorized User",
            phoneNumber: "+91-9111111111",
            organizationId: "org-different-institute",
            organizationSlug: "other-institute",
          },
        })
      ).toThrow(/Access Denied/);
    });

    it("enforces Syllabus-Locked AI guardrails on institute batch assets", () => {
      const validQuery = verifySyllabusLockedPrompt({
        asset,
        queryText: "How does Newton's second law relate force, mass, and acceleration?",
      });
      expect(validQuery.allowed).toBe(true);

      const offSyllabusQuery = verifySyllabusLockedPrompt({
        asset,
        queryText: "Write a Python script for stock market trading",
      });
      expect(offSyllabusQuery.allowed).toBe(false);
      expect(offSyllabusQuery.reason).toContain("Syllabus-Locked AI Guardrail");
    });
  });
});
