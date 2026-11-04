import { describe, expect, it } from "vitest";
import {
  indiaMonthStartIso,
  isVideoId,
  lectureAllowance,
  lectureFailureMessage,
  lectureLimitMessage,
  lectureNotesRequestBody,
  LECTURE_MAX_SECONDS,
  parseLectureNotes,
  sanitizeStoredNotes,
} from "../lecture-notes";

describe("lecture notes helpers", () => {
  it("accepts only 11-character YouTube ids", () => {
    expect(isVideoId("dQw4w9WgXcQ")).toBe(true);
    expect(isVideoId("short")).toBe(false);
    expect(isVideoId("dQw4w9WgXcQ&x")).toBe(false);
  });

  it("asks Gemini for 90 minutes at low detail, one picture every 5 seconds", () => {
    const body = lectureNotesRequestBody("dQw4w9WgXcQ");
    const media = body.contents[0].parts[0] as {
      fileData: { fileUri: string };
      videoMetadata: { endOffset: string; fps: number };
    };
    expect(media.fileData.fileUri).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(media.videoMetadata).toEqual({ endOffset: "5400s", fps: 0.2 });
    expect(body.generationConfig.mediaResolution).toBe("MEDIA_RESOLUTION_LOW");
  });

  it("turns Gemini's sections into timed notes, in order, within 90 minutes", () => {
    const parsed = parseLectureNotes(
      {
        title: "  Laws of motion ",
        sections: [
          { start_seconds: 600, heading: "Second law", points: ["F = ma", ""], key_point: "Units of force" },
          { start_seconds: 0, heading: "Inertia", points: ["Objects resist change"], key_point: "" },
          { start_seconds: 99999, heading: "Too late", points: ["x"] },
          { start_seconds: 30, heading: "", points: [] },
        ],
      },
      "dQw4w9WgXcQ"
    );
    expect(parsed.title).toBe("Laws of motion");
    expect(parsed.notes.map((n) => n.heading)).toEqual(["Inertia", "Second law", "Too late"]);
    expect(parsed.notes[0].timestampBadge).toBe("[00:00]");
    expect(parsed.notes[0].endSeconds).toBe(600);
    expect(parsed.notes[1].studyNoteMarkdown).toBe("- F = ma");
    expect(parsed.notes[1].highYieldKeyPoint).toBe("Units of force");
    expect(parsed.notes[2].startSeconds).toBe(LECTURE_MAX_SECONDS);
    expect(parsed.notes[0].lectureId).toBe("lec-student-dQw4w9WgXcQ");
  });

  it("never throws on bad model output", () => {
    expect(parseLectureNotes(null, "dQw4w9WgXcQ").notes).toEqual([]);
    expect(parseLectureNotes({ sections: "nope" }, "dQw4w9WgXcQ").title).toBe("Your lecture");
    expect(sanitizeStoredNotes("x", "dQw4w9WgXcQ")).toEqual([]);
    const cleaned = sanitizeStoredNotes([{ heading: "A", startSeconds: -5, studyNoteMarkdown: "- b" }], "dQw4w9WgXcQ");
    expect(cleaned[0].startSeconds).toBe(0);
  });

  it("counts the month in India time and explains the limit", () => {
    expect(indiaMonthStartIso(new Date("2026-11-30T20:00:00Z"))).toBe("2026-11-30T18:30:00.000Z");
    expect(indiaMonthStartIso(new Date("2026-11-04T05:00:00Z"))).toBe("2026-10-31T18:30:00.000Z");
    const free = lectureAllowance("free", 1);
    expect(free.left).toBe(0);
    expect(lectureLimitMessage(free)).toMatch(/free plan includes 1 new lecture/);
    expect(lectureAllowance("pro", 3).left).toBe(5);
  });

  it("explains private videos plainly", () => {
    expect(lectureFailureMessage(400, "Video is private")).toMatch(/Only public YouTube videos/);
    expect(lectureFailureMessage(500, "")).toMatch(/Nothing was counted/);
  });
});
