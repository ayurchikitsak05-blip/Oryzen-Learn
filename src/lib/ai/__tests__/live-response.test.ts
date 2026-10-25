import { describe, expect, it } from "vitest";
import { composeDeterministicLensPayload } from "../lens-compose";
import { mergeStructuredLensPayload } from "../gemini-structured";
import { geminiRestSchemaForLens } from "../lens-schema";

const NEWTON =
  "Newton's first law says an object keeps a constant velocity unless a net force acts on it. A puck on ice keeps sliding until a stick or friction changes that velocity.";

const LOCAL_DRAFT = "An object keeps going the same way if nothing pushes it.";

const CAPTURED_EXPLAIN = {
  title: "Newton's First Law of Motion",
  markdown_body:
    "### Simple Explanation Newton's first law states that an object maintains a constant velocity unless an outside force acts upon it. For example, an ice hockey puck continues sliding smoothly until friction or a hockey stick interferes. ### Standard Explanation In classical mechanics, inertia dictates that objects resist changes to their state of motion. When no net force is present, an object will preserve its current velocity, which includes remaining completely still or moving in a straight line at a steady speed. ### Deeper Explanation This fundamental principle defines inertial reference frames. The velocity vector remains invariant over time if and only if the vector sum of all external forces equals zero. Any observed acceleration requires a non-zero net force to alter the momentum of the system.",
  key_points: [
    "An object maintains a constant velocity in the absence of a net force.",
    "Friction is an example of an external force that changes an object's velocity.",
  ],
};

const CAPTURED_PROSE = {
  title: "Newton's First Law of Motion",
  markdown_body:
    "Newton's first law explains that objects maintain a constant velocity until acted upon by a net force. For example, a hockey puck on ice continues sliding continuously until an external force, such as a hockey stick or friction, alters its velocity.",
  key_points: [
    "Objects maintain a constant velocity by default",
    "A net force is required to change an object's velocity",
  ],
};

function draftFor(lens: "explain" | "illustrative" | "story" | "high_yield_revision" | "test_me") {
  return composeDeterministicLensPayload({
    request: {
      documentId: "bench",
      pageNumber: 1,
      sectionHeading: "Newton's first law",
      selectedText: NEWTON,
      lensType: lens,
    },
    ragChunks: [],
  });
}

