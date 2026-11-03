import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFirstRunDraft } from "@/lib/onboarding/first-run";

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/layout/AppChrome", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/roadmap/time", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/roadmap/time")>();
  return { ...actual, localIsoDate: () => "2026-11-03" };
});

import WelcomePage from "../page";

describe("Welcome (first run)", () => {
  afterEach(() => {
    window.localStorage.clear();
    nav.push.mockClear();
  });

  it("makes a plan from a few taps and sends the student to upload a book", async () => {
    render(<WelcomePage />);
    const next = screen.getByTestId("welcome-next") as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("welcome-exam-class12"));
    await waitFor(() =>
      expect((screen.getByTestId("welcome-exam-month") as HTMLSelectElement).value).toBe("2027-03")
    );
    expect(screen.getByRole("button", { name: /Physics/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(screen.getByTestId("welcome-extra-subject"), { target: { value: "Hindi" } });
    fireEvent.click(screen.getByTestId("welcome-add-subject"));
    expect(screen.getByRole("button", { name: /Hindi/ }).getAttribute("aria-pressed")).toBe("true");

    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(screen.getByRole("heading", { name: "Add your first book" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("welcome-upload"));
    expect(nav.push).toHaveBeenCalledWith("/reader?upload=1&tip=explain");
    expect(readFirstRunDraft()).toEqual({
      exam: "class12",
      subjects: ["Physics", "Chemistry", "Hindi"],
      examMonth: "2027-03",
    });
  });

  it("can't continue with every subject turned off, and Skip goes to Today", async () => {
    render(<WelcomePage />);
    fireEvent.click(screen.getByTestId("welcome-exam-jee"));
    for (const name of ["Physics", "Chemistry", "Maths"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
    }
    expect((screen.getByTestId("welcome-next") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("welcome-skip").getAttribute("href")).toBe("/hub");
  });
});
