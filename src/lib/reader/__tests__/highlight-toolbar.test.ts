import { describe, expect, it } from "vitest";
import { clampToolbarAnchor } from "../highlight-toolbar";

describe("highlight toolbar anchor", () => {
  it("keeps a floating toolbar on-screen on a 390px phone", () => {
    expect(clampToolbarAnchor(40, -80, 390)).toEqual({ top: 72, left: 16 });
    expect(clampToolbarAnchor(180, 500, 390)).toEqual({ top: 172, left: 374 });
  });

  it("leaves desktop anchors near the selection", () => {
    expect(clampToolbarAnchor(240, 640, 1440)).toEqual({ top: 232, left: 640 });
  });
});
