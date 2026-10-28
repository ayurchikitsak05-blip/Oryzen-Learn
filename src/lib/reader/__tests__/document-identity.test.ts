import { afterEach, describe, expect, it } from "vitest";
import { collectAnnotations } from "@/lib/reader/annotations";
import {
  chunksStoredOnBook,
  isSavedBookId,
  noteListedForBook,
} from "@/lib/reader/document-identity";
import type { CitationReadyChunk } from "@/lib/reader/extractor";
import { markForPassageQuote, marksOnSurface } from "@/lib/reader/highlight-anchor";
import { readTextMarks, writeTextMarks } from "@/lib/reader/marks";
import { SEALED_PRIVATE_KEY } from "@/lib/privacy/account-vault";
import { unlockTestVault } from "@/test/unlock-vault";

const SAMPLE_SLUG = "work-and-energy-chapter";
const SAVED_BOOK = "doc-6d80880738eb";
const OTHER_BOOK = "doc-bbbbbbbbbbbb";
const PASSAGE =
  "In physics, work is done only when a force moves an object along a path. The formula is W = F x d.";
const QUOTE = "W = F x d";

const sampleChunk: CitationReadyChunk = {
  chunk_id: `${SAMPLE_SLUG}-p1-c1`,
  document_id: SAMPLE_SLUG,
  page_number: 1,
  section_heading: "CHAPTER 6 WORK AND ENERGY",
  text: PASSAGE,
  bounding_box: { x: 0, y: 0, width: 1, height: 1 },
  token_estimate: 24,
};

const otherBookChunk: CitationReadyChunk = {
  ...sampleChunk,
  chunk_id: `${OTHER_BOOK}-p1-c1`,
  document_id: OTHER_BOOK,
  text: "This paragraph belongs to another saved book.",
};

describe("sample book identity in the annotations list", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("lists the saved quotation when the chunk still carries the indexer slug", () => {
    expect(isSavedBookId(SAVED_BOOK)).toBe(true);
    expect(isSavedBookId(SAMPLE_SLUG)).toBe(false);
    const mark = markForPassageQuote([sampleChunk], 1, QUOTE, "highlight");
    expect(mark?.chunkId).toBe(sampleChunk.chunk_id);
    const glyph = `${"x".repeat(PASSAGE.indexOf(QUOTE))}e moves an, where the formula is ${QUOTE}.`;
    const painted = marksOnSurface(PASSAGE, glyph, [{ start: mark!.start, end: mark!.end }]);
    expect(glyph.slice(painted[0].start, painted[0].end)).toBe(QUOTE);

    const listed = collectAnnotations({
      documentId: SAVED_BOOK,
      chunks: [sampleChunk],
      marks: [mark!],
      notes: [
        {
          id: "note-1",
          documentId: SAMPLE_SLUG,
          pageNumber: 1,
          sectionHeading: sampleChunk.section_heading,
          quote: QUOTE,
          body: "Work equals force times displacement.",
          createdAt: "2026-10-28T00:00:00.000Z",
        },
      ],
    });
    expect(listed.map((item) => item.quote)).toEqual([QUOTE, QUOTE]);
    expect(listed[0]?.kind).toBe("highlight");
  });

  it("does not claim a highlight or note that already belongs to another saved book", () => {
    const foreignMark = {
      chunkId: otherBookChunk.chunk_id,
      start: 0,
      end: 12,
      kind: "highlight" as const,
    };
    const listed = collectAnnotations({
      documentId: SAVED_BOOK,
      chunks: [sampleChunk, otherBookChunk],
      marks: [foreignMark],
      notes: [
        {
          id: "note-other",
          documentId: OTHER_BOOK,
          pageNumber: 1,
          sectionHeading: "Other",
          quote: "private to the other book",
          body: "leave this book",
          createdAt: "2026-10-28T00:00:00.000Z",
        },
      ],
    });
    expect(listed).toEqual([]);
    expect(noteListedForBook(OTHER_BOOK, SAVED_BOOK, [sampleChunk])).toBe(false);
  });

  it("keeps the first account's annotation sealed and invisible to the second account", async () => {
    const mark = markForPassageQuote([sampleChunk], 1, QUOTE, "highlight");
    await unlockTestVault("reader-a");
    writeTextMarks(
      [{ id: "mark-1", chunkId: mark!.chunkId, start: mark!.start, end: mark!.end, kind: "highlight" }],
      "reader-a"
    );
    await unlockTestVault("reader-b");
    const otherAccount = collectAnnotations({
      documentId: SAVED_BOOK,
      chunks: [sampleChunk],
      marks: readTextMarks("reader-b"),
      notes: [],
    });
    expect(otherAccount).toEqual([]);
    await unlockTestVault("reader-a");
    const owner = collectAnnotations({
      documentId: SAVED_BOOK,
      chunks: [sampleChunk],
      marks: readTextMarks("reader-a"),
      notes: [],
    });
    expect(owner.map((item) => item.quote)).toEqual([QUOTE]);
    const sealed = window.localStorage.getItem(SEALED_PRIVATE_KEY) ?? "";
    expect(sealed.length).toBeGreaterThan(0);
    expect(sealed.includes(QUOTE)).toBe(false);
  });

  it("stamps the saved book id onto a new chapter without moving chunk ids or another book", () => {
    const stored = chunksStoredOnBook(SAVED_BOOK, [sampleChunk, otherBookChunk]);
    expect(stored[0]?.chunk_id).toBe(sampleChunk.chunk_id);
    expect(stored[0]?.document_id).toBe(SAVED_BOOK);
    expect(stored[1]?.document_id).toBe(OTHER_BOOK);
    expect(sampleChunk.document_id).toBe(SAMPLE_SLUG);
  });
});
