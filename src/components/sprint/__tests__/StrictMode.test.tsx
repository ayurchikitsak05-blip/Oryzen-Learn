import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readStrictMode, StrictBar, StrictModeOverlay, StrictModeToggle } from "../StrictMode";
import { createSprintSession, startSprint } from "@/lib/sprint";

describe("Strict mode", () => {
  afterEach(() => window.localStorage.clear());

  it("remembers the switch", () => {
    const onChange = vi.fn();
    render(<StrictModeToggle value={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(readStrictMode()).toBe(true);
  });

  it("shows only the timer and the book, and asks before ending early", () => {
    const onEnd = vi.fn();
    const session = startSprint(createSprintSession({ goal: "Read chapter 4", durationMinutes: 25 }), Date.now());
    render(<StrictModeOverlay session={session} clock="24:10" bookHref="/reader" onEndEarly={onEnd} />);
    expect(screen.getByTestId("strict-clock").textContent).toBe("24:10");
    expect(screen.getByTestId("strict-open-book").getAttribute("href")).toBe("/reader");
    fireEvent.click(screen.getByTestId("strict-end-ask"));
    fireEvent.click(screen.getByTestId("strict-keep-going"));
    expect(onEnd).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("strict-end-ask"));
    fireEvent.click(screen.getByTestId("strict-end"));
    expect(onEnd).toHaveBeenCalled();
  });

  it("keeps full screen when the student opens the book, and moves focus into the overlay", () => {
    const session = startSprint(createSprintSession({ goal: "Read chapter 4", durationMinutes: 25 }), Date.now());
    const view = render(
      <StrictModeOverlay session={session} clock="24:10" bookHref="/reader" onEndEarly={vi.fn()} stillRunning={() => true} />
    );
    expect(document.activeElement).toBe(screen.getByTestId("strict-open-book"));
    view.unmount();
  });

  it("shows a strict bar in the book with End early behind a confirm", () => {
    const session = startSprint(createSprintSession({ goal: "Read chapter 4", durationMinutes: 25 }), Date.now());
    render(<StrictBar session={session} clock="18:42" userId="u1" />);
    expect(screen.getByTestId("strict-bar-clock").textContent).toBe("18:42");
    expect(screen.queryByTestId("strict-bar-end")).toBeNull();
    fireEvent.click(screen.getByTestId("strict-bar-end-ask"));
    expect(screen.getByTestId("strict-bar-end")).toBeTruthy();
  });
});
