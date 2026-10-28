import { describe, expect, it } from "vitest";
import {
  EMPTY_STUDY_PROGRESS,
  studyProgressIsEmpty,
  studyProgressLines,
  type StudyProgressFacts,
} from "../snapshot";

describe("Study Progress", () => {
  it("stays empty when nothing has been recorded", () => {
    expect(studyProgressIsEmpty(EMPTY_STUDY_PROGRESS)).toBe(true);
    expect(studyProgressLines(EMPTY_STUDY_PROGRESS)).toEqual([]);
  });

  it("reports only the activity that was supplied", () => {
    const facts: StudyProgressFacts = {
      ...EMPTY_STUDY_PROGRESS,
      books: ["Work and Energy"],
      todayMinutes: 25,
      dailyGoalMinutes: 90,
      completedSprints: 1,
      highlightCount: 2,
      quizzesCompleted: 1,
      weakConcepts: ["net force"],
      planCompleted: 0,
      planTotal: 4,
      examDate: "2026-11-20",
    };
    const lines = studyProgressLines(facts);
    expect(lines.join(" ")).toMatch(/Work and Energy/);
    expect(lines.join(" ")).toMatch(/25 of 90 minutes/);
    expect(lines.join(" ")).toMatch(/1 Study Sprint marked complete/);
    expect(lines.join(" ")).toMatch(/2 highlights saved/);
    expect(lines.join(" ")).toMatch(/1 quiz completed/);
    expect(lines.join(" ")).toMatch(/net force/);
    expect(lines.join(" ")).toMatch(/No work sessions are marked complete/);
    expect(lines.join(" ")).toMatch(/2026-11-20/);
    expect(lines.join(" ")).not.toMatch(/streak|score|rank/i);
  });

  it("does not turn a saved sprint with zero minutes into completed study", () => {
    const lines = studyProgressLines({
      ...EMPTY_STUDY_PROGRESS,
      sprintCount: 1,
      todayMinutes: 0,
    });
    expect(lines).toEqual(["A Study Sprint is saved. No focused minutes are recorded today."]);
  });
});
