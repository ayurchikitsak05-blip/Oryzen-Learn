/**
 * Layer 2: Citation-Ready PDF Text & Bounding-Box Extraction Engine
 * Extracts text per page alongside normalized bounding-box coordinates and
 * section headings (`document_id`, `page_number`, `section_heading`) for
 * Shield 1 (Page-Level RAG) and bi-directional deep-linked sources.
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RawPdfTextItem {
  str: string;
  /** PDF.js 6-element transform matrix: [scaleX, skewY, skewX, scaleY, translateX, translateY] */
  transform: number[];
  width?: number;
  height?: number;
}

export interface CitationReadyChunk {
  chunk_id: string;
  document_id: string;
  page_number: number;
  section_heading: string;
  text: string;
  bounding_box: BoundingBox;
  token_estimate: number;
}

export interface PageExtractionResult {
  document_id: string;
  page_number: number;
  detected_headings: string[];
  chunks: CitationReadyChunk[];
}

// ---------------------------------------------------------------------------
// Shifted-glyph repair. Some publisher PDFs store text with a font whose codes
// sit 29 below normal ASCII: "Growth hormone" comes out as "*URZWK\u0003KRUPRQH"
// (spaces become control character 3). We shift such text back, per item,
// only when the shifted version reads more like words than the original.
// ---------------------------------------------------------------------------
const GLYPH_SHIFT = 29;
const CONTROL_CHARS = /[\u0001-\u0008\u000b\u000c\u000e-\u001f]/;

function vowelShare(text: string): number {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return 0;
  return (letters.match(/[aeiouyAEIOUY]/g)?.length ?? 0) / letters.length;
}

/** The text shifted back by the font offset (characters that can't shift stay as they are). */
export function unshiftGlyphText(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const shifted = code + GLYPH_SHIFT;
    out += code >= 3 && shifted <= 126 ? String.fromCharCode(shifted) : ch;
  }
  return out;
}

/** True when text looks like shifted glyphs and the unshifted version reads like words. */
export function looksGlyphShifted(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return false;
  const fixed = unshiftGlyphText(text);
  const fixedLetters = fixed.replace(/[^A-Za-z]/g, "");
  return fixedLetters.length >= letters.length * 0.7 && vowelShare(fixed) >= 0.28 && vowelShare(fixed) > vowelShare(text) + 0.12;
}

/**
 * Repairs a page's text items when the page shows the shifted-font pattern
 * (control characters where spaces should be). Normal items on the page are left alone.
 */
export function repairShiftedGlyphItems<T extends { str: string }>(items: T[]): T[] {
  const marked = items.filter((item) => CONTROL_CHARS.test(item.str)).length;
  if (marked === 0) return items;
  return items.map((item) => {
    if (!CONTROL_CHARS.test(item.str) && !looksGlyphShifted(item.str)) return item;
    const fixed = unshiftGlyphText(item.str);
    if (CONTROL_CHARS.test(item.str) && !looksGlyphShifted(item.str)) {
      // Only stray control characters: drop them, keep the text.
      return { ...item, str: item.str.replace(/[\u0000-\u001f]/g, " ") };
    }
    return { ...item, str: fixed };
  });
}

