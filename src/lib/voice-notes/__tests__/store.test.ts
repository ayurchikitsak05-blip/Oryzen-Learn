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

describe("voice notes stay locked with the private record", () => {
  it("won't save, list or play while the student's private key is closed", async () => {
    const { saveVoiceNote, listVoiceNotes, voiceNoteAudio } = await import("../store");
    await expect(
      saveVoiceNote({ userId: "u1", title: "Ohm's law", seconds: 4, type: "audio/webm", blob: new Blob(["x"]) })
    ).rejects.toThrow("locked");
    expect(await listVoiceNotes("u1")).toEqual([]);
    expect(await voiceNoteAudio("voice-1", "u1")).toBeNull();
  });
});
