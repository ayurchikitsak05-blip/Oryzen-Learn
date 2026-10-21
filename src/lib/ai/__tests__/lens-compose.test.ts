import { describe, expect, it } from "vitest";
import {
  composeDeterministicLensPayload,
  passageDiscussesAyurveda,
} from "../lens-compose";

const PHYSICS_PASSAGE =
  "An object keeps a constant velocity unless a net force acts on it. That is Newton's first law, and it is the reason a free-body diagram starts by asking what is actually pushing or pulling.";

const AYURVEDA_PASSAGE =
  "Vata, Pitta, and Kapha are three study energies. Balance supports clear grasping in any subject.";

function requestFor(lensType: "ayurvedic" | "illustrative" | "high_yield_revision" | "save_passage" | "test_me" | "explain", text: string) {
  return {
    request: {
      documentId: "doc-1",
      pageNumber: 13,
      sectionHeading: "Campaign blueprint",
      selectedText: text,
      lensType,
      prakritiDosha: "Pitta" as const,
    },
    ragChunks: [],
  };
}

describe("deterministic study lenses", () => {
  it("does not insert Ayurveda into a technical passage for the learning-approach lens", () => {
    expect(passageDiscussesAyurveda(PHYSICS_PASSAGE)).toBe(false);
    const payload = composeDeterministicLensPayload(
      requestFor("ayurvedic", PHYSICS_PASSAGE)
    );
    expect(payload.title).toBe("Explore My Learning Approach");
    expect(payload.markdown_body).toMatch(/Newton|velocity|force/i);
    expect(payload.markdown_body).not.toMatch(/Vata|Pitta|Kapha|Dosha|Ayurveda/i);
    expect(payload.markdown_body.length).toBeGreaterThan(80);
  });

  it("builds a real flowchart for Illustrative View", () => {
    const payload = composeDeterministicLensPayload(
      requestFor("illustrative", PHYSICS_PASSAGE)
    );
    expect(payload.diagram?.nodes.length).toBeGreaterThanOrEqual(3);
    expect(payload.diagram?.edges.length).toBeGreaterThanOrEqual(2);
    expect(payload.markdown_body).toMatch(/flowchart/i);
  });

  it("renders a revision table and memory aid from the passage", () => {
    const payload = composeDeterministicLensPayload(
      requestFor("high_yield_revision", PHYSICS_PASSAGE)
    );
    expect(payload.markdown_body).toContain("| Focus | What to remember |");
    expect(payload.markdown_body).toMatch(/Newton|velocity|force/i);
    expect(payload.markdown_body).not.toMatch(/citation junk|Vata|Pitta/i);
  });

  it("grounds Test Me answers in the selected passage", () => {
    const payload = composeDeterministicLensPayload(
      requestFor("test_me", PHYSICS_PASSAGE)
    );
    expect(payload.mcqs?.length).toBeGreaterThan(0);
    expect(payload.mcqs?.[0].options[0]).toMatch(/velocity|Newton|force/i);
    expect(payload.mcqs?.[0].explanation).toMatch(/passage/i);
  });

  it("explains the passage without reprinting the whole source", () => {
    const payload = composeDeterministicLensPayload(
      requestFor("explain", PHYSICS_PASSAGE)
    );
    expect(payload.title).toBe("Explain This Passage");
    expect(payload.markdown_body).toMatch(/Newton|velocity|force/i);
    expect(payload.markdown_body).not.toContain(PHYSICS_PASSAGE);
  });

  it("can mention Ayurveda when the passage itself does", () => {
    expect(passageDiscussesAyurveda(AYURVEDA_PASSAGE)).toBe(true);
    const payload = composeDeterministicLensPayload(
      requestFor("explain", AYURVEDA_PASSAGE)
    );
    expect(payload.markdown_body).toMatch(/Vata|Pitta|Kapha/);
  });
});
