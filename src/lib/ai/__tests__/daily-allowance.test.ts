import { describe, expect, it } from "vitest";
import {
  allowanceMessage,
  allowancePlanFor,
  allowanceStatus,
  canSpendHelp,
  helpCost,
  helpsUsed,
  helpsUsedToday,
  indiaDayStartIso,
} from "../daily-allowance";

describe("daily AI help allowance", () => {
  it("gives paid and class-sponsored students Pro, everyone else Free", () => {
    expect(allowancePlanFor("active_paid")).toBe("pro");
    expect(allowancePlanFor("class_sponsored")).toBe("pro");
    expect(allowancePlanFor("free")).toBe("free");
    expect(allowancePlanFor(null)).toBe("free");
  });

  it("counts Illustrate, Story and Ask My Book as two helps", () => {
    expect(helpCost("illustrative")).toBe(2);
    expect(helpCost("story")).toBe(2);
    expect(helpCost("ask_my_book")).toBe(2);
    expect(helpCost("explain")).toBe(1);
  });

  it("starts the day at midnight India time", () => {
    // 3 Nov 2026, 20:00 UTC = 4 Nov 01:30 IST -> day starts 3 Nov 18:30 UTC
    expect(indiaDayStartIso(new Date("2026-11-03T20:00:00Z"))).toBe("2026-11-03T18:30:00.000Z");
    // 3 Nov 2026, 10:00 UTC = 15:30 IST -> day starts 2 Nov 18:30 UTC
    expect(indiaDayStartIso(new Date("2026-11-03T10:00:00Z"))).toBe("2026-11-02T18:30:00.000Z");
  });

  it("ignores saved answers and free fallbacks when counting", () => {
    expect(
      helpsUsed([
        { lens_type: "explain", cache_hit: false, cost_inr: 0.15 },
        { lens_type: "story", cache_hit: false, cost_inr: "0.30" },
        { lens_type: "explain", cache_hit: true, cost_inr: 0 },
        { lens_type: "explain", cache_hit: false, cost_inr: 0 },
      ])
    ).toBe(3);
  });

  it("blocks a double help when only one is left", () => {
    const status = allowanceStatus("free", 4);
    expect(status.left).toBe(1);
    expect(canSpendHelp(status, "explain")).toBe(true);
    expect(canSpendHelp(status, "illustrative")).toBe(false);
    expect(allowanceStatus("free", 9).left).toBe(0);
    expect(allowanceStatus("pro", 10).limit).toBe(40);
  });

  it("explains what still works when the helps run out", () => {
    expect(allowanceMessage(allowanceStatus("free", 5))).toContain("Saved answers");
    expect(allowanceMessage(allowanceStatus("free", 5))).toContain("Pro");
  });

  it("reads today's usage and treats a database error as zero used", async () => {
    const rows = [{ lens_type: "explain", cache_hit: false, cost_inr: 0.1 }];
    const ok = {
      from: () => ({
        select: () => ({ eq: () => ({ gte: async () => ({ data: rows, error: null }) }) }),
      }),
    };
    const failing = {
      from: () => ({
        select: () => ({ eq: () => ({ gte: async () => ({ data: null, error: { message: "x" } }) }) }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await helpsUsedToday(ok as any, "u1")).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await helpsUsedToday(failing as any, "u1")).toBe(0);
    expect(await helpsUsedToday(null, "u1")).toBe(0);
  });
});
