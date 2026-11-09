import { describe, expect, it } from "vitest";
import {
  chapterTextForShortNotes,
  checkPhoto,
  parsePhotoNotes,
  parseShortNotes,
  shortNotesAsText,
  SHORT_NOTES_MAX_CHARS,
  worstCaseAiNotesCostInr,
} from "../ai-notes";
import { fitWithin } from "../photo-resize";
import { helpCost } from "@/lib/ai/daily-allowance";

describe("photo to notes", () => {
  it("keeps readable notes and refuses blank or unreadable pages", () => {
    expect(parsePhotoNotes({ readable: true, title: "Ohm's law", subject: "Physics", body: "V = IR\n\n\n\nR in ohm" })).toEqual({
      readable: true,
      title: "Ohm's law",
      subject: "Physics",
      body: "V = IR\n\nR in ohm",
    });
    expect(parsePhotoNotes({ readable: false, title: "x", subject: "", body: "blur" }).readable).toBe(false);
    expect(parsePhotoNotes({ readable: true, title: "", subject: "", body: "" })).toMatchObject({ readable: false, title: "Notes from a photo" });
    expect(parsePhotoNotes(null).readable).toBe(false);
  });

  it("accepts only small JPEG, PNG or WebP photos", () => {
    const data = "A".repeat(400);
    expect(checkPhoto({ data, mimeType: "image/jpeg" })).toEqual({ data, mimeType: "image/jpeg" });
    expect(checkPhoto({ data, mimeType: "image/gif" })).toBeNull();
    expect(checkPhoto({ data: "not base64!", mimeType: "image/png" })).toBeNull();
    expect(checkPhoto({ data: "A".repeat(4_100_000), mimeType: "image/png" })).toBeNull();
    expect(checkPhoto("x")).toBeNull();
  });

  it("shrinks big phone photos to 1600 px on the long side", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1200, 900)).toEqual({ width: 1200, height: 900 });
  });
});

describe("short notes", () => {
  it("tidies the answer, pads table rows and drops a table with one column", () => {
    const notes = parseShortNotes({
      summary: "Cells are the unit of life.",
      keyPoints: ["Cell theory", "", "Organelles"],
      terms: [{ term: "Nucleus", meaning: "Control centre" }, { term: "", meaning: "x" }],
      formulas: [],
      table: { headers: ["Plant cell", "Animal cell"], rows: [["Cell wall"], ["Large vacuole", "Small vacuoles"]] },
      memoryTips: [],
      selfCheck: ["What is a cell?"],
    });
    expect(notes?.keyPoints).toEqual(["Cell theory", "Organelles"]);
    expect(notes?.terms).toEqual([{ term: "Nucleus", meaning: "Control centre" }]);
    expect(notes?.table?.rows[0]).toEqual(["Cell wall", ""]);
    expect(parseShortNotes({ summary: "x", keyPoints: [], table: { headers: ["Only"], rows: [["a"]] } })?.table).toBeNull();
    expect(parseShortNotes({})).toBeNull();
    const text = shortNotesAsText(notes!);
    expect(text).toContain("Key points\n• Cell theory");
    expect(text).toContain("Plant cell | Animal cell");
    expect(text).toContain("Test yourself\n1. What is a cell?");
  });

  it("sends at most one long chapter of text", () => {
    const chunks = Array.from({ length: 200 }, (_, i) => ({ text: `${"word ".repeat(80)}${i}` }));
    expect(chapterTextForShortNotes(chunks).length).toBe(SHORT_NOTES_MAX_CHARS);
    expect(chapterTextForShortNotes([{ text: "  a  " }, { text: "" }, { text: "b" }])).toBe("a\nb");
  });

  it("costs what we told the owner, and short notes count as two helps", () => {
    expect(worstCaseAiNotesCostInr("photo")).toBeLessThan(1.2);
    expect(worstCaseAiNotesCostInr("short")).toBeLessThan(3.5);
    expect(helpCost("photo_notes")).toBe(1);
    expect(helpCost("short_notes")).toBe(2);
  });
});