/** Contents should skip unreadable lines and running page headers ("306 PHARMACOLOGY FOR …"). */
export function tidyChapters(
  chapters: Array<{ title: string; pageNumber: number }>,
  headingPages: Map<string, Set<number>> = new Map()
): Array<{ title: string; pageNumber: number }> {
  // Running headers repeat with a different page number each time ("306 …", "308 …").
  const seen = new Map<string, number>();
  for (const chapter of chapters) {
    const key = runningHeaderKey(chapter.title);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const out: Array<{ title: string; pageNumber: number }> = [];
  for (const chapter of chapters) {
    let title = chapter.title.trim();
    if (CONTROL_CHARS.test(title) || looksGlyphShifted(title)) {
      if (!looksGlyphShifted(title)) continue;
      title = unshiftGlyphText(title).replace(/\s+/g, " ").trim();
    }
    const letters = title.replace(/[^A-Za-z]/g, "");
    if (letters.length >= 4 && vowelShare(title) < 0.18) continue;
    const key = runningHeaderKey(chapter.title);
    if (Math.max(headingPages.get(key)?.size ?? 0, seen.get(key) ?? 0) >= 3) continue;
    out.push({ ...chapter, title });
  }
  return out;
}

/** Repairs a saved book's chapters and passage text (books added before the repair existed). */
export function repairStoredBookText<
  T extends { chapters: Array<{ title: string; pageNumber: number }>; chunks: Array<{ text: string; section_heading: string }> },
>(record: T): T {
  const needs =
    record.chapters.some((chapter) => CONTROL_CHARS.test(chapter.title)) ||
    record.chunks.some((chunk) => CONTROL_CHARS.test(chunk.text));
  const chapters = tidyChapters(record.chapters);
  if (!needs && chapters.length === record.chapters.length) return record;
  const fixLine = (text: string) => {
    if (!CONTROL_CHARS.test(text) && !looksGlyphShifted(text)) return text;
    // Repair word by word: shifted words sit next to normal ones in the same passage.
    return text
      .split(/(\s+)/)
      .map((part) => (/\s+/.test(part) ? part : looksGlyphShifted(part) || CONTROL_CHARS.test(part) ? unshiftGlyphText(part) : part))
      .join("")
      .replace(/[\u0000-\u001f]/g, " ");
  };
  return {
    ...record,
    chapters: chapters.length > 0 ? chapters : record.chapters,
    chunks: record.chunks.map((chunk) => ({ ...chunk, text: fixLine(chunk.text), section_heading: fixLine(chunk.section_heading) })),
  };
}

function runningHeaderKey(title: string): string {
  return title.replace(/\d+/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

const HEADING_PATTERNS: RegExp[] = [
  /^(chapter|adhyaya|sthana|sutra|section|unit|part|module)\b/i,
  /^[0-9]+(\.[0-9]+)*\s+[A-Z]/,
  /^[IVXLCDM]+\.\s+[A-Z]/,
];

/**
 * Heuristic detector for section and chapter headings in textbooks across faculties.
 * Evaluates font height relative to body text and structural heading prefixes.
 */
export function isLikelySectionHeading(
  lineText: string,
  fontHeight: number,
  medianFontHeight: number
): boolean {
  const trimmed = lineText.trim();
  if (trimmed.length < 3 || trimmed.length > 120) {
    return false;
  }

  if (HEADING_PATTERNS.some((re) => re.test(trimmed))) {
    return true;
  }

  // Significantly larger font than median body text on the page
  if (medianFontHeight > 0 && fontHeight >= medianFontHeight * 1.18) {
    return true;
  }

  // All-caps scholarly heading (at least 4 alphabetic characters)
  const alphaOnly = trimmed.replace(/[^a-zA-Z]/g, "");
  if (
    alphaOnly.length >= 4 &&
    trimmed === trimmed.toUpperCase() &&
    !trimmed.endsWith(".")
  ) {
    return true;
  }

  return false;
}

function estimateTokenCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.3));
}

