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
    expect(payload.illustrative?.flowchart.nodes.length).toBeGreaterThanOrEqual(3);
    expect(payload.illustrative?.mindMap.kind).toBe("mind_map");
    expect(payload.illustrative?.mindMap.nodes.length).toBeGreaterThanOrEqual(3);
    expect(payload.illustrative?.conceptDiagram.edges.length).toBeGreaterThanOrEqual(3);
    expect(payload.illustrative?.analogy.takeaway).toMatch(/Newton|velocity|force/i);
    expect(payload.markdown_body).not.toMatch(/```|\[Core Idea\]/);
  });

  it("renders a revision table and memory aid from the passage", () => {
    const payload = composeDeterministicLensPayload(
      requestFor("high_yield_revision", PHYSICS_PASSAGE)
    );
    expect(payload.revision?.revisionTable.length).toBeGreaterThanOrEqual(3);
    expect(payload.revision?.memoryAid).toMatch(/Newton|velocity|force|cause/i);
    expect(payload.revision?.memoryAid).not.toMatch(/Vata|Pitta|Kapha|Ayurveda/i);
    expect(payload.markdown_body).toContain("| Topic | What to remember |");
    expect(payload.markdown_body).toMatch(/Newton|velocity|force/i);
    expect(payload.markdown_body).not.toMatch(/citation junk|Vata|Pitta/i);
  });

  it("does not use Ayurveda in a marketing memory aid", () => {
    const marketing =
      "A landing page should lead with one customer outcome, then show proof, then one clear call to action.";
    const payload = composeDeterministicLensPayload(
      requestFor("high_yield_revision", marketing)
    );
    expect(payload.revision?.memoryAid).toMatch(/outcome|proof|ask|lead/i);
    expect(payload.revision?.memoryAid).not.toMatch(/Vata|Pitta|Kapha|Dosha|Ayurveda/i);
  });

  it("grounds Test Me answers in the selected passage", () => {
    const payload = composeDeterministicLensPayload(
      requestFor("test_me", PHYSICS_PASSAGE)
    );
    expect(payload.mcqs?.length).toBeGreaterThan(0);
    expect(payload.mcqs?.[0].options[0]).toMatch(/velocity|Newton|force/i);
    expect(payload.mcqs?.[0].explanation).toMatch(/passage/i);
    expect(payload.short_answers?.[0].prompt).toMatch(/velocity|Newton|force|free-body|idea/i);
  });

  it("explains the passage without reprinting the whole source", () => {
    const payload = composeDeterministicLensPayload(
      requestFor("explain", PHYSICS_PASSAGE)
    );
    expect(payload.title).toBe("Explain This Passage");
    expect(payload.explain?.simpleExplanation).toMatch(/Newton|velocity|force/i);
    expect(payload.explain?.keyTakeaway.length).toBeGreaterThan(20);
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
