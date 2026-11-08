import { afterEach, describe, expect, it, vi } from "vitest";
import { languageFor, plainForSpeech, setVoiceGuide, speak, speechChunks, speechSupported, stopSpeaking, voiceGuideOn } from "../speak";

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

describe("read aloud", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("strips markdown and timestamps so the voice reads clean words", () => {
    expect(plainForSpeech("## Heading\n- **F = ma** [00:12]\n1. [link](https://x.y) `code`")).toBe("Heading F = ma link code");
  });

  it("uses Hindi for Devanagari text and Indian English otherwise", () => {
    expect(languageFor("प्रकाश का परावर्तन")).toBe("hi-IN");
    expect(languageFor("Reflection of light")).toBe("en-IN");
  });

  it("speaks with the device voice and can stop", () => {
    const synth = { speak: vi.fn(), cancel: vi.fn(), speaking: false, pending: false, getVoices: () => [{ lang: "en-IN", name: "Indian" }] };
    vi.stubGlobal("speechSynthesis", synth);
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    expect(speechSupported()).toBe(true);
    expect(speak("**Hello** world", "a")).toBe(true);
    const spoken = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(spoken.text).toBe("Hello world");
    expect(spoken.lang).toBe("en-IN");
    stopSpeaking();
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("splits long text at sentence ends so Chrome reads it all", () => {
    const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const pieces = speechChunks(long, 80);
    expect(pieces.length).toBeGreaterThan(3);
    expect(pieces.every((piece) => piece.length <= 80)).toBe(true);
    expect(pieces.join(" ")).toBe(long);
  });

  it("'Read each step aloud' is off until turned on", () => {
    expect(voiceGuideOn()).toBe(false);
    setVoiceGuide(true);
    expect(voiceGuideOn()).toBe(true);
  });
});
