import { describe, expect, it } from "vitest";
import { chapterKey, chapterRows, chapterSummary } from "../chapters";

const book = {
  id: "b1",
  title: "Physics",
  pageCount: 120,
  chapters: [
    { title: "Laws of Motion", pageNumber: 88 },
    { title: "Units and Measurement", pageNumber: 1 },
    { title: "Motion in a Straight Line", pageNumber: 25 },
    { title: "Duplicate start", pageNumber: 25 },
    { title: "x", pageNumber: 50 },
  ],
  reachedPage: 100,
};

describe("chapter status (no AI)", () => {
  it("turns the contents into page ranges", () => {
    const rows = chapterRows([book], new Set());
    expect(rows.map((r) => [r.title, r.startPage, r.endPage])).toEqual([
      ["Units and Measurement", 1, 24],
      ["Motion in a Straight Line", 25, 87],
      ["Laws of Motion", 88, 120],
    ]);
  });

  it("marks read, reading and not started from how far the student got", () => {
    const rows = chapterRows([book], new Set());
    expect(rows.map((r) => r.status)).toEqual(["read", "read", "reading"]);
    expect(rows[2].percent).toBe(39);
    expect(chapterRows([{ ...book, reachedPage: 0 }], new Set()).every((r) => r.status === "new")).toBe(true);
  });

  it("lets the student tick a chapter exam-ready", () => {
    const rows = chapterRows([book], new Set([chapterKey("b1", 25)]));
    expect(rows[1].status).toBe("ready");
    expect(chapterSummary(rows)).toEqual({ ready: 1, read: 1, reading: 1, new: 0, total: 3 });
  });
});
