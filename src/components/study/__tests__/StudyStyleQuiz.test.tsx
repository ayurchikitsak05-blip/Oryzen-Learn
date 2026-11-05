import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyStyleQuiz } from "../StudyStyleQuiz";
import { BODY_QUESTIONS, readStudyProfile, STUDY_QUESTIONS } from "@/lib/study/style-quiz";
import { readSprintStore } from "@/lib/sprint";
import { discardAccountVault } from "@/lib/privacy/account-vault";
import { unlockTestVault } from "@/test/unlock-vault";

vi.mock("@/lib/supabase/session", () => ({
  fetchSignedInUser: vi.fn(async () => ({ userId: "student-a" })),
}));
vi.mock("@/lib/privacy/account-vault", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/privacy/account-vault")>();
  return { ...actual, ensureAccountVault: vi.fn(async () => true) };
});
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

describe("StudyStyleQuiz", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    discardAccountVault();
    window.localStorage.clear();
  });

  it("asks all 39 questions one at a time, then shows the style and applies settings", async () => {
    await unlockTestVault("student-a");
    render(<StudyStyleQuiz />);
    await waitFor(() => expect(screen.getByTestId("style-progress").textContent).toBe("1 of 39"));

    let clock = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
    for (const question of BODY_QUESTIONS) {
      expect(screen.getByTestId("style-question").textContent).toBe(question.prompt);
      fireEvent.click(screen.getByText(question.options.Vata));
    }
    for (const question of STUDY_QUESTIONS) {
      expect(screen.getByTestId("style-question").textContent).toBe(question.prompt);
      fireEvent.click(screen.getByText(question.options[0].label));
    }

    expect(await screen.findByTestId("style-result")).toBeTruthy();
    expect(screen.getByTestId("style-name").textContent).toBe("Spark & Sprint");
    expect(screen.getByTestId("style-sprint").textContent).toBe("15 minutes");
    expect(screen.getByTestId("style-disclaimer").textContent).toMatch(/not a medical test/);
    await waitFor(() => expect(readStudyProfile("student-a")?.settings.sprintMinutes).toBe(15));

    fireEvent.click(screen.getByTestId("style-apply"));
    expect(readSprintStore("student-a").preferredDuration).toBe(15);
  });

  it("ignores a quick second tap, and lets the student go back and change an answer", async () => {
    render(<StudyStyleQuiz />);
    fireEvent.click(screen.getByText(BODY_QUESTIONS[0].options.Pitta));
    fireEvent.click(screen.getByText(BODY_QUESTIONS[1].options.Pitta));
    expect(screen.getByTestId("style-progress").textContent).toBe("2 of 39");
    fireEvent.click(screen.getByTestId("style-back"));
    expect(screen.getByTestId("style-question").textContent).toBe(BODY_QUESTIONS[0].prompt);
    expect(screen.getByText(BODY_QUESTIONS[0].options.Pitta).closest("button")?.getAttribute("aria-checked")).toBe("true");
  });

  it("has a skip on every question; skipping most gives a rough-guide note", async () => {
    let clock = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
    render(<StudyStyleQuiz />);
    for (let i = 0; i < BODY_QUESTIONS.length + STUDY_QUESTIONS.length; i += 1) {
      fireEvent.click(screen.getByTestId("style-skip"));
    }
    expect(await screen.findByTestId("style-result")).toBeTruthy();
    expect(screen.getByTestId("style-rough")).toBeTruthy();
    expect(screen.getByTestId("style-name").textContent).toBe("Even Blend");
  });
});
