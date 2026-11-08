import { describe, expect, it } from "vitest";
import { cleanVoiceTitle, pickAudioType, voiceNotesSupported } from "../store";

describe("voice notes", () => {
  it("picks a format the phone can record (webm, or mp4 on iPhone)", () => {
    expect(pickAudioType((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickAudioType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickAudioType(() => false)).toBe("");
  });

  it("tidies titles and reports no support where recording isn't possible", () => {
    expect(cleanVoiceTitle("  Newton's   laws ")).toBe("Newton's laws");
    expect(cleanVoiceTitle("")).toBe("Voice note");
    expect(voiceNotesSupported()).toBe(false);
  });
});
