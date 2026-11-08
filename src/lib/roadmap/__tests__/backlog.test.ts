import { describe, expect, it } from "vitest";
import { backlogItems, backlogSummary } from "../engine";
import type { RoadmapPlan, RoadmapSession } from "../types";

const session = (id: string, date: string, chapterId: string, minutes = 30, kind: RoadmapSession["kind"] = "study"): RoadmapSession => ({
  id, date, startMinutes: 0, endMinutes: minutes, minutes, kind,
  subjectId: "phy", subjectName: "Physics", chapterId, chapterName: `Chapter ${chapterId}`, title: `Read ${chapterId}`,
});

const plan = {
  days: [
    { date: "2026-11-05", kind: "study", availableStudyMinutes: 120, sessions: [session("a", "2026-11-05", "1"), session("b", "2026-11-05", "2"), session("br", "2026-11-05", "x", 5, "break")] },
    { date: "2026-11-06", kind: "study", availableStudyMinutes: 120, sessions: [session("c", "2026-11-06", "1", 45)] },
    { date: "2026-11-08", kind: "study", availableStudyMinutes: 120, sessions: [session("d", "2026-11-08", "3")] },
  ],
} as unknown as RoadmapPlan;

describe("backlog", () => {
  it("groups unticked past sessions by topic, oldest first, ignoring breaks and today", () => {
    const items = backlogItems(plan, { b: { completedAt: "x" } }, "2026-11-08");
    expect(items.map((i) => i.title)).toEqual(["Chapter 1"]);
    expect(items[0]).toMatchObject({ sessionIds: ["a", "c"], minutes: 75, oldestDate: "2026-11-05", subjectName: "Physics" });
    expect(backlogSummary(items)).toEqual({ topics: 1, minutes: 75 });
  });

  it("is empty when everything past is ticked", () => {
    expect(backlogItems(plan, { a: { completedAt: "x" }, b: { completedAt: "x" }, c: { completedAt: "x" } }, "2026-11-08")).toEqual([]);
  });
});
