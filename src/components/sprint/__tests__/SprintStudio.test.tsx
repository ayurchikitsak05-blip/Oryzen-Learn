import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SprintStudio } from "../SprintStudio";
import { readSprintStore, todayKey } from "@/lib/sprint";

describe("SprintStudio", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("starts, pauses, resumes, and completes a timed session", async () => {
    const view = render(<SprintStudio userId="student-a" />);
    fireEvent.change(view.getByTestId("sprint-goal"), {
      target: { value: "Finish linear equations" },
    });
    fireEvent.change(view.getByTestId("sprint-subject"), {
      target: { value: "Mathematics" },
    });
    fireEvent.click(view.getByTestId("sprint-duration-25"));
    fireEvent.click(view.getByTestId("sprint-start"));

    expect(view.getByTestId("sprint-timer").textContent).toMatch(/Finish linear equations/);
    expect(view.getByTestId("sprint-open-reader").getAttribute("href")).toContain("/reader?");
    expect(view.getByTestId("sprint-open-quiz").getAttribute("href")).toContain("lens=test_me");

    fireEvent.click(view.getByTestId("sprint-pause"));
    await waitFor(() => {
      expect(view.getByTestId("sprint-timer").textContent).toMatch(/Paused/);
    });
    expect(readSprintStore("student-a").sessions[0]?.status).toBe("paused");

    fireEvent.click(view.getByTestId("sprint-resume"));
    expect(view.getByTestId("sprint-timer").textContent).toMatch(/In progress/);

    fireEvent.click(view.getByTestId("sprint-complete"));
    expect(readSprintStore("student-a").sessions[0]?.status).toBe("completed");
    expect(view.getByTestId("sprint-setup")).toBeTruthy();
    expect(view.getByTestId("sprint-history").textContent).toMatch(/Finish linear equations/);
    expect(view.getByTestId("sprint-next-block").textContent).toMatch(/Next recommended|complete/i);
  });

  it("splits a longer daily target and keeps another student isolated", () => {
    const view = render(<SprintStudio userId="student-a" />);
    fireEvent.change(view.getByTestId("sprint-daily-target"), { target: { value: "90" } });
    expect(view.getByTestId("sprint-progress").textContent).toMatch(/4 session/);
    fireEvent.change(view.getByTestId("sprint-goal"), { target: { value: "Page 3" } });
    fireEvent.click(view.getByTestId("sprint-start"));
    expect(readSprintStore("student-a").sessions).toHaveLength(1);
    expect(readSprintStore("student-b").sessions).toHaveLength(0);
    expect(readSprintStore("student-a").sessions[0]?.date).toBe(todayKey());
  });

  it("lets a student override the suggested rhythm", () => {
    const view = render(<SprintStudio userId="student-a" />);
    fireEvent.click(view.getByTestId("sprint-rhythm-laser"));
    fireEvent.click(view.getByTestId("sprint-duration-60"));
    expect(readSprintStore("student-a").rhythm).toBe("laser");
    expect(readSprintStore("student-a").preferredDuration).toBe(60);
    expect(view.getByTestId("sprint-setup").textContent).toMatch(/not a measure of ability|optional/i);
  });
});
