import { describe, expect, it } from "vitest";
import { answerFromTextbook, composeStudyNotes } from "@/lib/vaults/compose";
import { buildPlainPdf, downloadBlob, safeDownloadName } from "@/lib/vaults/download";
import { MAX_TEXTBOOK_PAGES } from "@/lib/vaults/extract-pdf";
import { isOwnedVaultPath, vaultStoragePath } from "@/lib/vaults/paths";
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

  it("keeps textbook extraction bounded and stores files under the owner path", () => {
    expect(MAX_TEXTBOOK_PAGES).toBe(80);
    const path = vaultStoragePath("user-1", "vault-1", "source-1");
    expect(path).toBe("users/user-1/vaults/vault-1/source-1.pdf");
    expect(isOwnedVaultPath(path, "user-1", "vault-1")).toBe(true);
    expect(isOwnedVaultPath(path, "user-2", "vault-1")).toBe(false);
  });

  it("triggers a named file download for markdown, text, and PDF", () => {
    const clicked: string[] = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function clickStub() {
      clicked.push(this.download);
    };
    try {
      downloadBlob(safeDownloadName("CNS Notes", "md"), new Blob(["# note"], { type: "text/markdown" }));
      downloadBlob(safeDownloadName("CNS Notes", "txt"), new Blob(["note"], { type: "text/plain" }));
      downloadBlob(
        safeDownloadName("CNS Notes", "pdf"),
        new Blob([new Uint8Array(buildPlainPdf("Notes", "Body"))], {
          type: "application/pdf",
        })
      );
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
    }
    expect(clicked).toEqual(["cns-notes.md", "cns-notes.txt", "cns-notes.pdf"]);
  });
});
