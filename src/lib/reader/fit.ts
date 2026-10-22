import {
  clampReaderZoom,
  MAX_READER_ZOOM,
  MIN_READER_ZOOM,
} from "@/lib/reader/pdf-worker";
import { scopedReaderStorageKey } from "@/lib/reader/local-scope";

export type ReaderFitMode = "page" | "width" | "custom";

/** Allow a complete page to fit on phones without stretching. */
export const MIN_FIT_ZOOM = 0.28;

/** Default to Fit Width so body text is large on laptops and tablets. */
export const DEFAULT_FIT_MODE: ReaderFitMode = "width";

/** Tight chrome so Fit Width / Fit Page use the pane, not empty margin. */
export const FIT_WIDTH_PADDING = 8;
export const FIT_PAGE_PADDING = 10;

export interface PageGeometry {
  width: number;
  height: number;
}

export interface ViewportBox {
  width: number;
  height: number;
}

export function clampFitZoom(scale: number): number {
  if (Number.isNaN(scale) || !Number.isFinite(scale)) {
    return MIN_READER_ZOOM;
  }
  const clamped = Math.min(Math.max(MIN_FIT_ZOOM, scale), MAX_READER_ZOOM);
  return Number(clamped.toFixed(3));
}

export function computeFitPageScale(
  page: PageGeometry,
  viewport: ViewportBox,
  padding = FIT_PAGE_PADDING
): number {
  const availW = Math.max(160, viewport.width - padding);
  const availH = Math.max(200, viewport.height - padding);
  if (page.width <= 0 || page.height <= 0) return MIN_READER_ZOOM;
  return clampFitZoom(Math.min(availW / page.width, availH / page.height));
}

export function computeFitWidthScale(
  page: PageGeometry,
  viewport: ViewportBox,
  padding = FIT_WIDTH_PADDING
): number {
  const availW = Math.max(160, viewport.width - padding);
  if (page.width <= 0) return MIN_READER_ZOOM;
  return clampFitZoom(availW / page.width);
}

export function resolveReaderScale(params: {
  fitMode: ReaderFitMode;
  customScale: number;
  page: PageGeometry | null;
  viewport: ViewportBox;
}): number {
  const { fitMode, customScale, page, viewport } = params;
  if (!page) return clampReaderZoom(customScale);
  if (fitMode === "page") return computeFitPageScale(page, viewport);
  if (fitMode === "width") return computeFitWidthScale(page, viewport);
  return clampReaderZoom(customScale);
}

export function pdfBoxToOverlayStyle(
  box: { x: number; y: number; width: number; height: number },
  page: PageGeometry,
  render: PageGeometry
): { left: number; top: number; width: number; height: number } {
  const sx = render.width / Math.max(1, page.width);
  const sy = render.height / Math.max(1, page.height);
  return {
    left: box.x * sx,
    top: (page.height - box.y - box.height) * sy,
    width: Math.max(8, box.width * sx),
    height: Math.max(10, box.height * sy),
  };
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export const READER_VIEW_STORAGE_KEY = "oryzen_reader_view_v1";
export const READER_LAST_DOCUMENT_KEY = "oryzen_reader_last_document_v1";

export interface PersistedReaderView {
  page: number;
  zoom: number;
  fitMode: ReaderFitMode;
  progress: number;
}

export function readPersistedReaderView(
  documentId: string,
  userId?: string | null
): PersistedReaderView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(
      scopedReaderStorageKey(READER_VIEW_STORAGE_KEY, userId)
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, PersistedReaderView>;
    const view = parsed[documentId];
    if (!view) return null;
    if (typeof view.page !== "number") return null;
    return view;
  } catch {
    return null;
  }
}

export function writePersistedReaderView(
  documentId: string,
  view: PersistedReaderView,
  userId?: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    const key = scopedReaderStorageKey(READER_VIEW_STORAGE_KEY, userId);
    const raw = window.localStorage.getItem(key);
    const parsed = raw
      ? (JSON.parse(raw) as Record<string, PersistedReaderView>)
      : {};
    parsed[documentId] = view;
    window.localStorage.setItem(key, JSON.stringify(parsed));
    writeLastReaderDocumentId(documentId, userId);
  } catch {
    // Ignore quota / private-mode failures
  }
}

export function readLastReaderDocumentId(userId?: string | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage
      .getItem(scopedReaderStorageKey(READER_LAST_DOCUMENT_KEY, userId))
      ?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function writeLastReaderDocumentId(
  documentId: string,
  userId?: string | null
): void {
  if (typeof window === "undefined") return;
  const id = documentId.trim();
  if (!id) return;
  try {
    window.localStorage.setItem(
      scopedReaderStorageKey(READER_LAST_DOCUMENT_KEY, userId),
      id
    );
  } catch {
    // Ignore quota / private-mode failures
  }
}
