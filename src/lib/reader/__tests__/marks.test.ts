import { afterEach, describe, expect, it } from "vitest";
import {
  READER_MARKS_STORAGE_KEY,
  readTextMarks,
  unclaimedLegacyMarksExist,
  writeTextMarks,
} from "../marks";

describe("reader mark isolation", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("keeps highlights per student and leaves unscoped marks unclaimed", () => {
    window.localStorage.setItem(
      READER_MARKS_STORAGE_KEY,
      JSON.stringify([
        { id: "legacy", chunkId: "c1", start: 0, end: 4, kind: "highlight" },
      ])
    );
    writeTextMarks(
      [{ id: "a1", chunkId: "c1", start: 0, end: 8, kind: "highlight" }],
      "user-a"
    );

    expect(unclaimedLegacyMarksExist()).toBe(true);
    expect(readTextMarks("user-a")).toHaveLength(1);
    expect(readTextMarks("user-a")[0]?.id).toBe("a1");
    expect(readTextMarks("user-b")).toEqual([]);
    expect(readTextMarks("user-a").some((item) => item.id === "legacy")).toBe(false);
    expect(window.localStorage.getItem(READER_MARKS_STORAGE_KEY)).toContain("legacy");
  });
});
