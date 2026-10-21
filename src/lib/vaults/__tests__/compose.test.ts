import { describe, expect, it } from "vitest";
import { answerFromTextbook, composeStudyNotes } from "@/lib/vaults/compose";
import { buildPlainPdf } from "@/lib/vaults/download";
import { annotationsToMarkdown } from "@/lib/reader/annotations";

describe("subject vault study material", () => {
  it("builds structured notes from textbook text", () => {
    const markdown = composeStudyNotes([
      {
        title: "Sushruta Samhita - Sutrasthana",
        excerpt: "CHAPTER 1\n\nThe opening sutra describes the aim of study and the order of reading.",
      },
    ]);
    expect(markdown).toContain("Key concepts");
    expect(markdown).toContain("CHAPTER 1");
    expect(markdown.toLowerCase()).not.toContain("compendium");
  });

  it("answers from a matching textbook passage", () => {
    const answer = answerFromTextbook("What is the aim of study?", [
      {
        title: "Sutra",
        excerpt: "The opening sutra describes the aim of study and the order of reading.",
      },
    ]);
    expect(answer).toContain("aim of study");
  });

  it("exports a real PDF payload and annotation markdown", () => {
    const pdf = new TextDecoder().decode(buildPlainPdf("Notes", "A short study note."));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    const markdown = annotationsToMarkdown("Reader", [
      {
        kind: "highlight",
        pageNumber: 2,
        sectionHeading: "CNS",
        quote: "Dopamine pathways",
      },
    ]);
    expect(markdown).toContain("Page 2");
    expect(markdown.toLowerCase()).not.toContain("compendium");
  });
});
