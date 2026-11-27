import { render, screen } from "@testing-library/react";
import { FIRST_RUN_DRAFT_KEY } from "@/lib/onboarding/first-run";
import { afterEach, describe, expect, it } from "vitest";
import { TodayHome, greeting } from "../TodayHome";

const empty = {
  bookTitle: null,
  sprintLabel: null,
  nextBlock: null,
  studiedMinutes: null,
  dailyGoal: null,
};

describe("TodayHome", () => {
  afterEach(() => window.localStorage.clear());

  it("offers to open the plan when first-run answers are waiting", async () => {
    window.localStorage.setItem(
      FIRST_RUN_DRAFT_KEY,
      JSON.stringify({ exam: "class12", subjects: ["Physics"], examMonth: "2099-03", owner: "student-a", savedAt: Date.now() })
    );
    const view = render(<TodayHome continuation={empty} draftOwner="student-a" />);
    expect(await screen.findByText("Show my plan")).toBeTruthy();
    expect(screen.getByTestId("today-make-plan").getAttribute("href")).toBe("/roadmap");
    view.unmount();

    // Another student signed in on the same phone doesn't see it.
    render(<TodayHome continuation={empty} draftOwner="student-b" />);
    expect(screen.getByTestId("today-make-plan").getAttribute("href")).toBe("/welcome");
  });

  it("links to the focus timer", () => {
    render(<TodayHome continuation={empty} />);
    expect(screen.getByTestId("today-focus-timer").getAttribute("href")).toBe("/focus");
  });

  it("doesn't say 'Add your first book' while the account is still opening", () => {
    render(<TodayHome continuation={empty} record="loading" />);
    expect(screen.getByTestId("today-book").textContent).toMatch(/Your books/);
    expect(screen.getByTestId("today-book").textContent).not.toMatch(/Add your first book/);
    expect(screen.getByTestId("today-book").getAttribute("href")).toBe("/reader");
  });

  it("asks a student with no plan to make one, and to add a first book", () => {
    render(<TodayHome continuation={empty} />);
    expect(screen.getByRole("heading", { name: "What to study now" })).toBeTruthy();
    expect(screen.getByTestId("today-make-plan").getAttribute("href")).toBe("/welcome");
    expect(screen.queryByTestId("today-start")).toBeNull();
    expect(screen.getByTestId("today-book").getAttribute("href")).toBe("/reader?upload=1");
    expect(screen.getByTestId("today-book").textContent).toMatch(/Add your first book/);
    expect(screen.getByTestId("today-take-my-study").getAttribute("href")).toBe("/companion");
    expect(screen.getByTestId("today-revise").getAttribute("href")).toBe("/revise");
    expect(screen.getByTestId("today-lecture-notes").getAttribute("href")).toBe("/video");
    expect(screen.getByTestId("today-highlights").textContent).toMatch(/Highlights/);
    expect(screen.getByTestId("today-study-style").getAttribute("href")).toBe("/body-type");
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

  it("shows the backlog when plan topics were missed", () => {
    render(<TodayHome continuation={{ ...empty, backlog: { topics: 3, minutes: 150 } }} />);
    expect(screen.getByTestId("today-backlog").textContent).toMatch(/Backlog: 3 topics/);
    expect(screen.getByTestId("today-backlog").getAttribute("href")).toBe("/roadmap#backlog");
  });

  it("greets by the time of day", () => {
    expect(greeting(new Date(2026, 10, 27, 8))).toBe("Good morning");
    expect(greeting(new Date(2026, 10, 27, 14))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 10, 27, 20))).toBe("Good evening");
  });

  it("shows Today's mix, the week's stamps and the book's page progress", () => {
    render(
      <TodayHome continuation={{ ...empty, bookTitle: "Physics Part 1", bookPage: 60, bookPages: 120 }} />
    );
    expect(screen.getByTestId("today-mix").textContent).toMatch(/Today.s mix/);
    expect(screen.getByTestId("today-mix-revision").getAttribute("href")).toBe("/reader");
    expect(screen.getByTestId("today-mix-lecture").getAttribute("href")).toBe("/video");
    expect(screen.getByTestId("today-week").querySelectorAll("li")).toHaveLength(7);
    expect(screen.getByTestId("today-week-streak").textContent).toMatch(/Start a streak/);
    expect(screen.getByTestId("today-plan").textContent).toMatch(/Page 60 of 120/);
    expect(screen.getByTestId("today-continue-reading").getAttribute("href")).toBe("/reader");
  });
});