describe("captured Gemini responses stay out of the local draft", () => {
  it("turns labeled explain markdown into three different depths", () => {
    const merged = mergeStructuredLensPayload(draftFor("explain"), CAPTURED_EXPLAIN, "explain");
    expect(merged.usable).toBe(true);
    expect(merged.payload.used_fallback).toBe(false);
    expect(merged.missingStructure).not.toContain("explain");
    expect(merged.payload.explain?.simpleExplanation).toMatch(/ice hockey puck/i);
    expect(merged.payload.explain?.standardExplanation).toMatch(/inertia/i);
    expect(merged.payload.explain?.deeperExplanation).toMatch(/net force/i);
    expect(merged.payload.explain?.simpleExplanation).not.toBe(
      merged.payload.explain?.standardExplanation
    );
    expect(merged.payload.explain?.standardExplanation).not.toBe(
      merged.payload.explain?.deeperExplanation
    );
    expect(JSON.stringify(merged.payload.explain)).not.toContain(LOCAL_DRAFT);
  });

  it("keeps prose when a diagram was not returned and does not insert the local flowchart", () => {
    const merged = mergeStructuredLensPayload(
      draftFor("illustrative"),
      CAPTURED_PROSE,
      "illustrative"
    );
    expect(merged.usable).toBe(true);
    expect(merged.payload.used_fallback).toBe(false);
    expect(merged.missingStructure).toContain("illustrative");
    expect(merged.payload.illustrative).toBeUndefined();
    expect(merged.payload.diagram).toBeUndefined();
    expect(merged.payload.markdown_body).toMatch(/hockey puck/i);
    expect(merged.payload.markdown_body).not.toContain(LOCAL_DRAFT);
  });

  it("keeps a real flowchart, concept map, and quiz that the model returned", () => {
    const merged = mergeStructuredLensPayload(
      draftFor("test_me"),
      {
        title: "Newton's first law",
        markdown_body:
          "A puck on ice keeps a constant velocity until a stick or friction changes that velocity.",
        key_points: ["constant velocity", "net force"],
        illustrative: {
          flowchart: {
            title: "When velocity changes",
            kind: "flowchart",
            nodes: [
              { id: "keep", label: "Object keeps constant velocity" },
              { id: "force", label: "A net force acts" },
              { id: "change", label: "Velocity can change" },
            ],
            edges: [
              { from: "keep", to: "force", label: "unless" },
              { from: "force", to: "change", label: "then" },
            ],
          },
          mindMap: {
            title: "First law",
            kind: "mind_map",
            nodes: [
              { id: "law", label: "Newton's first law" },
              { id: "velocity", label: "Constant velocity" },
              { id: "net", label: "Unless a net force" },
            ],
            edges: [
              { from: "law", to: "velocity" },
              { from: "law", to: "net" },
            ],
          },
        },
        mcqs: [
          {
            question: "What stays the same until a net force acts on the puck?",
            options: [
              "Only the colour of the puck.",
              "The object's velocity, its speed and direction.",
              "The mass of the puck must double.",
              "The puck must stop as soon as the push ends.",
            ],
            correctIndex: 1,
            explanation: "Newton's first law says velocity stays constant unless a net force acts.",
          },
        ],
      },
      "test_me"
    );
    expect(merged.payload.mcqs).toHaveLength(1);
    expect(merged.payload.mcqs?.[0]?.correctIndex).toBe(1);
    expect(merged.payload.mcqs?.[0]?.options).toHaveLength(4);
    expect(merged.payload.illustrative?.flowchart?.nodes.length).toBe(3);
    expect(merged.payload.illustrative?.mindMap?.edges.length).toBe(2);
    expect(JSON.stringify(merged.payload)).not.toContain(LOCAL_DRAFT);
  });

  it("rejects identical explanation depths instead of copying the local draft", () => {
    const merged = mergeStructuredLensPayload(
      draftFor("explain"),
      {
        title: "Repeat",
        markdown_body:
          "Newton's first law says an object keeps a constant velocity unless a net force acts on the puck.",
        explain: {
          simpleExplanation: "Velocity stays the same unless a net force acts.",
          standardExplanation: "Velocity stays the same unless a net force acts.",
          deeperExplanation: "Velocity stays the same unless a net force acts.",
          keyTakeaway: "Velocity stays the same unless a net force acts.",
          relevantExample: "A puck on ice.",
          importantConcepts: ["net force"],
        },
      },
      "explain"
    );
    expect(merged.payload.explain).toBeUndefined();
    expect(merged.payload.used_fallback).toBe(false);
    expect(merged.payload.markdown_body).toMatch(/constant velocity/);
    expect(JSON.stringify(merged.payload)).not.toContain(LOCAL_DRAFT);
  });

  it("asks Gemini for the fields that belong to each study mode", () => {
    expect(geminiRestSchemaForLens("explain").required).toEqual([
      "title",
      "markdown_body",
      "key_points",
      "explain",
    ]);
    expect(geminiRestSchemaForLens("illustrative").required).toContain("illustrative");
    expect(geminiRestSchemaForLens("story").required).toContain("story");
    expect(geminiRestSchemaForLens("high_yield_revision").required).toContain("revision");
    expect(geminiRestSchemaForLens("test_me").required).toContain("mcqs");
    expect(geminiRestSchemaForLens("ask_my_book").required).toContain("askMyBook");
    expect(geminiRestSchemaForLens("markdown").required).not.toContain("explain");
  });
});
