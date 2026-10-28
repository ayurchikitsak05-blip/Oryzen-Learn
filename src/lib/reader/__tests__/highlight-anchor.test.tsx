import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import PassageText from "@/components/reader/PassageText";
import { collectAnnotations } from "@/lib/reader/annotations";
import type { CitationReadyChunk } from "@/lib/reader/extractor";
import {
  locateQuote,
  markForPassageQuote,
  marksOnSurface,
  selectionOffsetsInPassage,
} from "@/lib/reader/highlight-anchor";
import { readTextMarks, writeTextMarks } from "@/lib/reader/marks";
import { SEALED_PRIVATE_KEY } from "@/lib/privacy/account-vault";
import { unlockTestVault } from "@/test/unlock-vault";

const PASSAGE =
  "In physics, work is done only when a force moves an object along a path. The formula is W = F x d.";
const QUOTE = "W = F x d";

function glyphSurface(passage: string, quote: string): string {
  const at = passage.indexOf(quote);
  return `${"x".repeat(at)}e moves an, where W is work, F is force, and the formula is ${quote}.`;
}

const chunk: CitationReadyChunk = {
  chunk_id: "doc-sample-p1-c0",
  document_id: "doc-sample",
  page_number: 1,
  section_heading: "CHAPTER 6 WORK AND ENERGY",
  text: PASSAGE,
  bounding_box: { x: 0, y: 0, width: 1, height: 1 },
  token_estimate: 24,
};

describe("highlight anchors", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("keeps a saved quote on the passage when the glyph layer would reuse the old offsets", () => {
    const located = locateQuote(PASSAGE, QUOTE);
    expect(located).toBeTruthy();
    const surface = glyphSurface(PASSAGE, QUOTE);
    expect(surface.slice(located!.start, located!.end)).toBe("e moves a");
    const painted = marksOnSurface(PASSAGE, surface, [{ start: located!.start, end: located!.end }]);
    expect(painted).toHaveLength(1);
    expect(surface.slice(painted[0].start, painted[0].end)).toBe(QUOTE);
  });

  it("turns a glyph-layer selection into passage offsets and lists that quote", () => {
    const surface = glyphSurface(PASSAGE, QUOTE);
    const onScreen = surface.indexOf(QUOTE);
    const anchored = selectionOffsetsInPassage(PASSAGE, QUOTE, onScreen, onScreen + QUOTE.length, surface);
    expect(anchored).toEqual(locateQuote(PASSAGE, QUOTE));
    expect(PASSAGE.slice(anchored!.start, anchored!.end)).toBe(QUOTE);

    const mark = markForPassageQuote([chunk], 1, QUOTE, "highlight");
    expect(mark?.chunkId).toBe(chunk.chunk_id);
    const listed = collectAnnotations({
      documentId: chunk.document_id,
      chunks: [chunk],
      marks: mark ? [mark] : [],
      notes: [],
    });
    expect(listed.map((item) => item.quote)).toEqual([QUOTE]);

    const wrongLayer = collectAnnotations({
      documentId: chunk.document_id,
      chunks: [chunk],
      marks: [{ chunkId: chunk.chunk_id, start: surface.length + 4, end: surface.length + 20, kind: "highlight" }],
      notes: [],
    });
    expect(wrongLayer).toEqual([]);
  });

  it("does not save a highlight when the selected words are not in the passage", () => {
    expect(markForPassageQuote([chunk], 1, "where W is work", "highlight")).toBeNull();
  });

  it("stores the quote for one account and leaves the other account empty", async () => {
    const mark = markForPassageQuote([chunk], 1, QUOTE, "highlight");
    expect(mark).toBeTruthy();
    await unlockTestVault("reader-a");
    writeTextMarks(
      [{ id: "mark-1", chunkId: mark!.chunkId, start: mark!.start, end: mark!.end, kind: "highlight" }],
      "reader-a"
    );
    await unlockTestVault("reader-b");
    expect(readTextMarks("reader-b")).toEqual([]);
    await unlockTestVault("reader-a");
    const restored = readTextMarks("reader-a");
    expect(restored).toHaveLength(1);
    expect(PASSAGE.slice(restored[0].start, restored[0].end)).toBe(QUOTE);
    const sealed = window.localStorage.getItem(SEALED_PRIVATE_KEY) ?? "";
    expect(sealed.length).toBeGreaterThan(0);
    expect(sealed.includes(QUOTE)).toBe(false);
    expect(readTextMarks("reader-b")).toEqual([]);
  });

  it("keeps a page highlight on that passage after zoom and off the next page", () => {
    const pageTwo = "Only the part of the force along the displacement counts as work.";
    const pageOne = markForPassageQuote(
      [chunk, { ...chunk, chunk_id: "doc-sample-p2-c0", page_number: 2, text: pageTwo }],
      1,
      QUOTE,
      "highlight"
    );
    expect(pageOne?.chunkId).toBe(chunk.chunk_id);
    const zoomed = glyphSurface(PASSAGE, QUOTE);
    const painted = marksOnSurface(PASSAGE, zoomed, [{ start: pageOne!.start, end: pageOne!.end }]);
    expect(zoomed.slice(painted[0].start, painted[0].end)).toBe(QUOTE);
    render(
      <PassageText
        chunkId="doc-sample-p2-c0"
        text={pageTwo}
        marks={[{ id: "mark-1", chunkId: pageOne!.chunkId, start: pageOne!.start, end: pageOne!.end, kind: "highlight" }]}
        overlay
        onAddMark={() => undefined}
        onExplain={() => undefined}
        onAddNote={() => undefined}
      />
    );
    const highlighted = [...document.querySelectorAll(".bg-selected")].map((node) => node.textContent ?? "").join("");
    expect(highlighted).not.toContain(QUOTE);
  });
});

describe("PassageText highlight painting", () => {
  it("keeps the same words highlighted after the glyph layer and a zoom change", () => {
    const located = locateQuote(PASSAGE, QUOTE)!;
    const surface = glyphSurface(PASSAGE, QUOTE);
    const line = (zoom: number) => ({
      text: surface,
      left: 12 * zoom,
      top: 40 * zoom,
      fontSize: 12 * zoom,
      width: 480 * zoom,
      height: 16 * zoom,
    });
    const mark = {
      id: "mark-1",
      chunkId: "doc-sample-p1-c0",
      start: located.start,
      end: located.end,
      kind: "highlight" as const,
    };
    const props = {
      chunkId: "doc-sample-p1-c0",
      text: PASSAGE,
      marks: [mark],
      overlay: true,
      onAddMark: () => undefined,
      onExplain: () => undefined,
      onAddNote: () => undefined,
    };
    const { rerender } = render(<PassageText {...props} placedLines={[line(1)]} />);
    const highlighted = () =>
      [...document.querySelectorAll(".bg-selected")].map((node) => node.textContent ?? "").join("");
    expect(highlighted()).toContain(QUOTE);
    expect(highlighted()).not.toContain("e moves an");

    rerender(<PassageText {...props} placedLines={[line(1.25)]} />);
    expect(highlighted()).toContain(QUOTE);
    expect(highlighted()).not.toContain("e moves an");
  });
});
