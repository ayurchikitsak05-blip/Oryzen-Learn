import {
  clampReaderZoom,
  MAX_READER_ZOOM,
  MIN_READER_ZOOM,
} from "@/lib/reader/pdf-worker";
import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";

export type ReaderFitMode = "page" | "width" | "custom";

/**
 * Floor for a calculated fit. Kept below the pinch/toolbar minimum so a short
 * viewport can still show every edge. It is not a hardcoded page size.
 */
export const MIN_FIT_ZOOM = 0.05;

/** Default to Fit Width so body text is large on laptops and tablets. */
export const DEFAULT_FIT_MODE: ReaderFitMode = "width";

/** Phone widths where a desktop custom zoom would run past the screen. */
export const NARROW_READER_WIDTH = 390;

/**
 * A custom zoom saved on a wide screen is restored as Fit Width on a phone
 * so the page does not overflow the viewport. Zoom still works afterwards.
 */
export function restoredReaderFit(
  persisted: { fitMode?: ReaderFitMode; zoom?: number } | null | undefined,
  viewportWidth: number
): { fitMode: ReaderFitMode; zoom: number | null } {
  if (!persisted?.fitMode) return { fitMode: DEFAULT_FIT_MODE, zoom: null };
  if (viewportWidth > 0 && viewportWidth <= NARROW_READER_WIDTH && persisted.fitMode === "custom") {
    return { fitMode: "width", zoom: null };
  }
  return {
    fitMode: persisted.fitMode,
    zoom: persisted.fitMode === "custom" && typeof persisted.zoom === "number" ? persisted.zoom : null,
  };
}

/** Inset already consumed by the page stage padding, in CSS pixels (both sides). */
export const FIT_WIDTH_PADDING = 8;
export const FIT_PAGE_PADDING = 8;

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
  return Math.floor(clamped * 1000) / 1000;
}

function usableSpan(total: number, padding: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, total - Math.max(0, padding));
}

/**
 * The part of the scroll host that is actually on screen. A host that has
 * grown with the PDF must not be treated as extra viewing room.
 */
export function visibleViewerBox(
  host: { left: number; top: number; width: number; height: number },
  frame: { left: number; top: number; width: number; height: number }
): ViewportBox {
  const left = Math.max(host.left, frame.left);
  const top = Math.max(host.top, frame.top);
  const right = Math.min(host.left + host.width, frame.left + frame.width);
  const bottom = Math.min(host.top + host.height, frame.top + frame.height);
  return {
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function computeFitPageScale(
  page: PageGeometry,
  viewport: ViewportBox,
  padding = FIT_PAGE_PADDING
): number {
  const availW = usableSpan(viewport.width, padding);
  const availH = usableSpan(viewport.height, padding);
  if (page.width <= 0 || page.height <= 0 || availW < 1 || availH < 1) return MIN_FIT_ZOOM;
  return clampFitZoom(Math.min(availW / page.width, availH / page.height));
}

export function computeFitWidthScale(
  page: PageGeometry,
  viewport: ViewportBox,
  padding = FIT_WIDTH_PADDING
): number {
  const availW = usableSpan(viewport.width, padding);
  if (page.width <= 0 || availW < 1) return MIN_FIT_ZOOM;
  return clampFitZoom(availW / page.width);
}

export function nextPinchZoom(
  startZoom: number,
  startDistance: number,
  distance: number
): number {
  if (startDistance <= 0 || distance <= 0) return clampFitZoom(startZoom);
  return clampFitZoom(startZoom * (distance / startDistance));
}

/** Keep the content point under the fingers stable while the scale changes. */
export function scrollForFocalZoom(input: {
  focalContentX: number;
  focalContentY: number;
  startZoom: number;
  nextZoom: number;
  pointerX: number;
  pointerY: number;
}): { left: number; top: number } {
  const ratio = input.startZoom > 0 ? input.nextZoom / input.startZoom : 1;
  return {
    left: input.focalContentX * ratio - input.pointerX,
    top: input.focalContentY * ratio - input.pointerY,
  };
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
    const raw = readPrivateString(READER_VIEW_STORAGE_KEY, userId);
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
    const raw = readPrivateString(READER_VIEW_STORAGE_KEY, userId);
    const parsed = raw
      ? (JSON.parse(raw) as Record<string, PersistedReaderView>)
      : {};
    parsed[documentId] = view;
    writePrivateString(READER_VIEW_STORAGE_KEY, JSON.stringify(parsed), userId);
    writeLastReaderDocumentId(documentId, userId);
  } catch {
    // Ignore quota / private-mode failures
  }
}

export function readLastReaderDocumentId(userId?: string | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = readPrivateString(READER_LAST_DOCUMENT_KEY, userId)?.trim();
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
    writePrivateString(READER_LAST_DOCUMENT_KEY, id, userId);
  } catch {
    // Ignore quota / private-mode failures
  }
}
