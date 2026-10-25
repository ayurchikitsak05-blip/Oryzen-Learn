import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudyHome } from "../StudyHome";

describe("StudyHome", () => {
  it("links working features and keeps unfinished ones from navigating", () => {
    render(
      <StudyHome
        continuation={{
          bookTitle: null,
          sprintLabel: null,
          nextBlock: null,
          studiedMinutes: null,
          dailyGoal: null,
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "What would you like to learn today?" })).toBeTruthy();
    expect(screen.getByTestId("hub-universe-link").getAttribute("href")).toBe("/universe");
    expect(screen.getByTestId("hub-reader-link").getAttribute("href")).toBe("/reader");
    expect(screen.getByTestId("hub-transform-link").getAttribute("href")).toBe("/reader");
    expect(screen.getByTestId("hub-sprint-link").getAttribute("href")).toBe("/sprint");
    expect(screen.getByTestId("hub-roadmap-link").getAttribute("href")).toBe("/roadmap");
    expect(screen.getByTestId("hub-companion-link").getAttribute("href")).toBe("/companion");
    expect(screen.getByTestId("hub-ask-link").getAttribute("href")).toBe("/reader");
    expect(screen.getByTestId("hub-video-link").getAttribute("href")).toBe("/video");
    expect(screen.getByTestId("hub-notes-link").getAttribute("href")).toBe("/notes");
    expect(screen.getByTestId("hub-test-link").getAttribute("href")).toBe("/reader?lens=test_me");
    expect(screen.getByTestId("hub-upload").getAttribute("href")).toBe("/reader?upload=1");

    const comingSoon = screen.getByTestId("hub-coming-soon");
    expect(comingSoon.textContent).toMatch(/Study Circle/);
    expect(comingSoon.textContent).toMatch(/Study Progress/);
    expect(comingSoon.querySelector("a")).toBeNull();
  });
});
