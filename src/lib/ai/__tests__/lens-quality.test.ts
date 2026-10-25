import { describe, expect, it } from "vitest";
import {
  diagramExplainsSource,
  filterRevisionTable,
  isEducationallyEmptyLabel,
  isGenericExplainTemplate,
  isGenericStudyStory,
  isMeaningfulRevisionCell,
  isQualityMcq,
  placeCorrectOption,
  preferValidatedMcqs,
  retainGroundedDiagrams,
} from "../lens-quality";

const LINEAR =
  "A linear equation in one variable has the form ax + b = 0, where a is not zero. Solving for x gives x = -b / a.";

describe("educational quality guards", () => {
  it("flags generic claim/support explain and copy/retell stories", () => {
    expect(
      isGenericExplainTemplate(
        "This page is about equation. Hold one clear claim. Restate the claim, then the support, without copying the paragraph."
      )
    ).toBe(true);
    expect(
      isGenericStudyStory(
        "A student meets “equation” as a problem, not as a paragraph to copy. If they can retell the scene without looking back, they have the idea."
      )
    ).toBe(true);
    expect(
      isGenericExplainTemplate(
        "A linear equation has one unknown, x. Inverse operations isolate x so x = -b / a."
      )
    ).toBe(false);
  });

  it("drops single-word leftover revision cells and keeps complete rows", () => {
    expect(isMeaningfulRevisionCell("keeps")).toBe(false);
    expect(isMeaningfulRevisionCell("where")).toBe(false);
    expect(isMeaningfulRevisionCell("Constant velocity unless a net force acts.")).toBe(true);
    const kept = filterRevisionTable([
      { topic: "Support", remember: "keeps" },
      { topic: "First law", remember: "Constant velocity unless a net force acts." },
      { topic: "Check", remember: "Name the leftover force before velocity can change." },
    ]);
    expect(kept).toHaveLength(2);
    expect(kept.every((row) => row.remember.trim().split(/\s+/).length >= 2)).toBe(true);
  });

  it("rejects empty mind-map leftovers and keeps complete labels", () => {
    expect(isEducationallyEmptyLabel("keeps")).toBe(true);
    expect(isEducationallyEmptyLabel("Linear equation")).toBe(false);
    expect(isEducationallyEmptyLabel("x = -b / a")).toBe(false);
  });

  it("rejects dummy always-A quizzes and keeps validated model items without padding", () => {
    const dummy = {
      question: "According to the selected passage, which statement is grounded in the text?",
      options: [
        "A formula or date that is not mentioned on this page.",
        "An author biography that the passage never gives.",
        "A definition copied from a different subject.",
        "A later chapter result that these selected lines do not give.",
      ] as [string, string, string, string],
      correctIndex: 0,
      explanation: "Dummy",
      concept: "padding",
      citationLabel: "[Page 1]",
    };
    const good = {
      question: "Why must a not be zero in ax + b = 0?",
      options: [
        "If a is zero, you cannot divide to get x = -b / a.",
        "b has to be zero or the graph is not a line.",
        "x is already known, so a does not matter.",
        "a is only a label and can be anything.",
      ] as [string, string, string, string],
      correctIndex: 0,
      explanation: "The linear equation form needs a not zero so x = -b / a is defined.",
      concept: "coefficient a",
      citationLabel: "[Page 1]",
    };
    expect(isQualityMcq(dummy, LINEAR)).toBe(false);
    expect(isQualityMcq(good, LINEAR)).toBe(true);
    expect(preferValidatedMcqs([dummy, good], [dummy], LINEAR)).toEqual([good]);
    expect(preferValidatedMcqs([dummy], undefined, LINEAR)).toBeUndefined();
  });

  it("rotates the correct option across A, B, C, and D", () => {
    const slots = [0, 1, 2, 3].map((slot) =>
      placeCorrectOption("right", ["w1", "w2", "w3"], slot)
    );
    expect(slots.map((item) => item.correctIndex)).toEqual([0, 1, 2, 3]);
    expect(new Set(slots.map((item) => item.correctIndex)).size).toBe(4);
    expect(slots.every((item) => item.options[item.correctIndex] === "right")).toBe(true);
  });

  it("accepts a passage relationship and rejects an invented scene", () => {
    const source =
      "An object keeps a constant velocity unless a net force acts on it. That is Newton's first law.";
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { label: "Object keeps constant velocity" },
            { label: "A net force acts" },
          ],
          edges: [{ label: "unless" }],
        },
        source
      )
    ).toBe(true);
    expect(
      diagramExplainsSource(
        {
          nodes: [{ label: "Hockey puck on ice" }, { label: "Gust of wind" }],
          edges: [{ label: "then" }],
        },
        source
      )
    ).toBe(false);
    const kept = retainGroundedDiagrams(
      {
        diagram: undefined,
        missingStructure: [],
        illustrative: {
          flowchart: {
            nodes: [{ label: "Hockey puck on ice" }, { label: "Gust of wind" }],
            edges: [{ label: "then" }],
          },
          mindMap: {
            nodes: [
              { id: "law", label: "Newton's first law" },
              { id: "motion", label: "An object keeps constant velocity" },
            ],
            edges: [{ from: "law", to: "motion", label: "states" }],
          },
        },
      },
      source
    );
    expect(kept.illustrative?.flowchart).toBeUndefined();
    expect(kept.illustrative?.mindMap?.nodes[0]?.label).toMatch(/first law/i);
    expect(kept.missingStructure).toContain("flowchart");
    expect(kept.missingStructure).not.toContain("illustrative");
  });

  it("rejects the live Newton arrows that invented a force or a diagram", () => {
    const source =
      "An object keeps a constant velocity unless a net force acts on it. That is Newton's first law, and it is the reason a free-body diagram starts by asking what is actually pushing or pulling.";
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "velocity", label: "constant velocity" },
            { id: "force", label: "net force" },
            { id: "diagram", label: "free-body diagram" },
          ],
          edges: [
            { from: "velocity", to: "force", label: "unless" },
            { from: "force", to: "diagram", label: "becomes" },
          ],
        },
        source
      )
    ).toBe(false);
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "law", label: "Newton's first law" },
            { id: "velocity", label: "constant velocity" },
            { id: "force", label: "net force" },
          ],
          edges: [
            { from: "law", to: "velocity", label: "equals" },
            { from: "law", to: "force", label: "causes" },
          ],
        },
        source
      )
    ).toBe(false);
    const kept = retainGroundedDiagrams(
      {
        missingStructure: [],
        illustrative: {
          flowchart: {
            nodes: [
              { id: "velocity", label: "constant velocity" },
              { id: "force", label: "net force" },
              { id: "diagram", label: "free-body diagram" },
            ],
            edges: [
              { from: "velocity", to: "force", label: "unless" },
              { from: "force", to: "diagram", label: "becomes" },
            ],
          },
          mindMap: {
            nodes: [
              { id: "law", label: "Newton's first law" },
              { id: "velocity", label: "constant velocity" },
            ],
            edges: [{ from: "law", to: "velocity", label: "equals" }],
          },
        },
      },
      source
    );
    expect(kept.illustrative?.flowchart).toBeUndefined();
    expect(kept.illustrative?.mindMap).toBeUndefined();
    expect(kept.missingStructure).toContain("flowchart");
    expect(kept.missingStructure).toContain("illustrative");
  });

  it("keeps a rectangle area identity and rejects an invented cause", () => {
    const source =
      "The area of a rectangle is length times width. If the length is 8 cm and the width is 5 cm, the area is 40 square centimetres.";
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "area", label: "Area of a rectangle" },
            { id: "rule", label: "Length times width" },
          ],
          edges: [{ from: "area", to: "rule", label: "equals" }],
        },
        source
      )
    ).toBe(true);
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "area", label: "Rectangle area" },
            { id: "width", label: "Width of the rectangle" },
          ],
          edges: [{ from: "area", to: "width", label: "causes" }],
        },
        source
      )
    ).toBe(false);
  });
});
