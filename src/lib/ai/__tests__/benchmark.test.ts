import { describe, expect, it, vi } from "vitest";
import {
  DOMAIN_FIXTURES,
  GEMINI_EDU_HARD_CAP_USD,
  GEMINI_EDU_MAX_CALLS,
  GEMINI_EDU_PLANNED_CALLS,
  GEMINI_EDU_RESERVED_RETRIES,
  canAffordControlledBenchmarkCall,
  canAffordGeminiEducationalCall,
  canAffordGeminiQualityRetestCall,
  estimateGeminiQualityRetestUsd,
  geminiEduConservativeUsd,
  GEMINI_PRIOR_LEDGER_USD,
  GEMINI_QUALITY_RETEST_MAX_CALLS,
  recommendModelPerTask,
  runControlledBenchmark,
  runDeterministicBenchmark,
  runGeminiEducationalBenchmark,
  runGeminiQualityRetest,
  scoreQualityRetestCase,
} from "../benchmark";
import { composeDeterministicLensPayload } from "../lens-compose";
import { estimateTokensFromChars, listPriceUsd, projectMonthlyCost } from "../models";

const PROJECT_MODELS_LOCAL = [
  "gemini-3.5-flash-lite",
  "ministral-3b-2512",
  "gpt-6-luna",
] as const;

describe("lowest-cost model comparison (ESTIMATE, no live paid calls)", () => {
  it("scores deterministic compose on four domains and ten tasks", () => {
    const rows = runDeterministicBenchmark();
    expect(DOMAIN_FIXTURES).toHaveLength(4);
    const tasks = new Set(rows.map((row) => row.task));
    expect(tasks.size).toBe(10);
    expect(rows.every((row) => row.kind === "ESTIMATE" && row.liveCall === false)).toBe(
      true
    );
    expect(rows.every((row) => row.latencyMs === "N/A")).toBe(true);
    const deterministic = rows.filter((row) => row.model === "deterministic");
    expect(deterministic.every((row) => row.score.formatOk)).toBe(true);
    expect(deterministic.every((row) => row.apiCostUsdEst === 0)).toBe(true);
  });

  it("uses the char/4 heuristic and official list prices", () => {
    expect(estimateTokensFromChars("abcd")).toBe(1);
    expect(estimateTokensFromChars("abcdefgh")).toBe(2);
    const lite = listPriceUsd("gemini-3.5-flash-lite", 2000, 400);
    const mini = listPriceUsd("ministral-3b-2512", 2000, 400);
    const luna = listPriceUsd("gpt-6-luna", 2000, 400);
    expect(lite).toBeCloseTo(0.0016, 8);
    expect(mini).toBeCloseTo(0.00024, 8);
    expect(luna).toBeCloseTo(0.0004, 8);
    expect(mini).toBeLessThan(luna);
    expect(luna).toBeLessThan(lite);
  });

  it("recommends a structured lowest-cost model per task", () => {
    const picks = recommendModelPerTask(runDeterministicBenchmark());
    expect(picks.simple_explanation).toBe("ministral-3b-2512");
    expect(picks.story).toBe("ministral-3b-2512");
    expect(picks.mcq).toBe("gemini-3.5-flash-lite");
    expect(picks.structured_flowchart).toBe("gemini-3.5-flash-lite");
  });

  it("projects monthly cost for 100 / 1k / 10k students", () => {
    for (const students of [100, 1000, 10000]) {
      for (const intensity of ["light", "moderate", "heavy"] as const) {
        for (const model of PROJECT_MODELS_LOCAL) {
          const row = projectMonthlyCost({ students, intensity, model });
          expect(row.billableCalls).toBeGreaterThan(0);
          expect(row.usd).toBeGreaterThan(0);
          expect(row.inr).toBeGreaterThan(row.usd);
        }
      }
    }
    const light100Mini = projectMonthlyCost({
      students: 100,
      intensity: "light",
      model: "ministral-3b-2512",
    });
    expect(light100Mini.billableCalls).toBe(30_000);
    expect(light100Mini.usd).toBeCloseTo(7.2, 6);
  });
});

