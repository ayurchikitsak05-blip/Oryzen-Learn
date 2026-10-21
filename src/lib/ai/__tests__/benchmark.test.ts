import { describe, expect, it } from "vitest";
import {
  DOMAIN_FIXTURES,
  recommendModelPerTask,
  runDeterministicBenchmark,
} from "../benchmark";
import { estimateTokensFromChars, listPriceUsd, projectMonthlyCost } from "../models";

const PROJECT_MODELS_LOCAL = [
  "gemini-2.5-flash-lite",
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
    const lite = listPriceUsd("gemini-2.5-flash-lite", 2000, 400);
    const mini = listPriceUsd("ministral-3b-2512", 2000, 400);
    const luna = listPriceUsd("gpt-6-luna", 2000, 400);
    expect(lite).toBeCloseTo(0.00036, 8);
    expect(mini).toBeCloseTo(0.00024, 8);
    expect(luna).toBeCloseTo(0.0004, 8);
    expect(mini).toBeLessThan(lite);
    expect(lite).toBeLessThan(luna);
  });

  it("recommends a structured lowest-cost model per task", () => {
    const picks = recommendModelPerTask(runDeterministicBenchmark());
    expect(picks.simple_explanation).toBe("ministral-3b-2512");
    expect(picks.story).toBe("ministral-3b-2512");
    expect(picks.mcq).toBe("gemini-2.5-flash-lite");
    expect(picks.structured_flowchart).toBe("gemini-2.5-flash-lite");
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
