import { describe, expect, it } from "vitest";
import {
  extractDocumentCitationIndex,
  looksGlyphShifted,
  repairShiftedGlyphItems,
  repairStoredBookText,
  tidyChapters,
  unshiftGlyphText,
} from "../extractor";

const SP = "\u0003";
const shifted = (text: string) => [...text].map((ch) => String.fromCharCode(ch.charCodeAt(0) - 29)).join("");

describe("shifted-font text (publisher PDFs)", () => {
  it("reads the garbled Contents lines from the Shanbhag book correctly", () => {
    expect(unshiftGlyphText(`*URZWK${SP}KRUPRQH`)).toBe("Growth hormone");
    expect(unshiftGlyphText("+\\SHUVHFUHWLRQ")).toBe("Hypersecretion");
    expect(shifted("Growth hormone")).toBe(`*URZWK${SP}KRUPRQH`);
  });

  it("leaves normal text alone", () => {
    for (const text of ["306 PHARMACOLOGY FOR MEDICAL GRADUATES", "Phenobarbitone is an antiepileptic drug.", "Index 505"]) {
      expect(looksGlyphShifted(text)).toBe(false);
    }
    const items = [{ str: "Phenobarbitone is used in status epilepticus." }];
    expect(repairShiftedGlyphItems(items)).toBe(items);
  });

  it("repairs only the shifted items on a mixed page", () => {
    const items = [{ str: shifted("Growth hormone") }, { str: "306 PHARMACOLOGY FOR MEDICAL GRADUATES" }];
    expect(repairShiftedGlyphItems(items).map((item) => item.str)).toEqual([
      "Growth hormone",
      "306 PHARMACOLOGY FOR MEDICAL GRADUATES",
    ]);
  });

  it("keeps running page headers out of Contents", () => {
    const chapters = [
      { title: "5—DRUGS ACTING ON CENTRAL NERVOUS SYSTEM", pageNumber: 164 },
      { title: "306 PHARMACOLOGY FOR MEDICAL GRADUATES", pageNumber: 306 },
      { title: "308 PHARMACOLOGY FOR MEDICAL GRADUATES", pageNumber: 308 },
      { title: "310 PHARMACOLOGY FOR MEDICAL GRADUATES", pageNumber: 310 },
      { title: `*URZWK${SP}KRUPRQH`, pageNumber: 324 },
    ];
    expect(tidyChapters(chapters).map((c) => c.title)).toEqual([
      "5—DRUGS ACTING ON CENTRAL NERVOUS SYSTEM",
      "Growth hormone",
    ]);
  });

  it("repairs a book saved before the fix", () => {
    const fixed = repairStoredBookText({
      chapters: [{ title: `*URZWK${SP}KRUPRQH`, pageNumber: 324 }],
      chunks: [{ text: `${shifted("Growth hormone")} causes gigantism`, section_heading: `*URZWK${SP}KRUPRQH` }],
    });
    expect(fixed.chapters[0].title).toBe("Growth hormone");
    expect(fixed.chunks[0].text).toBe("Growth hormone causes gigantism");
  });

  it("indexes a shifted page as readable text", () => {
    const index = extractDocumentCitationIndex({
      documentId: "doc",
      pages: [
        {
          pageNumber: 1,
          items: [
            { str: shifted("GROWTH HORMONE"), transform: [20, 0, 0, 20, 50, 700], width: 200, height: 20 },
            { str: shifted("Hypersecretion causes gigantism in children."), transform: [10, 0, 0, 10, 50, 650], width: 300, height: 10 },
          ] as never,
        },
      ],
    });
    expect(index.chunks.map((chunk) => chunk.text).join(" ")).toContain("Hypersecretion causes gigantism");
  });
});
