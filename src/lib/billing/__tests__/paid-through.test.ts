import { describe, expect, it } from "vitest";
import { paidThrough, proUntilFor, PRO_GRACE_DAYS } from "../subscription";

describe("paidThrough", () => {
  it("is the Razorpay charge date: pro_until without the grace days", () => {
    const end = Date.UTC(2026, 11, 22, 0, 0, 0) / 1000;
    const proUntil = proUntilFor({ current_end: end }, new Date(Date.UTC(2026, 10, 22))).toISOString();
    expect(paidThrough(proUntil)).toBe(new Date(end * 1000).toISOString());
    expect(PRO_GRACE_DAYS).toBe(2);
  });
  it("is empty without a date", () => {
    expect(paidThrough(null)).toBeNull();
    expect(paidThrough("not a date")).toBeNull();
  });
});
