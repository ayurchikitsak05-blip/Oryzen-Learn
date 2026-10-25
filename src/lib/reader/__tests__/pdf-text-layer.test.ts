import { describe, expect, it } from "vitest";
import { runsForPassage, runsFromTextItems } from "../pdf-text-layer";

const letterViewport = [1, 0, 0, -1, 0, 792];

describe("pdf text layer", () => {
  it("places a body line on the glyph box and leaves the heading out of the passage", () => {
    const runs = runsFromTextItems(
      [
        { str: "NEWTON'S FIRST LAW", width: 180, height: 16, transform: [16, 0, 0, 16, 48, 720] },
        {
          str: "An object at rest stays at rest.",
          width: 220,
          height: 12,
          transform: [12, 0, 0, 12, 48, 680],
        },
      ],
      letterViewport
    );
    const body = runsForPassage(runs, "An object at rest stays at rest.");
    expect(body).toHaveLength(1);
    expect(body[0]?.left).toBe(48);
    expect(body[0]?.top).toBeCloseTo(102.4);
    expect(body[0]?.fontSize).toBe(12);
  });

  it("keeps wrapped lines when they reconstruct the passage", () => {
    const runs = runsFromTextItems(
      [
        { str: "AREA OF A RECTANGLE", width: 200, height: 16, transform: [16, 0, 0, 16, 48, 720] },
        { str: "Area equals length times width.", width: 240, height: 12, transform: [12, 0, 0, 12, 48, 680] },
        { str: "A 4 by 3 rectangle has area 12.", width: 230, height: 12, transform: [12, 0, 0, 12, 48, 662] },
      ],
      letterViewport
    );
    const body = runsForPassage(runs, "Area equals length times width. A 4 by 3 rectangle has area 12.");
    expect(body.map((run) => run.text)).toEqual([
      "Area equals length times width.",
      "A 4 by 3 rectangle has area 12.",
    ]);
    expect(body[1]?.top).toBeCloseTo(120.4);
  });
});
