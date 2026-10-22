export const TOOLBAR_ESTIMATED_HEIGHT = 52;
export const TOOLBAR_VIEW_MARGIN = 12;

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
