import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { petArt } from "../collectible-art";
import { ExperienceBoard } from "../LearningStudio";
import { ExperiencePreview } from "../PersonalizeSpace";
import { EMPTY_LEARNING_RECORD } from "@/lib/experience/record";
import { evaluateLearning } from "@/lib/experience/rewards";
import { defaultLearningWorld } from "@/lib/experience/world";
import type { StudioSnapshot } from "../LearningStudio";

function snapshot(experience: StudioSnapshot["experience"]): StudioSnapshot {
  const evaluation = evaluateLearning(EMPTY_LEARNING_RECORD, "2026-10-29");
  return {
    userId: "student-a",
    locked: false,
    vault: "open",
    record: EMPTY_LEARNING_RECORD,
    evaluation,
    world: defaultLearningWorld("student-a"),
    experience,
    rewards: true,
    companionStyle: "teacher",
    examDaysLeft: null,
  };
}

describe("experience dashboards", () => {
  it("keeps Focus free of stickers and Momentum free of a score", () => {
    const focus = render(
      <ExperienceBoard snapshot={snapshot("focus")} studiedMinutes={null} dailyGoal={null} nextBlock={null} />
    );
    expect(focus.getByTestId("dashboard-focus").textContent).toMatch(/No exam date is saved/);
    expect(focus.queryByText(/Sticker Studio/)).toBeNull();
    focus.unmount();

    const studio = render(
      <ExperienceBoard snapshot={snapshot("studio")} studiedMinutes={null} dailyGoal={null} nextBlock={null} />
    );
    expect(studio.getByTestId("dashboard-studio").textContent).toMatch(/Sticker Studio/);
    expect(studio.getByTestId("study-pet").querySelector("img")?.getAttribute("src")).toBe(petArt("none"));
    expect(petArt("ribbon")).not.toBe(petArt("none"));
    expect(petArt("satchel")).not.toBe(petArt("ribbon"));
    studio.unmount();

    render(
      <ExperienceBoard snapshot={snapshot("momentum")} studiedMinutes={10} dailyGoal={40} nextBlock="Read motion." />
    );
    expect(screen.getByTestId("dashboard-momentum").textContent).toMatch(/10 min recorded today/);
    expect(screen.getByTestId("momentum-best").textContent).toMatch(/No personal best/);
    expect(screen.getByTestId("dashboard-momentum").textContent).not.toMatch(/streak/i);
    expect(screen.getByTestId("dashboard-momentum").className).not.toMatch(/min-w-\[40rem\]/);
  });

  it("previews three different layouts on Personalize", () => {
    const view = render(
      <>
        <ExperiencePreview id="focus" />
        <ExperiencePreview id="studio" />
        <ExperiencePreview id="momentum" />
      </>
    );
    expect(view.getByTestId("experience-preview-focus").textContent).toMatch(/Exam desk/);
    expect(view.getByTestId("experience-preview-focus").textContent).not.toMatch(/Sticker Studio/);
    expect(view.getByTestId("experience-preview-studio").textContent).toMatch(/Sticker Studio/);
    expect(view.getByTestId("experience-preview-studio").textContent).toMatch(/Study Room/);
    expect(view.getByTestId("experience-preview-studio").textContent).toMatch(/Museum/);
    expect(view.getByTestId("experience-preview-momentum").textContent).toMatch(/Minutes today/);
    expect(view.getByTestId("experience-preview-momentum").textContent).toMatch(/Personal best/);
    expect(view.getByTestId("experience-preview-momentum").textContent).not.toMatch(/Sticker Studio/);
  });
});
