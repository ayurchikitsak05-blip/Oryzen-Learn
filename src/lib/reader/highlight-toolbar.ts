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

export interface ToolbarObstacle {
  top: number;
  bottom: number;
  left: number;
  right: number;
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
  obstacles?: readonly ToolbarObstacle[];
}): { top: number; left: number } {
  const margin = TOOLBAR_VIEW_MARGIN;
  const toolbarHeight = Math.max(44, input.toolbarHeight);
  const toolbarWidth = Math.max(120, input.toolbarWidth);
  const half = toolbarWidth / 2;
  const minLeft = margin + half;
  const maxLeft = Math.max(minLeft, input.viewportWidth - margin - half);
  const left = Math.min(maxLeft, Math.max(minLeft, input.selectionLeft));
  const obstacles =
    input.obstacles && input.obstacles.length > 0
      ? [...input.obstacles].sort((a, b) => a.top - b.top)
      : [
          {
            top: input.pageTop,
            bottom: input.pageTop + Math.max(0, input.firstLineHeight),
            left: 0,
            right: input.viewportWidth,
          },
        ];
  const hits = (top: number) => {
    const box = { top, bottom: top + toolbarHeight, left: left - half, right: left + half };
    return obstacles.some(
      (line) =>
        box.bottom > line.top + 1 &&
        box.top < line.bottom - 1 &&
        box.right > line.left + 1 &&
        box.left < line.right - 1
    );
  };
  let top = input.selectionTop - toolbarHeight - 8;
  if (hits(top) || top < margin) {
    const firstInk = obstacles[0];
    const aboveInk = firstInk.top - toolbarHeight - 8;
    if (aboveInk >= margin && !hits(aboveInk)) {
      top = aboveInk;
    } else {
      top = Math.max(input.selectionTop + 16, firstInk.bottom + 8);
      for (let guard = 0; guard < 8 && hits(top); guard += 1) {
        const hit = obstacles.find(
          (line) => top < line.bottom - 1 && top + toolbarHeight > line.top + 1
        );
        if (!hit) break;
        top = hit.bottom + 8;
      }
    }
  }
  const maxTop = Math.max(margin, input.viewportHeight - toolbarHeight - margin);
  const clamped = Math.min(Math.max(margin, top), maxTop);
  if (!hits(clamped)) top = clamped;

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
