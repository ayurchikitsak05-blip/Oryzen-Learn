import { describe, expect, it } from "vitest";
import { notesFromTimedTextXml } from "../public-captions";

describe("public YouTube captions", () => {
  it("turns timedtext XML into timestamped notes without inventing speech", () => {
    const notes = notesFromTimedTextXml(
      `<transcript><text start="12.5" dur="2">Current is flow of charge</text></transcript>`,
      "abc123"
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]?.speakerTranscript).toBe("Current is flow of charge");
    expect(notes[0]?.timestampBadge).toBe("[00:12]");
  });
});
