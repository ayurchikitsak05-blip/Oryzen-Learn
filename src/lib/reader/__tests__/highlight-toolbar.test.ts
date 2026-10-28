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

  it("moves off the first line when the selection is the heading", () => {
    const pageTop = 160;
    const firstLineHeight = firstLineHeightForPage(900);
    const placed = placeHighlightToolbar({
      ...toolbar,
      selectionTop: pageTop + 12,
      selectionLeft: 420,
      pageTop,
      firstLineHeight,
    });
    const bottom = placed.top + toolbar.toolbarHeight;
    const clearAbove = bottom <= pageTop + 1;
    const clearBelow = placed.top >= pageTop + firstLineHeight - 1;
    expect(clearAbove || clearBelow).toBe(true);
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

  it("sits in the gap above a tall heading instead of covering the line beneath it", () => {
    const heading = { top: 280, bottom: 360, left: 80, right: 760 };
    const body = { top: 372, bottom: 420, left: 80, right: 980 };
    const placed = placeHighlightToolbar({
      ...toolbar,
      toolbarHeight: 72,
      selectionTop: 310,
      selectionLeft: 240,
      pageTop: 120,
      firstLineHeight: 160,
      obstacles: [heading, body],
    });
    const bottom = placed.top + 72;
    expect(bottom).toBeLessThanOrEqual(heading.top);
    expect(placed.top).toBeGreaterThanOrEqual(12);
    expect(bottom).toBeLessThanOrEqual(body.top);
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
    const bottom = placed.top + toolbar.toolbarHeight;
    const clearAbove = bottom <= pageTop + 1;
    const clearBelow = placed.top >= pageTop + firstLineHeight - 1;
    expect(clearAbove || clearBelow).toBe(true);
  });

  it("clears a long paragraph after the page has scrolled the heading away", () => {
    const lines = Array.from({ length: 12 }, (_, index) => ({
      top: 20 + index * 28,
      bottom: 44 + index * 28,
      left: 80,
      right: 900,
    }));
    const placed = placeHighlightToolbar({
      ...toolbar,
      selectionTop: 30,
      selectionLeft: 240,
      pageTop: 16,
      firstLineHeight: 28,
      obstacles: lines,
    });
    const box = {
      top: placed.top,
      bottom: placed.top + toolbar.toolbarHeight,
      left: placed.left - toolbar.toolbarWidth / 2,
      right: placed.left + toolbar.toolbarWidth / 2,
    };
    const covered = lines.filter(
      (line) =>
        box.bottom > line.top + 1 &&
        box.top < line.bottom - 1 &&
        box.right > line.left + 1 &&
        box.left < line.right - 1
    );
    expect(covered).toEqual([]);
    expect(placed.top).toBeGreaterThanOrEqual(lines[lines.length - 1].bottom);
  });

  it("moves below the paragraph when the phone toolbar fills the gap above the heading", () => {
    const chrome = { top: 48, bottom: 220, left: 0, right: 390 };
    const heading = { top: 236, bottom: 270, left: 16, right: 360 };
    const body = { top: 284, bottom: 520, left: 16, right: 370 };
    const placed = placeHighlightToolbar({
      toolbarWidth: 300,
      toolbarHeight: 80,
      viewportWidth: 390,
      viewportHeight: 844,
      selectionTop: 250,
      selectionLeft: 180,
      pageTop: 220,
      firstLineHeight: 40,
      obstacles: [chrome, heading, body],
    });
    const box = {
      top: placed.top,
      bottom: placed.top + 80,
      left: placed.left - 150,
      right: placed.left + 150,
    };
    const covered = [chrome, heading, body].filter(
      (line) =>
        box.bottom > line.top + 1 &&
        box.top < line.bottom - 1 &&
        box.right > line.left + 1 &&
        box.left < line.right - 1
    );
    expect(covered).toEqual([]);
    expect(placed.top).toBeGreaterThanOrEqual(body.bottom);
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
