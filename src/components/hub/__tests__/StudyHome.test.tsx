import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudyHome } from "../StudyHome";

const empty = {
  bookTitle: null,
  sprintLabel: null,
  nextBlock: null,
  studiedMinutes: null,
  dailyGoal: null,
};

describe("StudyHome", () => {
  it("links eight study destinations and keeps Ask My Book inside e-books", () => {
    render(<StudyHome continuation={empty} />);

    expect(screen.getByRole("heading", { name: "What will you explore today?" })).toBeTruthy();
    expect(screen.getByTestId("hub-companion-link").getAttribute("href")).toBe("/companion");
    expect(screen.getByTestId("hub-companion-buddy").textContent).toMatch(/Buddy/);
    expect(screen.getByTestId("hub-companion-teacher").textContent).toMatch(/Teacher/);
    expect(screen.getByTestId("hub-companion-coach").textContent).toMatch(/Coach/);
    expect(screen.getByTestId("hub-companion-guide").textContent).toMatch(/Guide/);
    expect(screen.getByTestId("hub-reader-link").getAttribute("href")).toBe("/reader");
    expect(screen.getByTestId("hub-reader-link").textContent).toMatch(/Ask My Book/);
    expect(screen.getByTestId("hub-reader-link").textContent).toMatch(/Transform/);
    expect(screen.getByTestId("hub-video-link").getAttribute("href")).toBe("/video");
    expect(screen.getByTestId("hub-sprint-link").getAttribute("href")).toBe("/sprint");
    expect(screen.getByTestId("hub-roadmap-link").getAttribute("href")).toBe("/roadmap");
    expect(screen.getByTestId("hub-progress-link").getAttribute("href")).toBe("/progress");
    expect(screen.getByTestId("hub-test-link").getAttribute("href")).toBe("/reader?lens=test_me");
    expect(screen.getByTestId("hub-notes-link").getAttribute("href")).toBe("/notes");
    expect(screen.getByTestId("hub-continue").getAttribute("href")).toBe("/reader?upload=1");
    expect(screen.getByTestId("hub-today-plan").textContent).toMatch(/Nothing is planned for today/);
    expect(screen.getByTestId("hub-today-progress").textContent).toMatch(/Nothing recorded yet/);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/Study Circle/)).toBeNull();
    expect(screen.queryByTestId("hub-ask-link")).toBeNull();
    expect(screen.queryByTestId("hub-transform-link")).toBeNull();
  });

  it("shows only recorded minutes against a saved goal", () => {
    render(
      <StudyHome
        continuation={{
          ...empty,
          bookTitle: "Work and Energy",
          nextBlock: "Next recommended block: 25 minutes.",
          studiedMinutes: 10,
          dailyGoal: 40,
        }}
      />
    );
    expect(screen.getByTestId("hub-upload").getAttribute("href")).toBe("/reader?upload=1");
    expect(screen.getByTestId("hub-today-plan").textContent).toMatch(/Work and Energy/);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("25");
    expect(screen.getByText("10 min studied")).toBeTruthy();
  });
});
