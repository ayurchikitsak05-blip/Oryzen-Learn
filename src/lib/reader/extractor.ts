/**
 * Layer 2: Citation-Ready PDF Text & Bounding-Box Extraction Engine
 * Extracts text per page alongside normalized bounding-box coordinates and
 * section headings (`document_id`, `page_number`, `section_heading`) for
 * Shield 1 (Page-Level RAG) and bi-directional deep-linked notebooks.
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

  for (const page of pages) {
    const pageResult = extractPageCitationChunksFromTextItems({
      documentId,
      pageNumber: page.pageNumber,
      items: page.items,
      fallbackHeading: runningHeading,
      maxWordsPerChunk,
    });

    for (const heading of pageResult.detected_headings) {
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
    chapters,
    chunks: allChunks,
  };
}
