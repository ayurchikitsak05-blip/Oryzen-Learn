import { beforeEach, describe, expect, it } from "vitest";
import {
  computeSha256Hex,
  findDuplicateDocumentByHash,
  hashPdfBinary,
} from "../hashing";
import {
  clampReaderZoom,
  computeThreePageWindow,
  ensurePdfWorkerConfigured,
  isPageInRamWindow,
  MAX_READER_ZOOM,
  MIN_READER_ZOOM,
  PDFJS_CDN_WORKER_FALLBACK,
} from "../pdf-worker";
import {
  buildEmbeddedAyurvedaSamplePdf,
  clearAllLocalPdfStorage,
  getLocalPdfBinary,
  getLocalPdfDocument,
  listLocalPdfDocuments,
  saveLocalPdfDocument,
  updateLocalPdfMetadata,
} from "../storage";
import {
  extractDocumentCitationIndex,
  extractPageCitationChunksFromTextItems,
  isLikelySectionHeading,
  type RawPdfTextItem,
} from "../extractor";

describe("Layer 2: Tablet-First PDF Engine & Local-First Storage Pipeline", () => {
  beforeEach(async () => {
    await clearAllLocalPdfStorage();
  });

  describe("1. PDF Worker & 3-Page Virtualized RAM Window (pdf-worker.ts)", () => {
    it("configures pdfjs-dist worker URL safely", async () => {
      const configuredSrc = await ensurePdfWorkerConfigured();
      expect(configuredSrc).toBe(PDFJS_CDN_WORKER_FALLBACK);
    });

    it("computes the strict 3-Page RAM Window [Page N-1, Page N, Page N+1] for boundary and middle pages", () => {
      // Page 1 of 500 -> only [1, 2]
      expect(computeThreePageWindow(1, 500)).toEqual([1, 2]);

      // Page 250 of 500 -> strictly [249, 250, 251]
      const middleWindow = computeThreePageWindow(250, 500);
      expect(middleWindow).toEqual([249, 250, 251]);
      expect(middleWindow.length).toBeLessThanOrEqual(3);

      // Final page 500 of 500 -> only [499, 500]
      expect(computeThreePageWindow(500, 500)).toEqual([499, 500]);

      // Single-page PDF -> [1]
      expect(computeThreePageWindow(1, 1)).toEqual([1]);

      // Verify off-window pages are excluded from RAM
      expect(isPageInRamWindow(248, 250, 500)).toBe(false);
      expect(isPageInRamWindow(249, 250, 500)).toBe(true);
      expect(isPageInRamWindow(250, 250, 500)).toBe(true);
      expect(isPageInRamWindow(251, 250, 500)).toBe(true);
      expect(isPageInRamWindow(252, 250, 500)).toBe(false);
    });

    it("clamps pinch-to-zoom scale within tablet ergonomic bounds", () => {
      expect(clampReaderZoom(0.2)).toBe(MIN_READER_ZOOM);
      expect(clampReaderZoom(5.0)).toBe(MAX_READER_ZOOM);
      expect(clampReaderZoom(1.356)).toBe(1.36);
    });
  });

  describe("1b. Fit-page and fit-width scales", () => {
    it("fits a complete page without stretching and can go below pinch-min for phones", async () => {
      const { computeFitPageScale, computeFitWidthScale } = await import(
        "../fit"
      );
      const page = { width: 612, height: 792 };
      const phone = { width: 390, height: 640 };
      const fitPage = computeFitPageScale(page, phone, 32);
      const fitWidth = computeFitWidthScale(page, phone, 32);
      expect(fitPage).toBeLessThanOrEqual(fitWidth);
      expect(Math.abs(page.width * fitPage) ).toBeLessThanOrEqual(phone.width);
      expect(Math.abs(page.height * fitPage)).toBeLessThanOrEqual(phone.height);
      expect(fitWidth).toBeGreaterThan(0.2);
    });

    it("persists page, zoom, and fit mode per document", async () => {
      const { writePersistedReaderView, readPersistedReaderView } = await import(
        "../fit"
      );
      writePersistedReaderView("doc-persist", {
        page: 7,
        zoom: 1.25,
        fitMode: "width",
        progress: 0.5,
      });
      expect(readPersistedReaderView("doc-persist")).toEqual({
        page: 7,
        zoom: 1.25,
        fitMode: "width",
        progress: 0.5,
      });
    });
  });

  describe("2. SHA-256 Hashing & Duplicate Detection (hashing.ts)", () => {
    it("produces deterministic 64-character SHA-256 hex digests for identical PDF binaries", async () => {
      const pdfBytesA = buildEmbeddedAyurvedaSamplePdf([
        "CHAPTER 1 | Energy and constitution",
      ]);
      const pdfBytesB = buildEmbeddedAyurvedaSamplePdf([
        "CHAPTER 1 | Energy and constitution",
      ]);
      const pdfBytesDifferent = buildEmbeddedAyurvedaSamplePdf([
        "CHAPTER 2 | Across the faculties",
      ]);

      const hashA = await computeSha256Hex(pdfBytesA);
      const hashB = await computeSha256Hex(pdfBytesB);
      const hashDiff = await computeSha256Hex(pdfBytesDifferent);

      expect(hashA).toHaveLength(64);
      expect(hashA).toBe(hashB);
      expect(hashA).not.toBe(hashDiff);

      const meta = await hashPdfBinary(pdfBytesA);
      expect(meta.fileHash).toBe(hashA);
      expect(meta.byteLength).toBe(pdfBytesA.byteLength);
    });

    it("detects duplicate uploads by SHA-256 hash", () => {
      const existing = [
        { id: "doc-1", fileHash: "abc123def456" },
        { id: "doc-2", fileHash: "999888777666" },
      ];
      expect(
        findDuplicateDocumentByHash("ABC123DEF456", existing)?.id
      ).toBe("doc-1");
      expect(
        findDuplicateDocumentByHash("000000000000", existing)
      ).toBeNull();
    });
  });

  describe("3. Local-First Storage Caching & Deduplication (storage.ts)", () => {
    it("stores a PDF locally, retrieves its binary and metadata, and deduplicates re-uploads via SHA-256", async () => {
      const sampleBytes = buildEmbeddedAyurvedaSamplePdf();

      const firstSave = await saveLocalPdfDocument({
        title: "Energy & Constitution Companion Vol 1",
        fileName: "energy-constitution-vol1.pdf",
        pdfBytes: sampleBytes,
        pageCount: 5,
      });

      expect(firstSave.isDuplicate).toBe(false);
      expect(firstSave.document.pageCount).toBe(5);
      expect(firstSave.document.fileSize).toBe(sampleBytes.byteLength);

      // Re-uploading the exact same PDF binary should be flagged as duplicate
      const secondSave = await saveLocalPdfDocument({
        title: "Energy & Constitution Companion Copy",
        fileName: "energy-constitution-copy.pdf",
        pdfBytes: sampleBytes,
        pageCount: 5,
      });

      expect(secondSave.isDuplicate).toBe(true);
      expect(secondSave.document.id).toBe(firstSave.document.id);

      const allDocs = await listLocalPdfDocuments();
      expect(allDocs).toHaveLength(1);

      const loadedDoc = await getLocalPdfDocument(firstSave.document.id);
      expect(loadedDoc?.title).toBe("Energy & Constitution Companion Vol 1");

      const loadedBinary = await getLocalPdfBinary(firstSave.document.id);
      expect(loadedBinary).not.toBeNull();
      expect(loadedBinary?.byteLength).toBe(sampleBytes.byteLength);

      // Update lastReadPage metadata
      const updated = await updateLocalPdfMetadata(firstSave.document.id, {
        lastReadPage: 4,
      });
      expect(updated?.lastReadPage).toBe(4);
    });
  });

  describe("4. Citation-Ready Text & Bounding-Box Extraction (extractor.ts)", () => {
    it("detects section headings and extracts chunks with document_id, page_number, section_heading, and bounding_box", () => {
      expect(
        isLikelySectionHeading(
          "CHAPTER 1: ENERGY AND CONSTITUTION",
          18,
          12
        )
      ).toBe(true);
      expect(
        isLikelySectionHeading(
          "This is a standard body sentence describing Vata, Pitta, and Kapha in detail.",
          12,
          12
        )
      ).toBe(false);

      const pageItems: RawPdfTextItem[] = [
        {
          str: "CHAPTER 1: ENERGY AND CONSTITUTION",
          transform: [18, 0, 0, 18, 48, 720],
          width: 390,
          height: 18,
        },
        {
          str: "Vayu, Pitta, and Kapha are three study energies that shape how any student grasps, focuses, and recalls.",
          transform: [12, 0, 0, 12, 48, 680],
          width: 460,
          height: 12,
        },
        {
          str: "When in balance they sustain Dhee, Dhriti, and Smriti across every subject.",
          transform: [12, 0, 0, 12, 48, 656],
          width: 440,
          height: 12,
        },
      ];

      const extractedPage = extractPageCitationChunksFromTextItems({
        documentId: "study-companion-vol-1",
        pageNumber: 14,
        items: pageItems,
      });

      expect(extractedPage.document_id).toBe("study-companion-vol-1");
      expect(extractedPage.page_number).toBe(14);
      expect(extractedPage.detected_headings).toEqual([
        "CHAPTER 1: ENERGY AND CONSTITUTION",
      ]);
      expect(extractedPage.chunks).toHaveLength(1);

      const chunk = extractedPage.chunks[0];
      expect(chunk.document_id).toBe("study-companion-vol-1");
      expect(chunk.page_number).toBe(14);
      expect(chunk.section_heading).toBe(
        "CHAPTER 1: ENERGY AND CONSTITUTION"
      );
      expect(chunk.text).toContain("Vayu, Pitta, and Kapha");
      expect(chunk.text).toContain("Dhee, Dhriti, and Smriti");
      expect(chunk.bounding_box.x).toBe(48);
      expect(chunk.bounding_box.y).toBe(656);
      expect(chunk.bounding_box.width).toBe(460);
      expect(chunk.bounding_box.height).toBeGreaterThan(20);
      expect(chunk.token_estimate).toBeGreaterThan(15);
    });

    it("propagates section headings across pages when indexing an entire document", () => {
      const docIndex = extractDocumentCitationIndex({
        documentId: "algorithms-ch2",
        pages: [
          {
            pageNumber: 1,
            items: [
              {
                str: "CHAPTER 2: GROWTH OF FUNCTIONS",
                transform: [18, 0, 0, 18, 50, 700],
                width: 320,
                height: 18,
              },
              {
                str: "A function grows linearly when each added input adds a constant amount of work.",
                transform: [12, 0, 0, 12, 50, 660],
                width: 350,
                height: 12,
              },
            ],
          },
          {
            pageNumber: 2,
            items: [
              {
                str: "The same growth idea appears in proofs, data structures, and laboratory timing.",
                transform: [12, 0, 0, 12, 50, 680],
                width: 370,
                height: 12,
              },
            ],
          },
        ],
      });

      expect(docIndex.total_chunks).toBe(2);
      expect(docIndex.chapters).toEqual([
        { title: "CHAPTER 2: GROWTH OF FUNCTIONS", pageNumber: 1 },
      ]);
      // Page 2 inherits the active chapter heading from Page 1
      expect(docIndex.chunks[1].page_number).toBe(2);
      expect(docIndex.chunks[1].section_heading).toBe(
        "CHAPTER 2: GROWTH OF FUNCTIONS"
      );
    });
  });
});
