import { describe, expect, it } from "vitest";
import { clampToolbarAnchor, firstLineHeightForPage, placeHighlightToolbar } from "../highlight-toolbar";

describe("highlight toolbar anchor", () => {
  it("keeps a compact toolbar on-screen on a 390px phone", () => {
    const low = clampToolbarAnchor(40, -80, 390, 640);
    expect(low?.left).toBe(12);
    expect(low?.top).toBeGreaterThanOrEqual(56);
    expect(low?.top).toBeLessThan(120);

    const mid = clampToolbarAnchor(180, 500, 390, 640);
    expect(mid?.left).toBeLessThanOrEqual(378);
    expect(mid?.top).toBeLessThan(180);
    expect(Math.abs((mid?.top ?? 0) - 180)).toBeGreaterThan(20);
  });

  it("places the desktop toolbar above the selection instead of covering it", () => {
    const anchor = clampToolbarAnchor(240, 640, 1440, 900);
    expect(anchor?.left).toBe(640);
    expect(anchor?.top).toBeLessThan(240);
    expect(240 - (anchor?.top ?? 0)).toBeGreaterThanOrEqual(40);
  });
});

describe("highlight toolbar stays off the first line", () => {
  const toolbar = { toolbarWidth: 320, toolbarHeight: 88, viewportWidth: 1280, viewportHeight: 900 };

  it("moves below the first line when the selection is the heading", () => {
    const pageTop = 160;
    const firstLineHeight = firstLineHeightForPage(900);
    const placed = placeHighlightToolbar({
      ...toolbar,
      selectionTop: pageTop + 12,
      selectionLeft: 420,
      pageTop,
      firstLineHeight,
    });
    expect(placed.top).toBeGreaterThanOrEqual(pageTop + firstLineHeight);
    expect(placed.top + toolbar.toolbarHeight).toBeGreaterThan(pageTop + firstLineHeight);
  });

  it("keeps a mid-page selection's toolbar above the selection and below the first line", () => {
    const pageTop = 140;
    const firstLineHeight = firstLineHeightForPage(800);
    const selectionTop = 520;
    const placed = placeHighlightToolbar({
      ...toolbar,
      selectionTop,
      selectionLeft: 480,
      pageTop,
      firstLineHeight,
    });
    expect(placed.top + toolbar.toolbarHeight).toBeLessThanOrEqual(selectionTop);
    expect(placed.top).toBeGreaterThanOrEqual(pageTop + firstLineHeight);
  });

  it("follows a scrolled page without covering the first line", () => {
    const firstLineHeight = firstLineHeightForPage(800);
    const placed = placeHighlightToolbar({
      ...toolbar,
      selectionTop: 70,
      selectionLeft: 300,
      pageTop: 40,
      firstLineHeight,
    });
    expect(placed.top).toBeGreaterThanOrEqual(40 + firstLineHeight);
  });

  it("clears a taller first line after zoom", () => {
    const pageTop = 150;
    const firstLineHeight = firstLineHeightForPage(1500);
    expect(firstLineHeight).toBeGreaterThan(100);
    const placed = placeHighlightToolbar({
      ...toolbar,
      selectionTop: pageTop + 20,
      selectionLeft: 400,
      pageTop,
      firstLineHeight,
    });
    expect(placed.top).toBeGreaterThanOrEqual(pageTop + firstLineHeight);
  });

  it("keeps the full toolbar inside a 390px screen", () => {
    const placed = placeHighlightToolbar({
      selectionTop: 280,
      selectionLeft: 360,
      pageTop: 120,
      firstLineHeight: firstLineHeightForPage(640),
      toolbarWidth: 352,
      toolbarHeight: 120,
      viewportWidth: 390,
      viewportHeight: 700,
    });
    expect(placed.left - 176).toBeGreaterThanOrEqual(12);
    expect(placed.left + 176).toBeLessThanOrEqual(378);
    expect(placed.top).toBeGreaterThanOrEqual(120 + firstLineHeightForPage(640));
  });
});
