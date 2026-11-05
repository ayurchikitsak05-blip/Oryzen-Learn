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
  parseTimestamp,
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

  it("turns Gemini's sections into timed notes, in the order they happen, within 90 minutes", () => {
    const parsed = parseLectureNotes(
      {
        title: "  Laws of motion ",
        sections: [
          { start_time: "00:00", heading: "Inertia", points: ["Objects resist change"], key_point: "" },
          { start_time: "10:00", heading: "Second law", points: ["F = ma", ""], key_point: "Units of force" },
          { start_time: "4:30", heading: "Back in time", points: ["x"] },
          { start_time: "2:05:00", heading: "Too late", points: ["y"] },
          { start_time: "1:00", heading: "", points: [] },
        ],
      },
      "dQw4w9WgXcQ"
    );
    expect(parsed.title).toBe("Laws of motion");
    expect(parsed.notes.map((n) => n.heading)).toEqual(["Inertia", "Second law", "Back in time", "Too late"]);
    expect(parsed.notes.map((n) => n.startSeconds)).toEqual([0, 600, 600, LECTURE_MAX_SECONDS]);
    expect(parsed.notes[0].timestampBadge).toBe("[00:00]");
    expect(parsed.notes[1].studyNoteMarkdown).toBe("- F = ma");
    expect(parsed.notes[1].highYieldKeyPoint).toBe("Units of force");
    expect(parsed.notes[0].lectureId).toBe("lec-student-dQw4w9WgXcQ");
  });

  it("reads timestamps the way the video shows them", () => {
    expect(parseTimestamp("4:05")).toBe(245);
    expect(parseTimestamp("[01:02:30]")).toBe(3750);
    expect(parseTimestamp(90)).toBe(90);
    expect(parseTimestamp("ten minutes")).toBeNaN();
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
