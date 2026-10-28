import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PdfPageCanvas } from "@/components/reader/PdfPageCanvas";
import type { CitationReadyChunk } from "@/lib/reader/extractor";

const chunk: CitationReadyChunk = {
  chunk_id: "doc-sample-p1-c0",
  document_id: "doc-sample",
  page_number: 1,
  section_heading: "CHAPTER 6 WORK AND ENERGY",
  text: "The formula is W = F x d.",
  bounding_box: { x: 0, y: 0, width: 1, height: 1 },
  token_estimate: 8,
};

describe("PDF text layer while a page is still rendering", () => {
  it("keeps the passage selectable before the canvas finishes, including after zoom", () => {
    const theme = { textSecondaryHex: "#645147" } as React.ComponentProps<
      typeof PdfPageCanvas
    >["theme"];
    const { rerender } = render(
      <PdfPageCanvas
        pageNumber={1}
        isActivePage
        zoomScale={1}
        pdfBytes={new Uint8Array([37, 80, 68, 70])}
        pageChunks={[chunk]}
        theme={theme}
        marks={[]}
        onPageGeometry={() => undefined}
        onAddMark={() => undefined}
        onAddNote={() => undefined}
        onSelection={() => undefined}
      />
    );
    const layer = screen.getByTestId("pdf-text-layer");
    expect(layer.getAttribute("data-align")).toBe("flow");
    expect(layer.textContent).toMatch(/W = F x d/);

    rerender(
      <PdfPageCanvas
        pageNumber={1}
        isActivePage
        zoomScale={1.25}
        pdfBytes={new Uint8Array([37, 80, 68, 70])}
        pageChunks={[chunk]}
        theme={theme}
        marks={[]}
        onPageGeometry={() => undefined}
        onAddMark={() => undefined}
        onAddNote={() => undefined}
        onSelection={() => undefined}
      />
    );
    expect(screen.getByTestId("pdf-text-layer").textContent).toMatch(/W = F x d/);
    expect(screen.getByTestId("pdf-mounted-page-1").getAttribute("data-render")).not.toBeNull();
  });
});
