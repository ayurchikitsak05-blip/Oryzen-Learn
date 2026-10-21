import { describe, expect, it } from "vitest";
import {
  chunksForChapter,
  composeChapterRevisionSheet,
  listTransformChapters,
} from "../transform";
import type { CitationReadyChunk } from "../extractor";

const chunks: CitationReadyChunk[] = [
  {
    chunk_id: "c1",
    document_id: "doc-1",
    page_number: 1,
    section_heading: "CHAPTER 1: FORCES",
    text: "A net force changes velocity. Newton's first law says an object keeps its motion unless a net force acts.",
    bounding_box: { x: 1, y: 1, width: 10, height: 10 },
    token_estimate: 24,
  },
  {
    chunk_id: "c2",
    document_id: "doc-1",
    page_number: 4,
    section_heading: "CHAPTER 2: ENERGY",
    text: "Work transfers energy. Kinetic energy depends on mass and speed.",
    bounding_box: { x: 1, y: 1, width: 10, height: 10 },
    token_estimate: 16,
  },
];

describe("Transform My Book local slice", () => {
  it("lists extracted chapters and scopes chunks to one chapter", () => {
    const document = {
      chapters: [
        { title: "CHAPTER 1: FORCES", pageNumber: 1 },
        { title: "CHAPTER 2: ENERGY", pageNumber: 4 },
      ],
      chunks,
      pageCount: 8,
    };
    expect(listTransformChapters(document)).toHaveLength(2);
    const first = chunksForChapter(document, document.chapters[0]);
    expect(first).toHaveLength(1);
    expect(first[0].text).toMatch(/Newton/);
    expect(first[0].text).not.toMatch(/Kinetic/);
  });

  it("builds a revision sheet from one chapter without using the whole book", () => {
    const sheet = composeChapterRevisionSheet({
      documentId: "doc-1",
      chapter: { title: "CHAPTER 1: FORCES", pageNumber: 1 },
      chunks: [chunks[0]],
    });
    expect(sheet.edition).toBe("revision_sheet");
    expect(sheet.summary).toMatch(/force|Newton|velocity/i);
    expect(sheet.keyPoints.length).toBeGreaterThanOrEqual(2);
    expect(sheet.selfCheck[0]).toMatch(/CHAPTER 1/);
  });
});
