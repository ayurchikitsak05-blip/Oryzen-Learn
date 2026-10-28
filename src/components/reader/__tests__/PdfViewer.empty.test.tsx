import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const library: {
  docs: Array<{
    id: string;
    title: string;
    fileName: string;
    fileHash: string;
    fileSize: number;
    pageCount: number;
    storageBackend: "indexeddb";
    opfsPath: null;
    chapters: unknown[];
    chunks: unknown[];
    lastReadPage: number;
    createdAt: string;
    updatedAt: string;
  }>;
  failSaves: boolean;
} = { docs: [], failSaves: true };

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/reader",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/session", () => ({
  fetchSignedInUser: vi.fn(async () => ({ userId: "student-a", email: null })),
}));

vi.mock("@/lib/privacy/account-vault", async () => {
  const actual = await vi.importActual<typeof import("@/lib/privacy/account-vault")>(
    "@/lib/privacy/account-vault"
  );
  return {
    ...actual,
    ensureAccountVault: vi.fn(async () => true),
    lockAccountVault: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/reader/sample-chapter", () => ({
  SAMPLE_CHAPTER_FILE: "science-work-energy-chapter.pdf",
  SAMPLE_CHAPTER_TITLE: "Work and Energy — Sample Chapter",
  buildRectangleAreaSamplePdf: () => new Uint8Array([1]),
  buildSampleTextbookChapterPdf: () => new Uint8Array([1]),
}));

vi.mock("@/lib/reader/document-parser", () => ({
  parseAndIndexUploadedPdf: vi.fn(async () => ({
    pageCount: 1,
    chapters: [{ title: "Current", pageNumber: 1 }],
    chunks: [
      {
        chunk_id: "chunk-1",
        document_id: "circuit",
        page_number: 1,
        text: "A closed circuit carries two coulombs.",
        section_heading: "Current",
      },
    ],
    source: "unparsed",
    parseError: null,
    preservedOriginalText: true,
  })),
}));

vi.mock("@/lib/reader/storage", () => ({
  buildEmbeddedAyurvedaSamplePdf: () => new Uint8Array([1]),
  listLocalPdfDocuments: vi.fn(async () => library.docs),
  getLocalPdfBinary: vi.fn(async (id: string) => (library.docs.some((doc) => doc.id === id) ? new Uint8Array([1]) : null)),
  removeLocalPdfDocument: vi.fn(async () => undefined),
  updateLocalPdfMetadata: vi.fn(async () => undefined),
  saveLocalPdfDocument: vi.fn(async (params: {
    title: string;
    fileName: string;
    pageCount: number;
    chapters?: unknown[];
    chunks?: unknown[];
    pdfBytes: Uint8Array;
  }) => {
    if (library.failSaves) {
      throw new Error("Sign in is required before a book can be saved on this device.");
    }
    const record = {
      id: params.title,
      title: params.title,
      fileName: params.fileName,
      fileHash: "hash",
      fileSize: params.pdfBytes.byteLength,
      pageCount: params.pageCount,
      storageBackend: "indexeddb" as const,
      opfsPath: null,
      chapters: params.chapters ?? [],
      chunks: params.chunks ?? [],
      lastReadPage: 1,
      createdAt: "2026-10-27T00:00:00.000Z",
      updatedAt: "2026-10-27T00:00:00.000Z",
    };
    library.docs = [record];
    return { document: record, isDuplicate: false };
  }),
}));

import PdfViewer from "../PdfViewer";

describe("PDF reader empty state", () => {
  beforeEach(() => {
    library.docs = [];
    library.failSaves = true;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    HTMLElement.prototype.scrollTo = () => undefined;
  });

  it("centers an invitation and keeps document controls quiet when no PDF is open", async () => {
    const view = render(<PdfViewer />);
    const empty = await view.findByTestId("pdf-empty-state");
    expect(empty.textContent).toMatch(/Open a document to start reading/);
    expect(empty.className).toMatch(/items-center|text-center/);
    expect(view.container.querySelector("canvas")).toBeNull();
    expect(view.getByTestId("reader-page-indicator").textContent).toBe("—");
    for (const label of ["Zoom In", "Zoom Out", "Previous Page", "Next Page", "Ask My Book", "Contents", "Pages", "Notes"]) {
      expect((view.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect((view.getByTestId("fit-page-btn") as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByTestId("transform-open") as HTMLButtonElement).disabled).toBe(true);
    expect(view.getByText("Open").closest("label")).toBeTruthy();
    const toolbar = view.getByTestId("reader-toolbar");
    expect(toolbar.className).toContain("min-w-0");
    expect(toolbar.className).toContain("max-w-full");
    expect(toolbar.className).toContain("max-[390px]:flex-wrap");
    expect(toolbar.className).toContain("max-[390px]:overflow-x-hidden");
    expect(view.getByRole("button", { name: "Transform" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Ask My Book" })).toBeTruthy();
  });

  it("opens an uploaded PDF and restores the page controls", async () => {
    const view = render(<PdfViewer />);
    await view.findByTestId("pdf-empty-state");
    library.failSaves = false;
    const input = view.container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error("Missing file input");
    const file = new File([new Uint8Array([37, 80, 68, 70])], "circuit.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(view.getByTestId("reader-upload-status").textContent).toMatch(/ready to read/i);
    });
    expect(view.queryByTestId("pdf-empty-state")).toBeNull();
    expect(view.getByLabelText("PDF Canvas Page 1")).toBeTruthy();
    expect(view.getByLabelText("Document")).toBeTruthy();
    expect((view.getByRole("button", { name: "Zoom In" }) as HTMLButtonElement).disabled).toBe(false);
    expect((view.getByRole("button", { name: "Ask My Book" }) as HTMLButtonElement).disabled).toBe(false);
    expect(view.getByTestId("reader-page-indicator").textContent).toMatch(/1 \/ 1/);
  });
});