describe("controlled benchmark gate (no paid calls)", () => {
  const envNames = [
    "ORYZEN_LIVE_BENCHMARK",
    "GEMINI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "OPENAI_API_KEY",
    "MISTRAL_API_KEY",
    "AI_GATEWAY_API_KEY",
  ] as const;

  function restore(previous: Record<string, string | undefined>) {
    for (const name of envNames) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  function snapshot(): Record<string, string | undefined> {
    const previous: Record<string, string | undefined> = {};
    for (const name of envNames) previous[name] = process.env[name];
    return previous;
  }

  it("defaults to dry-run: 36 planned estimates, $0 spent, liveCall false", async () => {
    const previous = snapshot();
    process.env.ORYZEN_LIVE_BENCHMARK = "";
    process.env.GEMINI_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.MISTRAL_API_KEY = "";
    process.env.AI_GATEWAY_API_KEY = "";
    const fetchImpl = vi.fn();
    try {
      const report = await runControlledBenchmark({ fetchImpl });
      expect(report.mode).toBe("dry_run");
      expect(report.liveCall).toBe(false);
      expect(report.spentUsd).toBe(0);
      expect(report.plannedCalls).toBe(36);
      expect(report.maxCalls).toBe(48);
      expect(report.reservedRetries).toBe(12);
      expect(report.hardCapUsd).toBe(2);
      expect(report.calls).toHaveLength(36);
      expect(report.calls.every((row) => row.kind === "ESTIMATE" && row.liveCall === false)).toBe(
        true
      );
      expect(report.maxExposureUsd).toBeLessThanOrEqual(2);
      expect(report.estimatedUsd + report.reservedRetryBudgetUsd).toBeLessThan(2);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(Object.keys(report.evalCriteria)).toHaveLength(6);
    } finally {
      restore(previous);
    }
  });

  it("refuses live mode unless ORYZEN_LIVE_BENCHMARK=1 and a key is present", async () => {
    const previous = snapshot();
    const fetchImpl = vi.fn();
    try {
      process.env.ORYZEN_LIVE_BENCHMARK = "";
      process.env.GEMINI_API_KEY = "sk-test";
      const withoutFlag = await runControlledBenchmark({ mode: "live", fetchImpl });
      expect(withoutFlag.mode).toBe("refused_live");
      expect(withoutFlag.liveCall).toBe(false);
      expect(withoutFlag.spentUsd).toBe(0);
      expect(fetchImpl).not.toHaveBeenCalled();

      process.env.ORYZEN_LIVE_BENCHMARK = "1";
      process.env.GEMINI_API_KEY = "";
      process.env.OPENAI_API_KEY = "";
      process.env.MISTRAL_API_KEY = "";
      process.env.AI_GATEWAY_API_KEY = "";
      const withoutKey = await runControlledBenchmark({ mode: "live", fetchImpl });
      expect(withoutKey.mode).toBe("refused_live");
      expect(withoutKey.spentUsd).toBe(0);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restore(previous);
    }
  });

  it("enforces the $2 hard cap and 48-call ceiling before each attempt", () => {
    const overCalls = canAffordControlledBenchmarkCall(
      { spentUsd: 0, callsMade: 48, reservedRetrySlots: 0 },
      0.0004
    );
    expect(overCalls).toEqual({ ok: false, reason: "max_calls" });

    const overCap = canAffordControlledBenchmarkCall(
      { spentUsd: 1.999, callsMade: 1, reservedRetrySlots: 12 },
      0.01
    );
    expect(overCap.ok).toBe(false);
    expect(overCap.reason).toBe("hard_cap");

    const ok = canAffordControlledBenchmarkCall(
      { spentUsd: 0, callsMade: 0, reservedRetrySlots: 12 },
      0.0004
    );
    expect(ok.ok).toBe(true);
  });
});

describe("Gemini educational 18+6 plan (no paid calls)", () => {
  const envNames = [
    "ORYZEN_LIVE_BENCHMARK",
    "GEMINI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "OPENAI_API_KEY",
    "MISTRAL_API_KEY",
    "AI_GATEWAY_API_KEY",
  ] as const;

  function restore(previous: Record<string, string | undefined>) {
    for (const name of envNames) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  function snapshot(): Record<string, string | undefined> {
    const previous: Record<string, string | undefined> = {};
    for (const name of envNames) previous[name] = process.env[name];
    return previous;
  }

  it("dry-runs 18 Gemini-only estimates under the $2 cap", async () => {
    const previous = snapshot();
    process.env.ORYZEN_LIVE_BENCHMARK = "";
    process.env.GEMINI_API_KEY = "";
    const fetchImpl = vi.fn();
    try {
      const report = await runGeminiEducationalBenchmark({ fetchImpl });
      expect(report.mode).toBe("dry_run");
      expect(report.liveCall).toBe(false);
      expect(report.spentUsd).toBe(0);
      expect(report.plannedCalls).toBe(GEMINI_EDU_PLANNED_CALLS);
      expect(report.maxCalls).toBe(GEMINI_EDU_MAX_CALLS);
      expect(report.reservedRetries).toBe(GEMINI_EDU_RESERVED_RETRIES);
      expect(report.hardCapUsd).toBe(GEMINI_EDU_HARD_CAP_USD);
      expect(report.model).toBe("gemini-3.5-flash-lite");
      expect(report.calls).toHaveLength(18);
      expect(report.calls.every((row) => row.kind === "ESTIMATE" && row.model === "gemini-3.5-flash-lite")).toBe(
        true
      );
      expect(report.maxExposureUsd).toBeLessThanOrEqual(2);
      expect(report.estimatedUsd + report.reservedRetryBudgetUsd).toBeLessThan(0.15);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(Object.keys(report.evalCriteria)).toHaveLength(9);
    } finally {
      restore(previous);
    }
  });

  it("refuses live Gemini until the flag and a Google key are both present", async () => {
    const previous = snapshot();
    const fetchImpl = vi.fn();
    try {
      process.env.ORYZEN_LIVE_BENCHMARK = "";
      process.env.GEMINI_API_KEY = "sk-test";
      const withoutFlag = await runGeminiEducationalBenchmark({ mode: "live", fetchImpl });
      expect(withoutFlag.mode).toBe("refused_live");
      expect(withoutFlag.liveCall).toBe(false);
      expect(withoutFlag.spentUsd).toBe(0);
      expect(fetchImpl).not.toHaveBeenCalled();

      process.env.ORYZEN_LIVE_BENCHMARK = "1";
      process.env.GEMINI_API_KEY = "";
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "";
      const withoutKey = await runGeminiEducationalBenchmark({ mode: "live", fetchImpl });
      expect(withoutKey.mode).toBe("refused_live");
      expect(withoutKey.spentUsd).toBe(0);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restore(previous);
    }
  });

  it("reserves the conservative ceiling before each call and retry", () => {
    const conservative = geminiEduConservativeUsd();
    expect(conservative).toBeGreaterThan(0.001);
    expect(conservative).toBeLessThan(0.005);

    const overCalls = canAffordGeminiEducationalCall(
      { spentUsd: 0, callsMade: 24, reservedRetrySlots: 0 },
      conservative
    );
    expect(overCalls).toEqual({ ok: false, reason: "max_calls" });

    const overCap = canAffordGeminiEducationalCall(
      { spentUsd: 1.999, callsMade: 1, reservedRetrySlots: 6 },
      conservative
    );
    expect(overCap).toEqual({ ok: false, reason: "hard_cap" });

    const uncertain = canAffordGeminiEducationalCall(
      { spentUsd: 0, callsMade: 0, reservedRetrySlots: 6 },
      Number.NaN
    );
    expect(uncertain).toEqual({ ok: false, reason: "uncertain_token_accounting" });

    const ok = canAffordGeminiEducationalCall(
      { spentUsd: 0, callsMade: 0, reservedRetrySlots: 6 },
      conservative
    );
    expect(ok.ok).toBe(true);
  });

  it("prepares a focused quality retest estimate without authorizing live spend", () => {
    const estimate = estimateGeminiQualityRetestUsd();
    expect(estimate.plannedCalls).toBe(8);
    expect(estimate.reservedRetries).toBe(2);
    expect(estimate.liveAuthorized).toBe(false);
    expect(estimate.maxUsdIfRetriesFire).toBeLessThan(0.04);
    expect(estimate.maxUsdIfRetriesFire).toBeGreaterThan(0.02);
    expect(estimate.hardCapUsd).toBe(2);
    expect(estimate.priorLedgerUsd).toBe(GEMINI_PRIOR_LEDGER_USD);
    expect(estimate.fitsRemainingAuthorization).toBe(true);
    expect(estimate.projectedCumulativeUsd).toBeLessThan(0.13);
    expect(estimate.billingClass).toBe("paid_standard");
    expect(estimate.officialId).toBe("gemini-3.5-flash-lite");
  });

  it("scores 18 mocked live successes without calling Google", async () => {
    const executeLive = vi.fn(async (item: { mode: string; domain: string }) => {
      const fixture = DOMAIN_FIXTURES.find((row) => row.domain === item.domain);
      if (!fixture) throw new Error("missing fixture");
      const payload = composeDeterministicLensPayload({
        request: {
          documentId: `fixture-${fixture.domain}`,
          pageNumber: 1,
          sectionHeading: fixture.title,
          selectedText: fixture.passage,
          lensType:
            item.mode === "story"
              ? "story"
              : item.mode === "test_me"
                ? "test_me"
                : item.mode === "revise"
                  ? "high_yield_revision"
                  : item.mode.startsWith("illustrate")
                    ? "illustrative"
                    : item.mode === "ask_my_book"
                      ? "ask_my_book"
                      : "explain",
          studentQuestion:
            item.mode === "ask_my_book"
              ? `What does this page claim about ${fixture.title}?`
              : undefined,
        },
        ragChunks: [
          {
            chunk_id: `${fixture.domain}-1`,
            document_id: `fixture-${fixture.domain}`,
            page_number: 1,
            section_heading: fixture.title,
            text: fixture.passage,
            bounding_box: { x: 40, y: 80, width: 400, height: 24 },
            token_estimate: 40,
          },
        ],
      });
      return {
        payload,
        promptTokens: 120,
        completionTokens: 80,
        errorClass: null,
      };
    });
    const fetchImpl = vi.fn();
    const report = await runGeminiEducationalBenchmark({
      mode: "live",
      fetchImpl,
      executeLive,
    });
    expect(report.mode).toBe("live");
    expect(report.calls.filter((row) => row.kind === "LIVE")).toHaveLength(18);
    expect(report.spentUsd).toBeGreaterThan(0);
    expect(report.spentUsd).toBeLessThan(0.02);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(executeLive).toHaveBeenCalledTimes(18);
  });

  it("stops the live run when the first call omits token counts", async () => {
    const executeLive = vi.fn(async () => ({
      payload: { markdown_body: "missing tokens", key_points: [], citations: [], lens_type: "explain" as const, prakriti_dosha: "Vata" as const, title: "x" },
      errorClass: null,
    }));
    const report = await runGeminiEducationalBenchmark({
      mode: "live",
      executeLive,
    });
    expect(report.stoppedByUncertainty).toBe(true);
    expect(report.stopReason).toBe("uncertain_token_accounting");
    expect(report.spentUsd).toBe(0);
    expect(executeLive).toHaveBeenCalledTimes(1);
    expect(report.calls.some((row) => row.blockedReason === "uncertain_token_accounting")).toBe(
      true
    );
  });

  it("uses one reserved retry after a mocked eval failure", async () => {
    let calls = 0;
    const executeLive = vi.fn(async (item: { domain: string }) => {
      calls += 1;
      const fixture = DOMAIN_FIXTURES.find((row) => row.domain === item.domain);
      const empty = {
        lens_type: "explain" as const,
        prakriti_dosha: "Vata" as const,
        title: fixture?.title ?? "x",
        markdown_body: "short",
        key_points: [],
        citations: [],
      };
      if (calls === 1) {
        return { payload: empty, promptTokens: 100, completionTokens: 40, errorClass: "timeout" };
      }
      const payload = composeDeterministicLensPayload({
        request: {
          documentId: `fixture-${fixture?.domain}`,
          pageNumber: 1,
          sectionHeading: fixture?.title ?? "x",
          selectedText: fixture?.passage ?? "x",
          lensType: "explain",
        },
        ragChunks: [
          {
            chunk_id: "retry-1",
            document_id: `fixture-${fixture?.domain}`,
            page_number: 1,
            section_heading: fixture?.title ?? "x",
            text: fixture?.passage ?? "x",
            bounding_box: { x: 40, y: 80, width: 400, height: 24 },
            token_estimate: 40,
          },
        ],
      });
      return { payload, promptTokens: 110, completionTokens: 70, errorClass: null };
    });
    const report = await runGeminiEducationalBenchmark({
      mode: "live",
      executeLive,
    });
    expect(report.calls[0]?.blockedReason).toBe("timeout");
    expect(report.calls[1]?.blockedReason).toBe("retry");
    expect(report.calls[1]?.reservedRetryUsd).toBeLessThan(report.calls[0]?.reservedRetryUsd ?? 1);
    expect(executeLive.mock.calls.length).toBeGreaterThan(18);
  });

  it("stops if a reserved retry omits token counts", async () => {
    let calls = 0;
    const executeLive = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          payload: {
            lens_type: "explain" as const,
            prakriti_dosha: "Vata" as const,
            title: "x",
            markdown_body: "short",
            key_points: [],
            citations: [],
          },
          promptTokens: 90,
          completionTokens: 20,
          errorClass: "unusable_output",
        };
      }
      if (calls === 2) {
        return {
          payload: {
            lens_type: "explain" as const,
            prakriti_dosha: "Vata" as const,
            title: "x",
            markdown_body: "retry without tokens",
            key_points: [],
            citations: [],
          },
          errorClass: null,
        };
      }
      return {
        payload: {
          lens_type: "explain" as const,
          prakriti_dosha: "Vata" as const,
          title: "x",
          markdown_body: "should not run",
          key_points: [],
          citations: [],
        },
        promptTokens: 10,
        completionTokens: 10,
        errorClass: null,
      };
    });
    const report = await runGeminiEducationalBenchmark({
      mode: "live",
      executeLive,
    });
    expect(report.stoppedByUncertainty).toBe(true);
    expect(report.stopReason).toBe("uncertain_token_accounting");
    expect(executeLive).toHaveBeenCalledTimes(2);
    expect(report.calls.filter((row) => row.kind === "LIVE")).toHaveLength(1);
  });

  it("refuses the next planned live call after a mocked overspend", async () => {
    const executeLive = vi.fn(async () => ({
      payload: {
        lens_type: "explain" as const,
        prakriti_dosha: "Vata" as const,
        title: "x",
        markdown_body: "overspend",
        key_points: [],
        citations: [],
      },
      promptTokens: 2_000_000,
      completionTokens: 400_000,
      errorClass: "timeout",
    }));
    const report = await runGeminiEducationalBenchmark({
      mode: "live",
      executeLive,
    });
    expect(report.spentUsd).toBeGreaterThan(1);
    expect(report.calls.some((row) => row.kind === "REFUSED" && row.blockedReason === "hard_cap")).toBe(
      true
    );
    expect(report.stoppedByCap).toBe(true);
    expect(executeLive.mock.calls.length).toBeLessThan(18);
  });

  it("records a mocked quota failure without opening a real provider fetch", async () => {
    const fetchImpl = vi.fn();
    const executeLive = vi.fn(async () => ({
      payload: {
        lens_type: "explain" as const,
        prakriti_dosha: "Vata" as const,
        title: "x",
        markdown_body: "quota",
        key_points: [],
        citations: [],
      },
      promptTokens: 80,
      completionTokens: 20,
      errorClass: "quota",
    }));
    const report = await runGeminiEducationalBenchmark({
      mode: "live",
      fetchImpl,
      executeLive,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(report.calls[0]?.blockedReason).toBe("quota");
    expect(report.calls.every((row) => row.model === "gemini-3.5-flash-lite")).toBe(true);
  });
});

