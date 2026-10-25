import { describe, expect, it } from "vitest";
import type { AiLensResponsePayload } from "../gateway";
import {
  classifyGeminiError,
  hasUsableGeminiKey,
  mergeStructuredLensPayload,
} from "../gemini-structured";

const fallback: AiLensResponsePayload = {
  lens_type: "illustrative",
  prakriti_dosha: "Vata",
  title: "Illustrative View",
  markdown_body: "Fallback draft about Newton's first law and constant velocity.",
  key_points: ["velocity"],
  citations: [],
  used_fallback: true,
  diagram: {
    title: "Fallback flowchart",
    kind: "flowchart",
    nodes: [
      { id: "a", label: "Claim" },
      { id: "b", label: "Support" },
    ],
    edges: [{ from: "a", to: "b", label: "then" }],
  },
};

describe("structured Gemini helpers", () => {
  it("treats blank GEMINI_API_KEY as missing", () => {
    const previous = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "";
    try {
      expect(hasUsableGeminiKey()).toBe(false);
    } finally {
      process.env.GEMINI_API_KEY = previous;
    }
  });

  it("classifies billing, quota, auth, and timeout without exposing secrets", () => {
    expect(classifyGeminiError(new Error("429 RESOURCE_EXHAUSTED quota exceeded"))).toBe(
      "quota"
    );
    expect(
      classifyGeminiError(new Error("You must enable billing on this project"))
    ).toBe("billing");
    expect(classifyGeminiError(new Error("PERMISSION_DENIED 403"))).toBe("auth");
    expect(classifyGeminiError(new Error("timeout"))).toBe("timeout");
    expect(classifyGeminiError("safety blocked")).toBe("safety");
  });

  it("keeps fallback diagrams when Gemini returns empty nodes", () => {
    const merged = mergeStructuredLensPayload(fallback, {
      title: "From Gemini",
      markdown_body: "A short unusable line",
      key_points: [],
      diagram: { title: "Broken", nodes: [], edges: [] },
    });
    expect(merged.usable).toBe(false);
    expect(merged.payload.diagram?.nodes.length).toBe(2);
  });

  it("accepts a valid structured diagram and explain block", () => {
    const merged = mergeStructuredLensPayload(fallback, {
      title: "Illustrative View",
      markdown_body: "The passage says an object keeps a constant velocity unless a net force acts.",
      key_points: ["constant velocity", "net force"],
      diagram: {
        title: "Force line",
        kind: "flowchart",
        nodes: [
          { id: "idea", label: "constant velocity" },
          { id: "claim", label: "a net force" },
          { id: "check", label: "Newton's first law" },
        ],
        edges: [
          { from: "idea", to: "claim", label: "unless" },
          { from: "claim", to: "check", label: "then" },
        ],
      },
      explain: {
        simpleExplanation: "The object keeps moving unless something pushes it.",
        standardExplanation: "Newton's first law: constant velocity unless a net force acts.",
        deeperExplanation: "Start the free-body diagram by naming actual pushes and pulls.",
        importantConcepts: ["velocity", "net force"],
        relevantExample: "A puck on ice keeps sliding until a stick hits it.",
        keyTakeaway: "Hold the force-to-velocity line.",
      },
    });
    expect(merged.usable).toBe(true);
    expect(merged.payload.used_fallback).toBe(false);
    expect(merged.payload.diagram?.nodes.length).toBe(3);
    expect(merged.payload.explain?.simpleExplanation).toMatch(/moving|force/i);
  });

  it("rejects generic claim/support explain and copy/retell stories", () => {
    const generic = mergeStructuredLensPayload(fallback, {
      title: "Explain",
      markdown_body: "A long enough markdown body that looks usable to the merger but teaches nothing extra about the excerpt.",
      explain: {
        simpleExplanation: "This page is about equation. Hold one clear claim.",
        standardExplanation: "equation is defined by the claim. Worked example: restate the claim, then the support, without copying the paragraph.",
        deeperExplanation: "Cover the page and say the claim.",
        importantConcepts: ["equation"],
        relevantExample: "Hold one clear claim.",
        keyTakeaway: "Hold one clear claim.",
      },
      story: {
        opening: "A student meets “equation” as a problem, not as a paragraph to copy.",
        turningPoint: "They stack quotes.",
        close: "If they can retell the scene without looking back, they have the idea. Copying the page is not the same as being able to use it.",
      },
    });
    expect(generic.payload.explain).toBeUndefined();
    expect(generic.payload.story).toBeUndefined();
    expect(generic.payload.explain?.simpleExplanation ?? "").not.toMatch(/this page is about/i);
    expect(generic.payload.story?.opening ?? "").not.toMatch(/paragraph to copy/i);
  });

  it("keeps a longer multiline Ask My Book answer from the model", () => {
    const merged = mergeStructuredLensPayload(
      {
        ...fallback,
        lens_type: "ask_my_book",
        askMyBook: {
          question: "How do you solve ax + b = 0 for x?",
          answer: "A linear equation has the form ax + b = 0.",
          sufficientSource: true,
        },
      },
      {
        title: "Ask My Book",
        markdown_body: "To solve ax + b = 0, isolate x.\nThe result is x = -b / a.",
        key_points: ["x = -b / a"],
        askMyBook: {
          question: "How do you solve ax + b = 0 for x?",
          answer:
            "Subtract b from both sides, then divide by a.\n\nThe result is x = -b / a, with a ≠ 0.",
          sufficientSource: true,
        },
      }
    );
    expect(merged.usable).toBe(true);
    expect(merged.payload.askMyBook?.answer).toMatch(/x = -b \/ a/);
    expect(merged.payload.askMyBook?.answer).toMatch(/\n/);
  });
});
