export const TOOLBAR_ESTIMATED_HEIGHT = 88;
export const TOOLBAR_VIEW_MARGIN = 12;

/**
 * The heading and first line sit in the top of the page. The toolbar must
 * stay outside that band on phones, after zoom, and after the page scrolls.
 */
export function firstLineHeightForPage(pageHeight: number): number {
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) return 48;
  return Math.max(44, Math.min(160, pageHeight * 0.12));
}

export function placeHighlightToolbar(input: {
  selectionTop: number;
  selectionLeft: number;
  pageTop: number;
  firstLineHeight: number;
  toolbarWidth: number;
  toolbarHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}): { top: number; left: number } {
  const margin = TOOLBAR_VIEW_MARGIN;
  const toolbarHeight = Math.max(44, input.toolbarHeight);
  const toolbarWidth = Math.max(120, input.toolbarWidth);
  const firstLineTop = input.pageTop;
  const firstLineBottom = input.pageTop + Math.max(0, input.firstLineHeight);
  const overlapsFirstLine = (top: number) => {
    const bottom = top + toolbarHeight;
    return bottom > firstLineTop + 0.5 && top < firstLineBottom - 0.5;
  };
  const above = input.selectionTop - toolbarHeight - 8;
  const belowFirstLine = firstLineBottom + 8;
  let top = above;
  if (overlapsFirstLine(top) || top < margin) {
    top = Math.max(input.selectionTop + 16, belowFirstLine);
  }
  if (overlapsFirstLine(top)) top = belowFirstLine;
  const maxTop = Math.max(margin, input.viewportHeight - toolbarHeight - margin);
  const clamped = Math.min(Math.max(margin, top), maxTop);
  if (!overlapsFirstLine(clamped)) top = clamped;

  const half = toolbarWidth / 2;
  const minLeft = margin + half;
  const maxLeft = Math.max(minLeft, input.viewportWidth - margin - half);
  const left = Math.min(maxLeft, Math.max(minLeft, input.selectionLeft));
  return { top, left };
}

export function clampToolbarAnchor(
  top: number | undefined,
  left: number | undefined,
  viewportWidth = 1280,
  viewportHeight = 800
): { top: number; left: number } | undefined {
  if (typeof top !== "number" || typeof left !== "number") return undefined;
  const width = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1280;
  const height =
    Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 800;
  const maxLeft = Math.max(TOOLBAR_VIEW_MARGIN, width - TOOLBAR_VIEW_MARGIN);
  const preferredTop = top - TOOLBAR_ESTIMATED_HEIGHT - 10;
  const belowTop = top + 18;
  const minTop = 56;
  const maxTop = Math.max(minTop, height - TOOLBAR_ESTIMATED_HEIGHT - TOOLBAR_VIEW_MARGIN);
  const placedTop =
    preferredTop >= minTop
      ? Math.min(preferredTop, maxTop)
      : Math.min(Math.max(belowTop, minTop), maxTop);
  return {
    top: placedTop,
    left: Math.min(maxLeft, Math.max(TOOLBAR_VIEW_MARGIN, left)),
  };
}
