/**
 * Positions a study highlight on the PDF glyphs.
 * Coordinates are in the scale-1 page viewport. The reader scales that layer
 * with the canvas, so the same boxes stay aligned when the zoom changes.
 */

export interface PdfTextRun {
  text: string;
  left: number;
  top: number;
  fontSize: number;
  width: number;
  height: number;
}

/** Fallback when the browser cannot report a font bounding box. Matches pdf.js. */
export const PDF_TEXT_ASCENT_RATIO = 0.8;

export interface RawPdfTextItem {
  str: string;
  width: number;
  height: number;
  transform: number[];
}

/** Same 2×3 matrix product pdf.js uses for text-item placement. */
export function multiplyPdfMatrix(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export function runsFromTextItems(
  items: readonly RawPdfTextItem[],
  viewportTransform: number[]
): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  for (const item of items) {
    const text = item.str ?? "";
    if (!text.trim() || item.transform.length < 6 || viewportTransform.length < 6) continue;
    const tx = multiplyPdfMatrix(viewportTransform, item.transform);
    const fontSize = Math.hypot(tx[2], tx[3]) || item.height || 12;
    runs.push({
      text,
      left: tx[4],
      top: tx[5] - fontSize * PDF_TEXT_ASCENT_RATIO,
      fontSize,
      width: Math.max(item.width || fontSize, 1),
      height: fontSize * 1.15,
    });
  }
  return runs;
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * The stored passage is the page body. A heading printed above that body is
 * not part of the highlight offsets, so it is left out when the remaining
 * lines reconstruct the passage.
 */
export function runsForPassage(runs: readonly PdfTextRun[], passage: string): PdfTextRun[] {
  const target = normalizeSpace(passage);
  if (!target || runs.length === 0) return [];
  for (let start = 0; start < runs.length; start += 1) {
    const slice = runs.slice(start);
    if (normalizeSpace(slice.map((run) => run.text).join(" ")) === target) return slice;
  }
  const contained = runs.filter((run) => target.includes(normalizeSpace(run.text)));
  return contained.length > 0 ? contained : [...runs];
}
