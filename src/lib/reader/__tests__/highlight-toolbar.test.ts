import { describe, expect, it } from "vitest";
import { clampToolbarAnchor } from "../highlight-toolbar";

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
