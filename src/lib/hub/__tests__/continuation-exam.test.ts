import { describe, expect, it } from "vitest";
import { describeHomeContinuation } from "../continuation";
import { buildQuickIntake } from "@/lib/onboarding/first-run";
import { buildRoadmapPlan } from "@/lib/roadmap/engine";
import type { RoadmapRecord } from "@/lib/roadmap/types";

function recordFor(intake: RoadmapRecord["intake"]): RoadmapRecord {
  return { intake, plan: buildRoadmapPlan(intake, "2026-11-08"), completions: {}, updatedAt: "2026-11-08T00:00:00Z" } as RoadmapRecord;
}

describe("exam countdown on Today", () => {
  it("knows when the student only picked the exam month, and drops that once they set a real date", () => {
    const intake = buildQuickIntake({ exam: "neet", subjects: ["Physics"], examMonth: "2027-05" });
    const base = { sessions: [], dailyTargetMinutes: 120, dayGoalMinutes: null, bookTitle: null, date: "2026-11-08", nextBlockHint: null };
    expect(describeHomeContinuation({ ...base, roadmap: recordFor(intake) }).exam).toMatchObject({ month: "2027-05", date: "2027-05-01" });
    const exact = describeHomeContinuation({ ...base, roadmap: recordFor({ ...intake, examDate: "2027-05-02" }) }).exam;
    expect(exact).toMatchObject({ date: "2027-05-02" });
    expect(exact?.month).toBeUndefined();
  });
});
