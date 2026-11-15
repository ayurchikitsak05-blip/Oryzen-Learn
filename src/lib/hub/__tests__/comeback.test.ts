import { describe, expect, it } from "vitest";
import { checkInToday, comebackMessage, daysMissed, LAST_VISIT_KEY } from "../comeback";

function memory() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
}

describe("welcome back after missed days", () => {
  it("counts whole days missed", () => {
    expect(daysMissed("2026-11-14", "2026-11-15")).toBe(0);
    expect(daysMissed("2026-11-15", "2026-11-15")).toBe(0);
    expect(daysMissed("2026-11-12", "2026-11-15")).toBe(2);
    expect(daysMissed(null, "2026-11-15")).toBe(0);
    expect(daysMissed("junk", "2026-11-15")).toBe(0);
  });

  it("nudges from 2 missed days, gently after a week", () => {
    expect(comebackMessage(1)).toBeNull();
    expect(comebackMessage(2)?.title).toBe("Welcome back. You missed 2 days.");
    expect(comebackMessage(9)?.title).toMatch(/restart gently/);
  });

  it("remembers the last visit per student and only the date", () => {
    const storage = memory();
    expect(checkInToday("u1", "2026-11-10", storage)).toBe(0);
    expect(checkInToday("u1", "2026-11-15", storage)).toBe(4);
    expect(checkInToday("u2", "2026-11-20", storage)).toBe(0);
    expect(JSON.parse(storage.data.get(LAST_VISIT_KEY) ?? "{}")).toEqual({ owner: "u2", day: "2026-11-20" });
  });
});
