import { describe, expect, it } from "vitest";
import { buildStudyExport, exportFileName, notesAsText } from "../study-export";

const NOW = new Date("2026-11-15T10:00:00Z");
const SUBJECTS = [
  { id: "s1", title: "Physics" },
  { id: "s2", title: "Biology" },
];
const NOTES = [
  { id: "n1", subject_id: "s1", title: "Newton's first law", body: "Inertia.", updated_at: "2026-11-01" },
  { id: "n2", subject_id: "s2", title: "Cell", body: null, updated_at: "2026-11-02" },
  { id: "n3", subject_id: "gone", title: "", body: "Loose note", updated_at: "2026-11-03" },
];

describe("download my study data", () => {
  it("keeps notes and device records, parsing JSON records back into data", () => {
    const file = buildStudyExport({
      subjects: SUBJECTS,
      notes: NOTES,
      records: { oryzen_study_roadmap_v1: '{"id":"r1"}', oryzen_reader_view_v1: "two-page" },
      now: NOW,
    });
    expect(file).toMatchObject({ app: "ORYZEN Learn", version: 1, exportedAt: "2026-11-15T10:00:00.000Z" });
    expect(file.notes.notes).toHaveLength(3);
    expect(file.deviceRecords).toEqual({ oryzen_reader_view_v1: "two-page", oryzen_study_roadmap_v1: { id: "r1" } });
  });

  it("writes readable notes grouped by subject", () => {
    const text = notesAsText(SUBJECTS, NOTES, NOW);
    expect(text).toContain("=== Biology ===");
    expect(text.indexOf("Biology")).toBeLessThan(text.indexOf("Physics"));
    expect(text).toContain("## Newton's first law\nInertia.");
    expect(text).toContain("=== Other notes ===");
    expect(text).toContain("## Untitled\nLoose note");
    expect(notesAsText([], [], NOW)).toContain("No notes saved yet.");
  });

  it("names files with the date", () => {
    expect(exportFileName("json", NOW)).toBe("oryzen-study-data-2026-11-15.json");
    expect(exportFileName("txt", NOW)).toBe("oryzen-notes-2026-11-15.txt");
  });
});
