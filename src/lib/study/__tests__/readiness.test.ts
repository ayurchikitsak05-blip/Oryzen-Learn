import { describe, expect, it } from "vitest";
import { defaultIntake } from "@/lib/roadmap/defaults";
import { buildRoadmapPlan } from "@/lib/roadmap/engine";
import { applyReplan, proposeReplan } from "@/lib/roadmap/replan";
import { prepareRoadmapRecord, sanitizeRecord } from "@/lib/roadmap/sanitize";
import type { RoadmapRecord } from "@/lib/roadmap/types";
import { describeHomeContinuation } from "@/lib/hub/continuation";
import {
  chapterLevel,
  nextStepFor,
  readinessSummary,
  sanitizeReadiness,
  stagesDone,
} from "../readiness";
import { groupInsights, insightFor, suggestedLevelFromInsights } from "../confidence";

const TODAY = "2026-11-12";

function record(): RoadmapRecord {
  const intake = defaultIntake("2027-01-11");
  intake.subjects = [
    {
      id: "phy",
      name: "Physics",
      examImportance: 5,
      chapters: [
        { id: "phy-1", name: "Optics", difficulty: 4, remainingMinutes: 120 },
        { id: "phy-2", name: "Units", difficulty: 1, remainingMinutes: 60 },
      ],
    },
    {
      id: "bio",
      name: "Biology",
      examImportance: 1,
      chapters: [{ id: "bio-1", name: "Cells", difficulty: 2, remainingMinutes: 60, completed: true }],
    },
  ];
  return {
    version: 1,
    id: "roadmap-test",
    userId: "u1",
    intake,
    plan: buildRoadmapPlan(intake, TODAY),
    completions: {},
    updatedAt: `${TODAY}T00:00:00.000Z`,
  };
}

describe("exam readiness", () => {
  it("starts at 0% with unrated chapters, counting a ticked chapter as getting there", () => {
    const summary = readinessSummary(record(), TODAY);
    expect(summary.daysLeft).toBe(60);
    expect(chapterLevel(record(), "phy-1")).toBe("not_started");
    expect(chapterLevel(record(), "bio-1", true)).toBe("getting_there");
    expect(summary.counts).toMatchObject({ not_started: 2, getting_there: 1 });
    expect(summary.percent).toBeGreaterThan(0);
    expect(summary.percent).toBeLessThan(20);
  });

  it("weights important, hard chapters more and picks the biggest gain as Do next", () => {
    const base = record();
    expect(readinessSummary(base, TODAY).doNext?.chapterName).toBe("Optics");
    const opticsReady = readinessSummary({ ...base, readiness: { "phy-1": "exam_ready" } }, TODAY);
    const cellsReady = readinessSummary({ ...base, readiness: { "bio-1": "exam_ready" } }, TODAY);
    expect(opticsReady.percent).toBeGreaterThan(cellsReady.percent);
    expect(opticsReady.doNext?.chapterName).toBe("Units");
    const allReady = readinessSummary(
      { ...base, readiness: { "phy-1": "exam_ready", "phy-2": "exam_ready", "bio-1": "exam_ready" } },
      TODAY
    );
    expect(allReady.percent).toBe(100);
    expect(allReady.doNext).toBeNull();
    expect(allReady.daysPerChapter).toBeNull();
  });

  it("gives one next step per level along Read, Test, Fix, Revise", () => {
    expect(nextStepFor("not_started").href).toBe("/reader");
    expect(nextStepFor("shaky").href).toBe("/reader?lens=test_me");
    expect(nextStepFor("getting_there").href).toBe("/revise");
    expect([stagesDone("not_started"), stagesDone("shaky"), stagesDone("getting_there"), stagesDone("exam_ready")]).toEqual([0, 2, 3, 4]);
  });

  it("keeps ratings through saving, server checks and replanning, and drops unknown or bad ones", () => {
    const rated = { ...record(), readiness: { "phy-1": "shaky", "nope": "exam_ready", "bio-1": "superb" } } as unknown as RoadmapRecord;
    expect(sanitizeRecord(rated, "u1")?.readiness).toEqual({ "phy-1": "shaky" });
    const prepared = prepareRoadmapRecord(rated, "u1");
    expect(prepared.ok && prepared.record.readiness).toEqual({ "phy-1": "shaky" });
    const clean = { ...record(), readiness: { "phy-1": "shaky" as const } };
    const replanned = applyReplan(clean, proposeReplan(clean, { today: TODAY, missedDates: [] }));
    expect(replanned.readiness).toEqual({ "phy-1": "shaky" });
    expect(sanitizeReadiness([])).toBeUndefined();
  });

  it("shows on Today only once the student has rated a chapter", () => {
    const base = { sessions: [], dailyTargetMinutes: 120, dayGoalMinutes: null, bookTitle: null, date: TODAY, nextBlockHint: null };
    expect(describeHomeContinuation({ ...base, roadmap: record() }).readiness).toBeNull();
    const rated = describeHomeContinuation({ ...base, roadmap: { ...record(), readiness: { "phy-2": "exam_ready" } } }).readiness;
    expect(rated).toMatchObject({ doNext: "Physics: Optics" });
    expect(rated?.percent).toBeGreaterThan(0);
  });
});

describe("how sure were you", () => {
  it("separates lucky guesses and confident mistakes from plain right and wrong", () => {
    expect(insightFor(true, "certain")).toBe("solid");
    expect(insightFor(true, "guess")).toBe("lucky");
    expect(insightFor(false, "fairly")).toBe("trap");
    expect(insightFor(false, "guess")).toBe("gap");
    expect(insightFor(true)).toBe("solid");
    expect(insightFor(false)).toBe("gap");
  });

  it("groups answered questions and suggests a chapter level", () => {
    const mcqs = [0, 1, 2, 3].map((i) => ({ question: `Q${i}`, correctIndex: 0 }));
    const groups = groupInsights(mcqs, { 0: 0, 1: 0, 2: 1, 3: 1 }, { 0: "certain", 1: "guess", 2: "certain", 3: "guess" });
    expect(groups).toEqual({ solid: [0], lucky: [1], trap: [2], gap: [3] });
    expect(suggestedLevelFromInsights(groups)).toBe("shaky");
    expect(suggestedLevelFromInsights({ solid: [0, 1], lucky: [], trap: [], gap: [] })).toBe("exam_ready");
    expect(suggestedLevelFromInsights({ solid: [0], lucky: [1], trap: [], gap: [] })).toBe("getting_there");
    expect(suggestedLevelFromInsights({ solid: [], lucky: [], trap: [], gap: [] })).toBeNull();
  });
});
