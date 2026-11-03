import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TodayHome } from "../TodayHome";

const empty = {
  bookTitle: null,
  sprintLabel: null,
  nextBlock: null,
  studiedMinutes: null,
  dailyGoal: null,
};

describe("TodayHome", () => {
  it("asks a student with no plan to make one, and to add a first book", () => {
    render(<TodayHome continuation={empty} />);
    expect(screen.getByRole("heading", { name: "What to study now" })).toBeTruthy();
    expect(screen.getByTestId("today-make-plan").getAttribute("href")).toBe("/roadmap");
    expect(screen.queryByTestId("today-start")).toBeNull();
    expect(screen.getByTestId("today-book").getAttribute("href")).toBe("/reader?upload=1");
    expect(screen.getByTestId("today-book").textContent).toMatch(/Add your first book/);
    expect(screen.getByTestId("today-take-my-study").getAttribute("href")).toBe("/companion");
    expect(screen.getByTestId("today-revise").getAttribute("href")).toBe("/reader?lens=test_me");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows one Start button for today's plan and continues the last book", () => {
    render(
      <TodayHome
        continuation={{
          bookTitle: "Physics Part 1",
          sprintLabel: null,
          nextBlock: "Physics: Motion in a Plane",
          studiedMinutes: 20,
          dailyGoal: 40,
        }}
      />
    );
    expect(screen.getByTestId("today-plan").textContent).toMatch(/Motion in a Plane/);
    expect(screen.getByTestId("today-start").getAttribute("href")).toBe("/sprint");
    expect(screen.getAllByRole("link", { name: /Start/ })).toHaveLength(1);
    expect(screen.getByTestId("today-book").textContent).toMatch(/Physics Part 1/);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
  });

  it("keeps the plan hidden while the private record is locked, with a retry", () => {
    render(<TodayHome continuation={empty} record="locked" onRetry={() => undefined} />);
    expect(screen.getByTestId("today-plan").textContent).toMatch(/locked on this device/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByTestId("today-start")).toBeNull();
    expect(screen.queryByTestId("today-make-plan")).toBeNull();
  });
});
