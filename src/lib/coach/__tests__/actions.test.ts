import { describe, expect, it } from "vitest";
import { defaultIntake } from "@/lib/roadmap/defaults";
import { buildRoadmapPlan, workSessions } from "@/lib/roadmap/engine";
import type { RoadmapRecord } from "@/lib/roadmap/types";
import {
  COACH_ACTION_HANDLERS,
  actionHref,
  firstIncompleteSession,
  previewSimplifyToday,
} from "../actions";
import { COACH_ACTIONS } from "../types";

const TODAY = "2026-11-02";

function record(): RoadmapRecord {
  const intake = defaultIntake("2027-01-01");
  return {
    version: 1,
    id: "roadmap-coach-test",
    userId: "user-test",
    intake,
    plan: buildRoadmapPlan(intake, TODAY),
    completions: {},
    updatedAt: `${TODAY}T00:00:00.000Z`,
  };
}

describe("coach actions", () => {
  it("exposes a handler for every action id", () => {
    expect(Object.keys(COACH_ACTION_HANDLERS).sort()).toEqual([...COACH_ACTIONS].sort());
  });

  it("start studying points at a real reader or roadmap href", () => {
    const next = record();
    const session = firstIncompleteSession(next, TODAY);
    expect(session).toBeTruthy();
    const href = actionHref("start_studying", next, TODAY);
    expect(href).toMatch(/^\/(reader|roadmap)/);
  });

  it("simplify keeps one or two priority sessions and moves extras later", () => {
    const next = record();
    const before = workSessions(next.plan.days[0].sessions);
    const result = previewSimplifyToday(next, TODAY);
    expect(result.kept.length).toBeGreaterThan(0);
    expect(result.kept.length).toBeLessThanOrEqual(2);
    if (before.length > 2) {
      expect(result.moved.length).toBeGreaterThan(0);
      expect(result.record).not.toBe(next);
    }
    expect(result.summary.toLowerCase()).not.toMatch(/wasted|lazy|behind/);
  });

  it("replan and revise actions stay on in-app routes", () => {
    const next = record();
    expect(actionHref("replan", next, TODAY)).toBe("/roadmap");
    expect(actionHref("revise_weak", next, TODAY)).toContain("/reader");
    expect(actionHref("continue_roadmap", next, TODAY)).toBe("/roadmap");
    expect(actionHref("take_break", next, TODAY)).toBeNull();
  });
});
