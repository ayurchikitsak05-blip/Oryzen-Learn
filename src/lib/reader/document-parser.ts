/**
 * Reader upload parser. Always keeps the student's original PDF bytes.
 * On pdf.js timeout or empty extract, scrape literal strings from the
 * original file. Never substitute the Ayurveda sample companion.
 */

import {
  extractDocumentCitationIndex,
  type CitationReadyChunk,
  type RawPdfTextItem,
} from "./extractor";
import { withTimeout } from "./fit";

export const PARSER_SAMPLE_SWAP_MARKER =
  "Vata, Pitta, and Kapha are three study energies";

export interface ParsedDocumentIndex {
  pageCount: number;
  chapters: Array<{ title: string; pageNumber: number }>;
  chunks: CitationReadyChunk[];
  source: "pdfjs" | "pdf_stream_text" | "unparsed";
  parseError: string | null;
  preservedOriginalText: boolean;
}

export function bytesContainMarker(bytes: Uint8Array, marker: string): boolean {
  return new TextDecoder("latin1").decode(bytes).includes(marker);
}

export function extractedTextSwappedSample(
  originalBytes: Uint8Array,
  extractedText: string
): boolean {
  if (!extractedText.includes(PARSER_SAMPLE_SWAP_MARKER)) return false;
  return !bytesContainMarker(originalBytes, PARSER_SAMPLE_SWAP_MARKER);
}

function decodePdfLiteral(raw: string): string {
  return raw
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Last-resort extract: pull `(...) Tj` strings from uncompressed PDF streams.
 * Used only when pdf.js fails. Returns the file's own text, never a mock page.
 */
export function scrapePdfStreamPages(bytes: Uint8Array): {
  pageCount: number;
  pages: string[];
} {
  const text = new TextDecoder("latin1").decode(bytes);
  const countMatch = text.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
  const declaredCount = countMatch ? Number(countMatch[1]) : 0;
  const literals: string[] = [];
  const literalRe = /\(((?:\\\)|\\.|[^)\\])*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = literalRe.exec(text)) !== null) {
    const value = decodePdfLiteral(match[1] ?? "");
    if (value.length < 2) continue;
    if (/^Page \d+ of \d+/.test(value)) continue;
    literals.push(value);
  }

  if (literals.length === 0) {
    return { pageCount: Math.max(1, declaredCount), pages: [] };
  }

  const pageCount = Math.max(1, declaredCount || 1);
  if (pageCount === 1) {
    return { pageCount: 1, pages: [literals.join(" ")] };
  }

  const perPage = Math.max(1, Math.ceil(literals.length / pageCount));
  const pages: string[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    const slice = literals.slice(i * perPage, (i + 1) * perPage).join(" ");
    pages.push(slice.trim());
  }
  return { pageCount, pages: pages.filter((page) => page.length > 0).length > 0 ? pages : [] };
}

export function indexPreservedPageTexts(
  documentId: string,
  pages: string[]
): {
  pageCount: number;
  chapters: Array<{ title: string; pageNumber: number }>;
  chunks: CitationReadyChunk[];
} {
  const rawPages = pages.map((raw, index) => {
    const [heading, ...rest] = raw.split("|").map((part) => part.trim());
    const body = rest.join(" ").trim() || heading || `Page ${index + 1}`;
    return {
      pageNumber: index + 1,
      items: [
        {
          str: heading || `Page ${index + 1}`,
          transform: [16, 0, 0, 16, 48, 710],
          width: 420,
          height: 16,
        },
        {
          str: body,
          transform: [12, 0, 0, 12, 48, 660],
          width: 480,
          height: 12,
        },
      ] satisfies RawPdfTextItem[],
    };
  });
  const indexed = extractDocumentCitationIndex({ documentId, pages: rawPages });
  return {
    pageCount: Math.max(1, pages.length),
    chapters: indexed.chapters,
    chunks: indexed.chunks,
  };
}

export async function extractPagesWithPdfjs(bytes: Uint8Array): Promise<{
  pageCount: number;
  pages: Array<{ pageNumber: number; items: RawPdfTextItem[] }>;
}> {
  const { ensurePdfWorkerConfigured } = await import("@/lib/reader/pdf-worker");
  await withTimeout(ensurePdfWorkerConfigured(), 2500, "pdf worker");
  const pdfjs = await withTimeout(import("pdfjs-dist"), 2500, "pdfjs import");
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const loadingTask = pdfjs.getDocument({ data: copy });
  const pdfDoc = await withTimeout(loadingTask.promise, 4000, "pdf document");
  const rawPages: Array<{ pageNumber: number; items: RawPdfTextItem[] }> = [];
  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
    const page = await pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const rawItems: RawPdfTextItem[] = textContent.items
      .filter(
        (
          item
        ): item is typeof item & {
          str: string;
          transform: number[];
          width?: number;
          height?: number;
        } => "str" in item && "transform" in item
      )
      .map((item) => ({
        str: item.str,
        transform: item.transform,
        width: item.width,
        height: item.height,
      }));
    rawPages.push({ pageNumber, items: rawItems });
  }
  await loadingTask.destroy();
  return { pageCount: pdfDoc.numPages, pages: rawPages };
}

export async function parseAndIndexUploadedPdf(params: {
  bytes: Uint8Array;
  documentId: string;
  extractWithPdfjs?: (bytes: Uint8Array) => Promise<{
    pageCount: number;
    pages: Array<{ pageNumber: number; items: RawPdfTextItem[] }>;
  }>;
}): Promise<ParsedDocumentIndex> {
  const extract = params.extractWithPdfjs ?? extractPagesWithPdfjs;
  try {
    const extracted = await extract(params.bytes);
    const indexed = extractDocumentCitationIndex({
      documentId: params.documentId,
      pages: extracted.pages,
    });
    const joined = indexed.chunks.map((chunk) => chunk.text).join(" ");
    if (extractedTextSwappedSample(params.bytes, joined)) {
      throw new Error("parser_sample_swap");
    }
    if (indexed.chunks.length > 0) {
      return {
        pageCount: extracted.pageCount,
        chapters: indexed.chapters,
        chunks: indexed.chunks,
        source: "pdfjs",
        parseError: null,
        preservedOriginalText: true,
      };
    }
    if (extracted.pageCount > 0) {
      return {
        pageCount: extracted.pageCount,
        chapters: Array.from({ length: extracted.pageCount }, (_, index) => ({
          title: `Page ${index + 1}`,
          pageNumber: index + 1,
        })),
        chunks: [],
        source: "unparsed",
        parseError:
          "We could not extract selectable text from this PDF. You can still read the original pages.",
        preservedOriginalText: true,
      };
    }
  } catch {
    // Fall through to the original-byte scrape. Do not invent pages.
  }

  const scraped = scrapePdfStreamPages(params.bytes);
  const scrapedJoined = scraped.pages.join(" ");
  if (
    scraped.pages.length > 0 &&
    !extractedTextSwappedSample(params.bytes, scrapedJoined)
  ) {
    const indexed = indexPreservedPageTexts(params.documentId, scraped.pages);
    return {
      ...indexed,
      pageCount: Math.max(indexed.pageCount, scraped.pageCount),
      source: "pdf_stream_text",
      parseError: null,
      preservedOriginalText: true,
    };
  }

  return {
    pageCount: Math.max(1, scraped.pageCount),
    chapters: [{ title: "Page 1", pageNumber: 1 }],
    chunks: [],
    source: "unparsed",
    parseError:
      "We could not extract text from this PDF. The original file is still open so you can read it.",
    preservedOriginalText: true,
  };
}
