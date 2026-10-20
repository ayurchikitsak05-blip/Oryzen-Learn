import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIDEO_LECTURES,
  detectVideoRewindFriction,
  extractYouTubeVideoId,
  formatTimestampBadge,
  getSyncedNotesStateAtTime,
  parseTimestampBadgeToSeconds,
} from "../sync-engine";

describe("Layer 4: Parallel Video Lecture Studio Sync Engine (`sync-engine.ts`)", () => {
  it("formats and parses timestamp badges like `[04:18]` accurately", () => {
    expect(formatTimestampBadge(258)).toBe("[04:18]");
    expect(formatTimestampBadge(0)).toBe("[00:00]");
    expect(formatTimestampBadge(3665)).toBe("[01:01:05]");

    expect(parseTimestampBadgeToSeconds("[04:18]")).toBe(258);
    expect(parseTimestampBadgeToSeconds("[01:01:05]")).toBe(3665);
  });

  it("extracts 11-character YouTube video IDs from public and unlisted URLs", () => {
    expect(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=M7lc1UVf-VE")
    ).toBe("M7lc1UVf-VE");
    expect(
      extractYouTubeVideoId("https://youtu.be/M7lc1UVf-VE?si=unlisted")
    ).toBe("M7lc1UVf-VE");
    expect(
      extractYouTubeVideoId("https://www.youtube.com/embed/M7lc1UVf-VE")
    ).toBe("M7lc1UVf-VE");
    expect(extractYouTubeVideoId("M7lc1UVf-VE")).toBe("M7lc1UVf-VE");
    expect(extractYouTubeVideoId("https://example.com/video.mp4")).toBeNull();
  });

  it("reveals timestamp-synced notes progressively as `currentTimeSeconds` advances", () => {
    const lecture = DEFAULT_VIDEO_LECTURES[0];

    // At t = 10s, only the first note ([00:00] -> 90s) is revealed
    const stateAt10 = getSyncedNotesStateAtTime(lecture.notes, 10, false);
    expect(stateAt10.revealedNotes).toHaveLength(1);
    expect(stateAt10.activeNote?.timestampBadge).toBe("[00:00]");
    expect(stateAt10.upcomingCount).toBe(3);

    // At t = 195s (03:15), first 3 notes are revealed and [03:00] is active
    const stateAt195 = getSyncedNotesStateAtTime(lecture.notes, 195, false);
    expect(stateAt195.revealedNotes).toHaveLength(3);
    expect(stateAt195.activeNote?.timestampBadge).toBe("[03:00]");
    expect(stateAt195.upcomingCount).toBe(1);

    // At t = 258s ([04:18]), all 4 notes are revealed and [04:18] is active
    const stateAt258 = getSyncedNotesStateAtTime(lecture.notes, 258, false);
    expect(stateAt258.revealedNotes).toHaveLength(4);
    expect(stateAt258.activeNote?.timestampBadge).toBe("[04:18]");
    expect(stateAt258.upcomingCount).toBe(0);
  });

  it("detects 10-second rewind friction events accurately", () => {
    const rewind = detectVideoRewindFriction(268, 258);
    expect(rewind.isRewindFriction).toBe(true);
    expect(rewind.deltaSeconds).toBe(10);

    const forward = detectVideoRewindFriction(100, 130);
    expect(forward.isRewindFriction).toBe(false);
  });
});
