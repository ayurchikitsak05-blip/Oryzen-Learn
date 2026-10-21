import { afterEach, describe, expect, it, vi } from "vitest";
import { generateStudyText } from "../providers";
import {
  SHIELD_4_DEFAULT_WALLET_CAP_INR,
  canConsumeReservation,
  clearLocalAiSpendState,
  getOwnMonthlyAiUsage,
  listOwnAiUsageObservations,
  recordAiUsageObservation,
  reserveMonthlyAiBudget,
  setLocalWalletSpendForUser,
} from "../spend-guard";

describe("Shield 4 monthly spend reservation", () => {
  afterEach(() => {
    clearLocalAiSpendState();
    vi.restoreAllMocks();
  });

  it("reuses the existing ₹70 Shield 4 wallet constant and does not invent a SKU", () => {
    expect(SHIELD_4_DEFAULT_WALLET_CAP_INR).toBe(70);
  });

  it("blocks a second concurrent reserve that would exceed the monthly cap", () => {
    setLocalWalletSpendForUser("student-a", "2026-10", 69.98);
    const first = reserveMonthlyAiBudget({
      userId: "student-a",
      billingMonth: "2026-10",
      spentInr: 69.98,
      estimateInr: 0.015,
    });
    const second = reserveMonthlyAiBudget({
      userId: "student-a",
      billingMonth: "2026-10",
      spentInr: 69.98,
      estimateInr: 0.015,
    });
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe("monthly_cap");
    expect(canConsumeReservation(second.reservation, 0.015)).toBe(false);
  });

  it("keeps retries and fallbacks inside the same reserved allocation", () => {
    const decision = reserveMonthlyAiBudget({
      userId: "student-a",
      billingMonth: "2026-10",
      spentInr: 10,
      estimateInr: 0.02,
    });
    expect(decision.allowed).toBe(true);
    expect(canConsumeReservation(decision.reservation, 0.02)).toBe(true);
    expect(canConsumeReservation(decision.reservation, 0.03)).toBe(false);
  });

  it("applies a tighter remaining-wallet check for whole-vault generate", () => {
    const blocked = reserveMonthlyAiBudget({
      userId: "student-a",
      billingMonth: "2026-10",
      spentInr: 60,
      estimateInr: 0.08,
      spendClass: "vault_generate",
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("deep_synthesis_limit");
  });

  it("logs an 80% warning without user identifiers or passage text", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    reserveMonthlyAiBudget({
      userId: "student-secret",
      billingMonth: "2026-10",
      spentInr: 55,
      estimateInr: 2,
    });
    expect(warn).toHaveBeenCalled();
    const payload = String(warn.mock.calls[0]?.[0] ?? "");
    expect(payload).toContain("oryzen.ai.wallet.80pct");
    expect(payload).toContain("2026-10");
    expect(payload).not.toContain("student-secret");
    expect(payload).not.toContain("passage");
  });

  it("records per-user usage without prompt or textbook body", async () => {
    recordAiUsageObservation("student-a", {
      billingMonth: "2026-10",
      provider: "google",
      model: "gemini-2.5-flash-lite",
      promptTokens: 200,
      completionTokens: 80,
      costInr: 0.012,
      success: true,
      fallback: false,
      cacheHit: false,
      budgetBlocked: false,
    });
    const listed = listOwnAiUsageObservations("student-a");
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed[0])).not.toMatch(/selectedText|textbook|passage body/i);
    const report = await getOwnMonthlyAiUsage({
      userId: "student-a",
      billingMonth: "2026-10",
    });
    expect(report.spentInr).toBe(0);
    expect(report.callCount).toBe(1);
    expect(report.walletCapInr).toBe(70);
  });

  it("does not call a paid adapter when generateStudyText is over budget", async () => {
    const previous = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    };
    process.env.GEMINI_API_KEY = "gemini-test";
    process.env.OPENAI_API_KEY = "";
    process.env.MISTRAL_API_KEY = "";
    setLocalWalletSpendForUser("vault-user", "2026-10", 70);
    const fetchImpl = vi.fn();
    try {
      const result = await generateStudyText({
        prompt: "Explain the excerpt. This prompt must never be logged.",
        userId: "vault-user",
        billingMonth: "2026-10",
        spendClass: "vault_chat",
        fetchImpl,
      });
      expect(result?.budgetBlocked).toBe(true);
      expect(result?.text).toBe("");
      expect(fetchImpl).not.toHaveBeenCalled();
      const blob = JSON.stringify(listOwnAiUsageObservations("vault-user"));
      expect(blob).not.toContain("Explain the excerpt");
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
