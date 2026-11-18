import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PassageText, { WORD_LOOKUP_DELAY_MS } from "../PassageText";

function renderPassage() {
  return render(
    <PassageText
      chunkId="doc-p1-c0"
      text="Inertia keeps a body moving."
      marks={[]}
      onAddMark={() => undefined}
      onExplain={() => undefined}
      onAddNote={() => undefined}
    />
  );
}

describe("word meaning pop-up", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The pop-up looks the word up; keep that request pending.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens after a short pause on a single click", () => {
    renderPassage();
    fireEvent.click(screen.getByText("Inertia"), { detail: 1 });
    expect(screen.queryByRole("dialog", { name: "Meaning of Inertia" })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(WORD_LOOKUP_DELAY_MS);
    });
    expect(screen.getByRole("dialog", { name: "Meaning of Inertia" })).toBeTruthy();
  });

  it("stays closed when the click is the start of a double or triple click (selecting text)", () => {
    renderPassage();
    const word = screen.getByText("Inertia");
    fireEvent.click(word, { detail: 1 });
    fireEvent.click(word, { detail: 2 });
    fireEvent.click(word, { detail: 3 });
    act(() => {
      vi.advanceTimersByTime(WORD_LOOKUP_DELAY_MS * 2);
    });
    expect(screen.queryByRole("dialog", { name: "Meaning of Inertia" })).toBeNull();
  });
});
