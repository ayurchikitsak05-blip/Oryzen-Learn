import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListenButton } from "../ListenButton";

class FakeUtterance {
  text: string;
  lang = "";
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

describe("ListenButton", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the text aloud and turns into Stop", () => {
    const synth = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] };
    vi.stubGlobal("speechSynthesis", synth);
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    render(<ListenButton text="Newton's first law" />);
    fireEvent.click(screen.getByTestId("listen-button"));
    expect((synth.speak.mock.calls[0][0] as FakeUtterance).text).toBe("Newton's first law");
    expect(screen.getByTestId("listen-button").textContent).toBe("Stop");
    fireEvent.click(screen.getByTestId("listen-button"));
    expect(screen.getByTestId("listen-button").textContent).toBe("Listen");
  });

  it("hides itself where the browser has no voice", () => {
    render(<ListenButton text="Hello" />);
    expect(screen.queryByTestId("listen-button")).toBeNull();
  });
});
