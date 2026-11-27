import { describe, expect, it } from "vitest";
import {
  STAMP_MINUTES,
  addActiveMinutes,
  currentStreak,
  minutesByDay,
  parseStudyDays,
  weekStamps,
} from "../study-days";
import type { SprintSession } from "@/lib/sprint/types";

const session = (date: string, minutes: number) => ({ date, elapsedMs: minutes * 60_000 }) as unknown as SprintSession;

describe("study days, stamps and streak", () => {
  it("adds active minutes and forgets very old days", () => {
    let days = addActiveMinutes({ "2026-01-01": 30 }, "2026-11-27", 1);
    days = addActiveMinutes(days, "2026-11-27", 1);
    expect(days).toEqual({ "2026-11-27": 2 });
  });

  it("ignores bad saved data", () => {
    expect(parseStudyDays("not json")).toEqual({});
    expect(parseStudyDays(JSON.stringify({ "2026-11-27": 12, bad: 3, "2026-11-26": -1 }))).toEqual({ "2026-11-27": 12 });
  });

  it("takes the larger of timer and reading minutes for a day (they overlap)", () => {
    const days = minutesByDay([session("2026-11-27", 25), session("2026-11-27", 5)], { "2026-11-27": 18, "2026-11-26": 12 });
    expect(days).toEqual({ "2026-11-27": 30, "2026-11-26": 12 });
  });

  it("stamps Monday to Sunday", () => {
    // 27 Nov 2026 is a Friday.
    const stamps = weekStamps("2026-11-27", {
      "2026-11-23": STAMP_MINUTES,
      "2026-11-24": 3,
      "2026-11-26": 40,
    });
    expect(stamps.map((s) => s.label).join("")).toBe("MTWTFSS");
    expect(stamps.map((s) => s.state)).toEqual(["stamped", "missed", "missed", "stamped", "today", "future", "future"]);
  });

  it("counts the streak, and keeps it until today is over", () => {
    const days = { "2026-11-24": 10, "2026-11-25": 15, "2026-11-26": 12 };
    expect(currentStreak("2026-11-27", days)).toBe(3);
    expect(currentStreak("2026-11-27", { ...days, "2026-11-27": 11 })).toBe(4);
    expect(currentStreak("2026-11-28", days)).toBe(0);
    expect(currentStreak("2026-11-27", {})).toBe(0);
  });
});
