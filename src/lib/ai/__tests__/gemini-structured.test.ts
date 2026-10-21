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
          { id: "idea", label: "velocity" },
          { id: "claim", label: "net force" },
          { id: "check", label: "first law" },
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
});
