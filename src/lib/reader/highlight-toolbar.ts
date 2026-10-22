export function clampToolbarAnchor(
  top: number | undefined,
  left: number | undefined,
  viewportWidth = 1280
): { top: number; left: number } | undefined {
  if (typeof top !== "number" || typeof left !== "number") return undefined;
  const margin = 16;
  const width = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1280;
  return {
    top: Math.max(72, top - 8),
    left: Math.min(width - margin, Math.max(margin, left)),
  };
}
