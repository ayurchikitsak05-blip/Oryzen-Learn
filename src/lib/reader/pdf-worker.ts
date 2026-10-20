/**
 * Layer 2: PDF.js Worker Configuration & 3-Page Virtualized RAM Window Math
 * Guarantees that only [Page N-1, Page N, Page N+1] are ever mounted as active
 * canvases in tablet RAM simultaneously.
 */

export const PDFJS_CDN_WORKER_FALLBACK =
  "https://unpkg.com/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs";

export const MIN_READER_ZOOM = 0.6;
export const MAX_READER_ZOOM = 2.5;
export const DEFAULT_READER_ZOOM = 1.1;

let workerInitialized = false;
let configuredWorkerSrc: string | null = null;

/**
 * Configures the PDF.js GlobalWorkerOptions.workerSrc safely in Next.js browser environments.
 * Returns the resolved workerSrc string.
 */
export async function ensurePdfWorkerConfigured(
  customWorkerSrc?: string
): Promise<string> {
  const targetSrc = customWorkerSrc ?? PDFJS_CDN_WORKER_FALLBACK;

  if (workerInitialized && configuredWorkerSrc === targetSrc) {
    return targetSrc;
  }

  try {
    const pdfjs = await import("pdfjs-dist");
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = targetSrc;
      configuredWorkerSrc = pdfjs.GlobalWorkerOptions.workerSrc;
      workerInitialized = true;
      return configuredWorkerSrc;
    }
  } catch {
    // Fallback in non-browser or restricted worker test environments
  }

  configuredWorkerSrc = targetSrc;
  workerInitialized = true;
  return targetSrc;
}

/**
 * Computes the strict 3-Page Virtualized RAM Window (`Page N-1, Page N, Page N+1`)
 * for a given 1-indexed activePage and totalPages.
 *
 * All pages outside this returned array MUST have their canvas buffers released
 * so tablets with 2GB-4GB RAM never crash on 500+ page textbooks.
 */
export function computeThreePageWindow(
  activePage: number,
  totalPages: number
): number[] {
  if (totalPages <= 0) {
    return [];
  }

  const clampedTotal = Math.floor(totalPages);
  const clampedActive = Math.min(
    Math.max(1, Math.floor(activePage)),
    clampedTotal
  );

  const windowSet = new Set<number>();
  if (clampedActive - 1 >= 1) {
    windowSet.add(clampedActive - 1);
  }
  windowSet.add(clampedActive);
  if (clampedActive + 1 <= clampedTotal) {
    windowSet.add(clampedActive + 1);
  }

  return Array.from(windowSet).sort((a, b) => a - b);
}

/**
 * Checks whether a specific 1-indexed page number is inside the active 3-page RAM window.
 */
export function isPageInRamWindow(
  pageNumber: number,
  activePage: number,
  totalPages: number
): boolean {
  const windowPages = computeThreePageWindow(activePage, totalPages);
  return windowPages.includes(pageNumber);
}

/**
 * Clamps pinch-to-zoom or toolbar zoom scale to ergonomic tablet bounds.
 */
export function clampReaderZoom(scale: number): number {
  if (Number.isNaN(scale) || !Number.isFinite(scale)) {
    return DEFAULT_READER_ZOOM;
  }
  const clamped = Math.min(Math.max(MIN_READER_ZOOM, scale), MAX_READER_ZOOM);
  return Number(clamped.toFixed(2));
}
