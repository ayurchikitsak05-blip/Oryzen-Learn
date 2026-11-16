import { describe, expect, it } from "vitest";
import { defaultIntake } from "@/lib/roadmap/defaults";
import { ownAiPrompt } from "../own-ai-prompt";
import { helpsLeftText } from "@/components/ai/AiHelpsLeft";

const TODAY = "2026-11-15";
function record() {
  const intake = defaultIntake("2026-12-15");
  intake.examName = "NEET 2027";
  intake.subjects = [
    {
      id: "phy",
      name: "Physics",
      examImportance: 5,
      chapters: [
        { id: "p1", name: "Optics", difficulty: 4, remainingMinutes: 60 },
        { id: "p2", name: "Units", difficulty: 1, remainingMinutes: 30 },
      ],
    },
  ];
  return { intake, readiness: { p2: "exam_ready" as const } };
}

describe("ask your own AI", () => {
  it("builds a plan question from the student's own ratings, with no personal details", () => {
    const text = ownAiPrompt(record(), TODAY, "plan");
    expect(text).toContain("preparing for NEET 2027, which is 30 days away");
    expect(text).toContain("- Physics: Optics: Not started");
    expect(text).toContain("- Physics: Units: Exam ready");
    expect(text).toContain("Start with Physics: Optics");
    expect(text).not.toMatch(/@|user|email/i);
  });

  it("can ask for a quiz on the weakest chapter instead", () => {
    expect(ownAiPrompt(record(), TODAY, "quiz")).toContain("Please quiz me on Physics: Optics");
  });
});

describe("AI helps left, shown up front", () => {
  it("says how many are left and that saved answers are free", () => {
    expect(helpsLeftText({ plan: "free", limit: 5, used: 2, left: 3 })).toBe("3 of 5 AI helps left today · saved answers are free");
    expect(helpsLeftText({ plan: "free", limit: 5, used: 5, left: 0 })).toMatch(/No AI helps left today/);
  });
});
