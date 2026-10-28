import { describe, expect, it } from "vitest";
import { unlockTestVault } from "@/test/unlock-vault";
import { captionFailureCopy, notesFromTimedTextXml } from "../public-captions";
import { readVideoCaptionNotes, writeVideoCaptionNotes } from "../caption-notes-store";

describe("public YouTube captions", () => {
  it("explains a missing caption track without claiming notes were written", () => {
    expect(captionFailureCopy("no_public_captions")).toMatch(/did not provide a public caption track/i);
    expect(captionFailureCopy("no_public_captions")).toMatch(/does not listen to the audio/i);
    expect(captionFailureCopy("unavailable")).toMatch(/no lecture notes were created/i);
  });

  it("keeps caption notes for the signed-in student and hides another account", async () => {
    await unlockTestVault("student-a");
    const saved = await writeVideoCaptionNotes("student-a", {
      videoId: "abcdefghijk",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      title: "Current",
      notes: [
        {
          id: "cap-1",
          lectureId: "lec-student-abcdefghijk",
          startSeconds: 1,
          endSeconds: 4,
          timestampBadge: "[00:01]",
          heading: "Charge flows",
          speakerTranscript: "Charge flows",
          studyNoteMarkdown: "Charge flows",
          highYieldKeyPoint: "",
          modificationHistory: [],
        },
      ],
    });
    expect(saved).toBe(true);
    expect(localStorage.getItem("oryzen_video_caption_notes_v1")).toBeNull();
    expect(readVideoCaptionNotes("student-a")[0]?.title).toBe("Current");
    await unlockTestVault("student-b");
    expect(readVideoCaptionNotes("student-b")).toEqual([]);
    expect(localStorage.getItem("oryzen_video_caption_notes_v1")).toBeNull();
  });

  it("turns timedtext XML into timestamped notes without inventing speech", () => {
    const notes = notesFromTimedTextXml(
      `<transcript><text start="12.5" dur="2">Current is flow of charge</text></transcript>`,
      "abc123"
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]?.speakerTranscript).toBe("Current is flow of charge");
    expect(notes[0]?.timestampBadge).toBe("[00:12]");
  });
});