describe("gemini quality retest (no paid calls)", () => {
  const envNames = [
    "ORYZEN_LIVE_BENCHMARK",
    "GEMINI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "OPENAI_API_KEY",
    "MISTRAL_API_KEY",
    "AI_GATEWAY_API_KEY",
  ] as const;

  function restore(previous: Record<string, string | undefined>) {
    for (const name of envNames) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  function snapshot(): Record<string, string | undefined> {
    const previous: Record<string, string | undefined> = {};
    for (const name of envNames) previous[name] = process.env[name];
    return previous;
  }

  it("seeds the $2 ledger and refuses a call that would breach the remaining cap", () => {
    const conservative = geminiEduConservativeUsd();
    const ok = canAffordGeminiQualityRetestCall(
      {
        spentUsd: GEMINI_PRIOR_LEDGER_USD,
        callsMade: 0,
        reservedRetrySlots: 2,
      },
      conservative
    );
    expect(ok.ok).toBe(true);

    const overCap = canAffordGeminiQualityRetestCall(
      { spentUsd: 1.999, callsMade: 0, reservedRetrySlots: 2 },
      conservative
    );
    expect(overCap).toEqual({ ok: false, reason: "hard_cap" });

    const overCalls = canAffordGeminiQualityRetestCall(
      { spentUsd: GEMINI_PRIOR_LEDGER_USD, callsMade: GEMINI_QUALITY_RETEST_MAX_CALLS, reservedRetrySlots: 0 },
      conservative
    );
    expect(overCalls).toEqual({ ok: false, reason: "max_calls" });
  });

  it("scores deterministic linear teaching as educationally usable", () => {
    const math = DOMAIN_FIXTURES.find((row) => row.domain === "mathematics");
    const science = DOMAIN_FIXTURES.find((row) => row.domain === "science");
    if (!math || !science) throw new Error("missing fixture");
    const explain = composeDeterministicLensPayload({
      request: {
        documentId: "fixture-mathematics",
        pageNumber: 1,
        sectionHeading: math.title,
        selectedText: math.passage,
        lensType: "explain",
      },
      ragChunks: [],
    });
    expect(scoreQualityRetestCase("explain_simple", math, explain).pass).toBe(true);
    expect(scoreQualityRetestCase("explain_standard", math, explain).pass).toBe(true);
    expect(scoreQualityRetestCase("explain_deeper", math, explain).pass).toBe(true);

    const story = composeDeterministicLensPayload({
      request: {
        documentId: "fixture-mathematics",
        pageNumber: 1,
        sectionHeading: math.title,
        selectedText: math.passage,
        lensType: "story",
      },
      ragChunks: [],
    });
    expect(scoreQualityRetestCase("story", math, story).pass).toBe(true);

    const askHit = composeDeterministicLensPayload({
      request: {
        documentId: "fixture-mathematics",
        pageNumber: 1,
        sectionHeading: math.title,
        selectedText: math.passage,
        lensType: "ask_my_book",
        studentQuestion: "How do you solve ax + b = 0 for x?",
      },
      ragChunks: [],
    });
    expect(scoreQualityRetestCase("ask_my_book_supported", math, askHit).pass).toBe(true);

    const askMiss = composeDeterministicLensPayload({
      request: {
        documentId: "fixture-mathematics",
        pageNumber: 1,
        sectionHeading: math.title,
        selectedText: math.passage,
        lensType: "ask_my_book",
        studentQuestion: "What is the quadratic formula for ax² + bx + c = 0?",
      },
      ragChunks: [],
    });
    expect(scoreQualityRetestCase("ask_my_book_unsupported", math, askMiss).pass).toBe(true);
  });

  it("defaults to dry-run with prior ledger and no provider fetch", async () => {
    const previous = snapshot();
    const fetchImpl = vi.fn();
    try {
      process.env.ORYZEN_LIVE_BENCHMARK = "";
      process.env.GEMINI_API_KEY = "";
      const report = await runGeminiQualityRetest({ fetchImpl });
      expect(report.mode).toBe("dry_run");
      expect(report.liveCall).toBe(false);
      expect(report.calls).toHaveLength(8);
      expect(report.runSpentUsd).toBe(0);
      expect(report.priorLedgerUsd).toBe(GEMINI_PRIOR_LEDGER_USD);
      expect(report.cumulativeUsd).toBe(GEMINI_PRIOR_LEDGER_USD);
      expect(report.fitsRemainingAuthorization).toBe(true);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restore(previous);
    }
  });

  it("refuses live mode unless the flag and Google key are present", async () => {
    const previous = snapshot();
    const fetchImpl = vi.fn();
    try {
      process.env.ORYZEN_LIVE_BENCHMARK = "";
      process.env.GEMINI_API_KEY = "sk-test";
      const withoutFlag = await runGeminiQualityRetest({ mode: "live", fetchImpl });
      expect(withoutFlag.mode).toBe("refused_live");
      expect(withoutFlag.liveCall).toBe(false);
      expect(withoutFlag.runSpentUsd).toBe(0);
      expect(fetchImpl).not.toHaveBeenCalled();

      process.env.ORYZEN_LIVE_BENCHMARK = "1";
      process.env.GEMINI_API_KEY = "";
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "";
      const withoutKey = await runGeminiQualityRetest({ mode: "live", fetchImpl });
      expect(withoutKey.mode).toBe("refused_live");
      expect(withoutKey.runSpentUsd).toBe(0);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restore(previous);
    }
  });

  it("does not count a fallback as a Gemini educational pass", async () => {
    const fetchImpl = vi.fn();
    const executeLive = vi.fn(async () => ({
      payload: {
        lens_type: "explain" as const,
        prakriti_dosha: "Vata" as const,
        title: "fallback",
        markdown_body: "This page is about a claim. Hold one clear claim.",
        key_points: [],
        citations: [],
        used_fallback: true,
      },
      promptTokens: 80,
      completionTokens: 20,
      errorClass: null,
      modelUsed: "deterministic",
      providerUsed: "deterministic",
      usedDeterministicFallback: true,
    }));
    const report = await runGeminiQualityRetest({
      mode: "live",
      fetchImpl,
      executeLive,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(report.calls.some((row) => row.disposition === "fallback")).toBe(true);
    expect(report.calls.filter((row) => row.kind === "LIVE").every((row) => row.educationalPass === false)).toBe(
      true
    );
  });

  it("scores eight mocked live successes without calling Google", async () => {
    const executeLive = vi.fn(async (item: { mode: string; domain: string }) => {
      const fixture = DOMAIN_FIXTURES.find((row) => row.domain === item.domain);
      if (!fixture) throw new Error("missing fixture");
      const payload = composeDeterministicLensPayload({
        request: {
          documentId: `fixture-${fixture.domain}`,
          pageNumber: 1,
          sectionHeading: fixture.title,
          selectedText: fixture.passage,
          lensType: item.mode.startsWith("ask_my_book")
            ? "ask_my_book"
            : item.mode === "story"
              ? "story"
              : item.mode === "test_me"
                ? "test_me"
                : "explain",
          studentQuestion: item.mode.startsWith("ask_my_book")
            ? item.mode.includes("unsupported")
              ? "What is the quadratic formula for ax² + bx + c = 0?"
              : "How do you solve ax + b = 0 for x?"
            : undefined,
        },
        ragChunks: [
          {
            chunk_id: `${fixture.domain}-1`,
            document_id: `fixture-${fixture.domain}`,
            page_number: 1,
            section_heading: fixture.title,
            text: fixture.passage,
            bounding_box: { x: 40, y: 80, width: 400, height: 24 },
            token_estimate: 40,
          },
        ],
      });
      if (payload.explain) {
        payload.explain.simpleExplanation = `${payload.explain.simpleExplanation} Keep a as the coefficient.`;
        payload.explain.standardExplanation = `${payload.explain.standardExplanation} Verify on the page.`;
        payload.explain.deeperExplanation = `${payload.explain.deeperExplanation} The misconception is swapping the sign.`;
      }
      if (payload.story) {
        payload.story.close = `${payload.story.close} She isolated x.`;
      }
      if (payload.askMyBook) {
        payload.askMyBook.answer = `${payload.askMyBook.answer} Stay inside the excerpt.`;
      }
      if (payload.mcqs?.[0]) {
        payload.mcqs[0] = {
          ...payload.mcqs[0],
          explanation: `${payload.mcqs[0].explanation} Grounded in the excerpt.`,
        };
      }
      return {
        payload: { ...payload, used_fallback: false },
        promptTokens: 140,
        completionTokens: 90,
        errorClass: null,
        modelUsed: "gemini-3.5-flash-lite",
        providerUsed: "google",
        usedDeterministicFallback: false,
      };
    });
    const fetchImpl = vi.fn();
    const report = await runGeminiQualityRetest({
      mode: "live",
      fetchImpl,
      executeLive,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(report.mode).toBe("live");
    expect(report.calls.filter((row) => row.kind === "LIVE")).toHaveLength(8);
    expect(report.passCount).toBe(8);
    expect(report.fallbackCount).toBe(0);
    expect(report.runSpentUsd).toBeGreaterThan(0);
    expect(report.cumulativeUsd).toBeGreaterThan(GEMINI_PRIOR_LEDGER_USD);
    expect(report.remainingUsd).toBeLessThan(2);
    expect(report.remainingUsd).toBeGreaterThan(1.8);
  });
});
