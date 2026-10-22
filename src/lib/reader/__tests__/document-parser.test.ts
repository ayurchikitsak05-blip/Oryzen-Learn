import { describe, expect, it } from "vitest";
import { buildEmbeddedAyurvedaSamplePdf } from "../storage";
import {
  extractedTextSwappedSample,
  parseAndIndexUploadedPdf,
  PARSER_SAMPLE_SWAP_MARKER,
  scrapePdfStreamPages,
} from "../document-parser";

const MATH_LINES = [
  "AREA OF A RECTANGLE | The area of a rectangle is length times width. If the length is 8 cm and the width is 5 cm, the area is 40 square centimetres.",
  "UNITS | Keep the units with the number. 40 square centimetres is not the same as 40 centimetres.",
];

const SCIENCE_LINES = [
  "NEWTON'S FIRST LAW | An object keeps a constant velocity unless a net force acts on it.",
  "FORCE AND MASS | A net force changes velocity. Mass resists that change.",
];

describe("reader document parser", () => {
  it("scrapes original math text from an uploaded PDF and never invents Ayurveda pages", () => {
    const bytes = buildEmbeddedAyurvedaSamplePdf(MATH_LINES);
    const scraped = scrapePdfStreamPages(bytes);
    const joined = scraped.pages.join(" ");
    expect(joined).toMatch(/rectangle|length times width|40 square/i);
    expect(joined).not.toContain(PARSER_SAMPLE_SWAP_MARKER);
    expect(extractedTextSwappedSample(bytes, joined)).toBe(false);
  });

  it("refuses a silent Ayurveda swap when the original file is science", () => {
    const bytes = buildEmbeddedAyurvedaSamplePdf(SCIENCE_LINES);
    expect(
      extractedTextSwappedSample(bytes, `${PARSER_SAMPLE_SWAP_MARKER} Balance supports clear grasping.`)
    ).toBe(true);
    expect(
      extractedTextSwappedSample(bytes, "An object keeps a constant velocity unless a net force acts on it.")
    ).toBe(false);
  });

  it("falls back to original stream text when pdf.js fails", async () => {
    const bytes = buildEmbeddedAyurvedaSamplePdf(MATH_LINES);
    const parsed = await parseAndIndexUploadedPdf({
      bytes,
      documentId: "math-rect",
      extractWithPdfjs: async () => {
        throw new Error("pdfjs timeout");
      },
    });
    expect(parsed.preservedOriginalText).toBe(true);
    expect(parsed.source).toBe("pdf_stream_text");
    expect(parsed.parseError).toBeNull();
    const joined = parsed.chunks.map((chunk) => chunk.text).join(" ");
    expect(joined).toMatch(/rectangle|40 square/i);
    expect(joined).not.toContain(PARSER_SAMPLE_SWAP_MARKER);
  });

  it("keeps the original file readable when no text can be extracted", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 empty stream %%EOF");
    const parsed = await parseAndIndexUploadedPdf({
      bytes,
      documentId: "empty",
      extractWithPdfjs: async () => {
        throw new Error("unreadable");
      },
    });
    expect(parsed.preservedOriginalText).toBe(true);
    expect(parsed.chunks).toEqual([]);
    expect(parsed.parseError).toMatch(/original file is still open/i);
    expect(parsed.chunks.join("")).not.toContain(PARSER_SAMPLE_SWAP_MARKER);
  });
});
