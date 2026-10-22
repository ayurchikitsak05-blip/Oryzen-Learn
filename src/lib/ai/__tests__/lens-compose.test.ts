import { describe, expect, it } from "vitest";
import {
  TEST_ME_QUESTION_COUNT,
  composeDeterministicLensPayload,
  composeRevisionFromMisses,
  explanationTokenOverlap,
  explanationsAreDistinct,
  identifyIncorrectAnswers,
  longestSharedWordRun,
  parseRectangleMeasures,
  passageDiscussesAyurveda,
  preferTenGroundedMcqs,
  weakConceptsFromMisses,
} from "../lens-compose";

const PHYSICS_PASSAGE =
  "An object keeps a constant velocity unless a net force acts on it. That is Newton's first law, and it is the reason a free-body diagram starts by asking what is actually pushing or pulling.";

const MATH_PASSAGE =
  "The area of a rectangle is length times width. If the length is 8 cm and the width is 5 cm, the area is 40 square centimetres.";

const AYURVEDA_PASSAGE =
  "Vata, Pitta, and Kapha are three study energies. Balance supports clear grasping in any subject.";

function requestFor(lensType: "ayurvedic" | "illustrative" | "high_yield_revision" | "save_passage" | "test_me" | "explain" | "story", text: string) {
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

  it("grounds ten Test Me answers in the selected science passage", () => {
    const payload = composeDeterministicLensPayload(
      requestFor("test_me", PHYSICS_PASSAGE)
    );
    expect(payload.mcqs).toHaveLength(TEST_ME_QUESTION_COUNT);
    expect(payload.mcqs?.[0].options[0]).toMatch(/velocity|Newton|force/i);
    expect(payload.mcqs?.[0].explanation).toMatch(/passage/i);
    expect(payload.mcqs?.every((item) => item.citationLabel === "[Page 13]")).toBe(true);
    expect(payload.mcqs?.every((item) => /velocity|Newton|force|object|diagram/i.test(JSON.stringify(item)))).toBe(true);
    expect(payload.short_answers?.[0].prompt).toMatch(/velocity|Newton|force|free-body|idea/i);
  });

  it("grounds ten math questions and rolls misses into a revision sheet", () => {
    const payload = composeDeterministicLensPayload(
      requestFor("test_me", MATH_PASSAGE)
    );
    expect(payload.mcqs).toHaveLength(10);
    expect(payload.mcqs?.[0].options[0]).toMatch(/area|length|width|40/i);
    expect(JSON.stringify(payload.mcqs)).not.toMatch(/Vata|Pitta|Kapha|Ayurveda/i);
    const wrongAll = Object.fromEntries(
      (payload.mcqs ?? []).map((_, index) => [index, 1])
    );
    const misses = identifyIncorrectAnswers(payload.mcqs ?? [], wrongAll);
    expect(misses).toHaveLength(10);
    const weak = weakConceptsFromMisses(misses);
    expect(weak.length).toBeGreaterThan(0);
    const revision = composeRevisionFromMisses({
      selectedText: MATH_PASSAGE,
      misses,
    });
    expect(revision.quickSummary).toMatch(/missed|area|width|length/i);
    expect(revision.revisionTable.some((row) => /area|width|length|rectangle/i.test(row.topic + row.remember))).toBe(true);
    expect(preferTenGroundedMcqs(payload.mcqs?.slice(0, 2), payload.mcqs)).toHaveLength(10);
  });

  it("explains the passage without reprinting the whole source", () => {
    const payload = composeDeterministicLensPayload(
      requestFor("explain", PHYSICS_PASSAGE)
    );
    expect(payload.title).toBe("Explain This Passage");
    expect(payload.explain?.simpleExplanation).toMatch(/Newton|velocity|force|object/i);
    expect(payload.explain?.simpleExplanation.split(".").filter(Boolean).length).toBeLessThanOrEqual(3);
    expect(payload.explain?.keyTakeaway.length).toBeGreaterThan(20);
    expect(payload.markdown_body).toMatch(/Newton|velocity|force/i);
    expect(payload.markdown_body).not.toContain(PHYSICS_PASSAGE);
  });

  it("tells a passage-grounded story without Ayurveda on a physics passage", () => {
    const payload = composeDeterministicLensPayload(
      requestFor("story", PHYSICS_PASSAGE)
    );
    expect(payload.title).toBe("Story Mode");
    expect(payload.story?.opening).toMatch(/puck|ice|bus|student|Leah/i);
    expect(payload.story?.turningPoint).toMatch(/force|velocity|rough ice/i);
    expect(payload.story?.close).toMatch(/force sketch|leftover force|velocity/i);
    const story = `${payload.story?.opening} ${payload.story?.turningPoint} ${payload.story?.close}`;
    expect(longestSharedWordRun(PHYSICS_PASSAGE, story)).toBeLessThan(10);
    expect(payload.markdown_body).not.toMatch(/Vata|Pitta|Kapha|Ayurveda/i);
  });

  it("makes Simple, Standard, and Deeper meaningfully different with required sections", () => {
    const math = composeDeterministicLensPayload(requestFor("explain", MATH_PASSAGE));
    const explain = math.explain!;
    expect(explanationsAreDistinct(explain)).toBe(true);
    expect(explanationTokenOverlap(explain.simpleExplanation, explain.standardExplanation)).toBeLessThan(
      0.58
    );
    expect(explain.simpleExplanation.split(/[.!?]/).filter((part) => part.trim().length > 8).length).toBeGreaterThanOrEqual(
      2
    );
    expect(
      explain.simpleExplanation
        .split(/[.!?]/)
        .filter((part) => part.trim())
        .every((part) => part.trim().split(/\s+/).length <= 20)
    ).toBe(true);
    expect(explain.simpleExplanation).toMatch(/example|8 cm|40/i);
    expect(explain.standardExplanation).toMatch(/defined|formula|length times width|right angle/i);
    expect(explain.standardExplanation).toMatch(/worked example|8 .+5|8 cm/i);
    expect(explain.deeperExplanation).toMatch(/why|grid|multiply/i);
    expect(explain.deeperExplanation).toMatch(/misconception|common/i);
    expect(explain.deeperExplanation).toMatch(/self-check/i);
    expect(explain.simpleExplanation.length).toBeLessThan(explain.standardExplanation.length);
    expect(explain.standardExplanation.length).toBeLessThan(explain.deeperExplanation.length);

    const physics = composeDeterministicLensPayload(requestFor("explain", PHYSICS_PASSAGE));
    expect(explanationsAreDistinct(physics.explain!)).toBe(true);
    expect(physics.explain?.deeperExplanation).toMatch(/inertia|misconception|self-check/i);
  });

  it("draws a labelled 8 by 5 rectangle instead of a generic keyword graph", () => {
    expect(parseRectangleMeasures(MATH_PASSAGE)).toEqual({
      length: 8,
      width: 5,
      area: 40,
      unit: "cm",
    });
    const payload = composeDeterministicLensPayload(
      requestFor("illustrative", MATH_PASSAGE)
    );
    const flowchart = payload.illustrative?.flowchart;
    const concept = payload.illustrative?.conceptDiagram;
    const mind = payload.illustrative?.mindMap;
    expect(flowchart?.geometry).toMatchObject({
      kind: "rectangle",
      length: 8,
      width: 5,
      lengthLabel: "L = 8 cm",
      widthLabel: "W = 5 cm",
      areaLabel: "Area = 40 cm²",
    });
    expect(concept?.geometry).toEqual(flowchart?.geometry);
    expect(flowchart?.nodes.some((node) => /8|length/i.test(node.label))).toBe(true);
    expect(flowchart?.nodes.some((node) => /multiply|×/i.test(node.label))).toBe(true);
    expect(flowchart?.nodes.some((node) => /40/i.test(node.label))).toBe(true);
    expect(mind?.nodes[0]?.label).toMatch(/area/i);
    expect(mind?.nodes.some((node) => /L × W|formula/i.test(node.label))).toBe(true);
    expect(payload.illustrative?.analogy.mapping).toMatch(/8.+5.+40/);
    expect(payload.illustrative?.analogy.takeaway).toMatch(/unit squares|edge/i);
  });

  it("tells an age-appropriate rectangle story that explains area instead of paraphrasing the page", () => {
    const payload = composeDeterministicLensPayload(requestFor("story", MATH_PASSAGE));
    const story = `${payload.story?.opening} ${payload.story?.turningPoint} ${payload.story?.close}`;
    expect(story).toMatch(/notice board|tiles|paper squares|Mina/i);
    expect(story).toMatch(/8|5|40/);
    expect(story).toMatch(/multiply|unit squares|area/i);
    expect(story).not.toMatch(/The area of a rectangle is length times width/i);
    expect(longestSharedWordRun(MATH_PASSAGE, story)).toBeLessThan(10);
    expect(story).not.toMatch(/Vata|Pitta|Kapha|Ayurveda/i);
  });

  it("can mention Ayurveda when the passage itself does", () => {
    expect(passageDiscussesAyurveda(AYURVEDA_PASSAGE)).toBe(true);
    const payload = composeDeterministicLensPayload(
      requestFor("explain", AYURVEDA_PASSAGE)
    );
    expect(payload.markdown_body).toMatch(/Vata|Pitta|Kapha/);
  });
});
