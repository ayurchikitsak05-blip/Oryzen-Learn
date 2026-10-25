import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UniverseStudio } from "../UniverseStudio";
import { readUniversePrefs } from "@/lib/universe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe("UniverseStudio", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("offers create, customize, or a plain reader after onboarding", async () => {
    const view = render(<UniverseStudio userId="student-a" fromOnboarding />);
    await waitFor(() => expect(view.getByTestId("universe-offer")).toBeTruthy());
    expect(view.getByTestId("universe-offer").textContent).toMatch(/Create My Study Universe/);
    expect(view.getByTestId("universe-customize")).toBeTruthy();
    expect(view.getByTestId("universe-open-reader")).toBeTruthy();
    expect(view.getByText(/not a scientific measure/i)).toBeTruthy();
    fireEvent.click(view.getByTestId("universe-create"));
    expect(view.getByTestId("universe-dashboard")).toBeTruthy();
    expect(view.getByTestId("universe-plan").textContent).toMatch(/Focus|Break|Quiz|Revision|Buffer/i);
    expect(readUniversePrefs("student-a").activated).toBe(true);
    fireEvent.click(view.getByTestId("universe-advanced-toggle"));
    fireEvent.change(view.getByTestId("universe-companion-name"), { target: { value: "Luna" } });
    fireEvent.click(view.getByTestId("universe-companion-add"));
    expect(view.getByTestId("universe-companions").textContent).toMatch(/Luna/);
  });

  it("opens the reader path without activating a universe", async () => {
    const view = render(<UniverseStudio userId="student-b" fromOnboarding />);
    await waitFor(() => expect(view.getByTestId("universe-open-reader")).toBeTruthy());
    fireEvent.click(view.getByTestId("universe-open-reader"));
    expect(readUniversePrefs("student-b").skipped).toBe(true);
    expect(readUniversePrefs("student-b").activated).toBe(false);
  });
});