function unionBoundingBoxes(boxes: BoundingBox[]): BoundingBox {
  if (boxes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  return {
    x: Number(minX.toFixed(2)),
    y: Number(minY.toFixed(2)),
    width: Number(Math.max(0, maxX - minX).toFixed(2)),
    height: Number(Math.max(0, maxY - minY).toFixed(2)),
  };
}

/**
 * Extracts structured, citation-ready chunks with bounding-box coordinates and
 * section headings from a single page's PDF.js text items.
 */
export function extractPageCitationChunksFromTextItems(params: {
  documentId: string;
  pageNumber: number;
  items: RawPdfTextItem[];
  fallbackHeading?: string;
  maxWordsPerChunk?: number;
}): PageExtractionResult {
  const {
    documentId,
    pageNumber,
    items,
    fallbackHeading = `Page ${pageNumber}`,
    maxWordsPerChunk = 120,
  } = params;

  const nonEmptyItems = items.filter(
    (item) => typeof item.str === "string" && item.str.trim().length > 0
  );

  if (nonEmptyItems.length === 0) {
    return {
      document_id: documentId,
      page_number: pageNumber,
      detected_headings: [],
      chunks: [],
    };
  }

  // Estimate font heights from transform[3] or transform[0] or item.height
  const heights = nonEmptyItems.map((item) => {
    const h =
      item.height ??
      Math.abs(item.transform?.[3] ?? item.transform?.[0] ?? 12);
    return h > 0 ? h : 12;
  });

  const sortedHeights = [...heights].sort((a, b) => a - b);
  const medianFontHeight =
    sortedHeights[Math.floor(sortedHeights.length / 2)] ?? 12;

  // Group items into lines by similar Y coordinate (transform[5])
  interface LineBucket {
    y: number;
    fontHeight: number;
    texts: string[];
    boxes: BoundingBox[];
  }

  const lines: LineBucket[] = [];
  const lineTolerance = Math.max(3, medianFontHeight * 0.45);

  nonEmptyItems.forEach((item, idx) => {
    const x = Number(item.transform?.[4] ?? 0);
    const y = Number(item.transform?.[5] ?? 0);
    const fontH = heights[idx];
    const width = Number(item.width ?? Math.max(10, item.str.length * (fontH * 0.5)));
    const box: BoundingBox = {
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      width: Number(width.toFixed(2)),
      height: Number(fontH.toFixed(2)),
    };

    const existingLine = lines.find((l) => Math.abs(l.y - y) <= lineTolerance);
    if (existingLine) {
      existingLine.texts.push(item.str.trim());
      existingLine.boxes.push(box);
      existingLine.fontHeight = Math.max(existingLine.fontHeight, fontH);
    } else {
      lines.push({
        y,
        fontHeight: fontH,
        texts: [item.str.trim()],
        boxes: [box],
      });
    }
  });

  // In PDF coordinates, higher Y is typically higher on the page; sort top-to-bottom
  lines.sort((a, b) => b.y - a.y);

  let currentHeading = fallbackHeading;
  const detectedHeadings: string[] = [];
  const chunks: CitationReadyChunk[] = [];

  let bufferWords: string[] = [];
  let bufferBoxes: BoundingBox[] = [];
  let chunkIndex = 1;

  const flushChunk = () => {
    const text = bufferWords.join(" ").trim();
    if (!text) return;

    chunks.push({
      chunk_id: `${documentId}-p${pageNumber}-c${chunkIndex}`,
      document_id: documentId,
      page_number: pageNumber,
      section_heading: currentHeading,
      text,
      bounding_box: unionBoundingBoxes(bufferBoxes),
      token_estimate: estimateTokenCount(text),
    });

    chunkIndex += 1;
    bufferWords = [];
    bufferBoxes = [];
  };

  for (const line of lines) {
    const lineString = line.texts.join(" ").replace(/\s+/g, " ").trim();
    if (!lineString) continue;

    if (
      isLikelySectionHeading(lineString, line.fontHeight, medianFontHeight)
    ) {
      flushChunk();
      currentHeading = lineString;
      if (!detectedHeadings.includes(lineString)) {
        detectedHeadings.push(lineString);
      }
      continue;
    }

    const wordsInLine = lineString.split(/\s+/);
    bufferWords.push(...wordsInLine);
    bufferBoxes.push(...line.boxes);

    if (bufferWords.length >= maxWordsPerChunk) {
      flushChunk();
    }
  }

  flushChunk();

  // If the page only contained headings and no body lines, still emit a heading chunk so nothing is lost
  if (chunks.length === 0 && detectedHeadings.length > 0) {
    const combined = detectedHeadings.join(" — ");
    chunks.push({
      chunk_id: `${documentId}-p${pageNumber}-c1`,
      document_id: documentId,
      page_number: pageNumber,
      section_heading: detectedHeadings[0],
      text: combined,
      bounding_box: unionBoundingBoxes(lines.flatMap((l) => l.boxes)),
      token_estimate: estimateTokenCount(combined),
    });
  }

  return {
    document_id: documentId,
    page_number: pageNumber,
    detected_headings: detectedHeadings,
    chunks,
  };
}

/**
 * Extracts citation-ready chunks across multiple pages of a PDF document,
 * propagating the most recent section heading across page boundaries.
 */
export function extractDocumentCitationIndex(params: {
  documentId: string;
  pages: Array<{ pageNumber: number; items: RawPdfTextItem[] }>;
  maxWordsPerChunk?: number;
}): {
  document_id: string;
  total_chunks: number;
  chapters: Array<{ title: string; pageNumber: number }>;
  chunks: CitationReadyChunk[];
} {
  const { documentId, pages, maxWordsPerChunk = 120 } = params;
  let runningHeading = "Opening Section";
  const allChunks: CitationReadyChunk[] = [];
  const chapters: Array<{ title: string; pageNumber: number }> = [];

  const headingPages = new Map<string, Set<number>>();

  for (const page of pages) {
    const pageResult = extractPageCitationChunksFromTextItems({
      documentId,
      pageNumber: page.pageNumber,
      items: repairShiftedGlyphItems(page.items),
      fallbackHeading: runningHeading,
      maxWordsPerChunk,
    });

    for (const heading of pageResult.detected_headings) {
      const key = runningHeaderKey(heading);
      if (!headingPages.has(key)) headingPages.set(key, new Set());
      headingPages.get(key)!.add(page.pageNumber);
      runningHeading = heading;
      if (!chapters.some((c) => c.title === heading)) {
        chapters.push({ title: heading, pageNumber: page.pageNumber });
      }
    }

    allChunks.push(...pageResult.chunks);
  }

  return {
    document_id: documentId,
    total_chunks: allChunks.length,
    chapters: tidyChapters(chapters, headingPages),
    chunks: allChunks,
  };
}
