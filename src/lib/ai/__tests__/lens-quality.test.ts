import { describe, expect, it } from "vitest";
import {
  diagramExplainsSource,
  filterRevisionTable,
  groundIllustrativeDiagrams,
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

  it("rejects the recorded Newton concept map and keeps the unless flowchart", () => {
    const source =
      "An object keeps a constant velocity unless a net force acts on it. That is Newton's first law, and it is the reason a free-body diagram starts by asking what is actually pushing or pulling.";
    const recordedFlowchart = {
      nodes: [
        { id: "node1", label: "constant velocity" },
        { id: "node2", label: "net force" },
      ],
      edges: [{ from: "node1", to: "node2", label: "unless" }],
    };
    const recordedMindMap = {
      nodes: [
        { id: "node1", label: "constant velocity" },
        { id: "node2", label: "net force" },
      ],
      edges: [{ from: "node2", to: "node1", label: "acts on" }],
    };
    expect(diagramExplainsSource(recordedFlowchart, source)).toBe(true);
    expect(diagramExplainsSource(recordedMindMap, source)).toBe(false);
    expect(
      diagramExplainsSource(
        {
          nodes: recordedMindMap.nodes,
          edges: [{ from: "node1", to: "node2", label: "acts on" }],
        },
        source
      )
    ).toBe(false);
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "velocity", label: "constant velocity" },
            { id: "force", label: "net force" },
          ],
          edges: [{ from: "velocity", to: "force", label: "acts on" }],
        },
        "Constant velocity acts on a net force."
      )
    ).toBe(false);
    expect(
      diagramExplainsSource(
        {
          nodes: recordedFlowchart.nodes,
          edges: [{ from: "node2", to: "node1", label: "unless" }],
        },
        source
      )
    ).toBe(false);
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "force", label: "net force" },
            { id: "object", label: "the object" },
          ],
          edges: [{ from: "force", to: "object", label: "acts on" }],
        },
        source
      )
    ).toBe(false);
    const kept = retainGroundedDiagrams(
      {
        missingStructure: [],
        illustrative: {
          flowchart: recordedFlowchart,
          mindMap: recordedMindMap,
          analogy: {
            setup: "Teaching example: a puck on ice.",
            mapping: "The glide stands for constant velocity.",
            takeaway: "A force is a push or a pull on the object.",
          },
        },
      },
      source
    );
    expect(kept.illustrative?.flowchart?.edges[0]?.label).toBe("unless");
    expect(kept.illustrative?.mindMap).toBeUndefined();
    expect(kept.illustrative?.analogy).toBeDefined();
    expect(kept.missingStructure).not.toContain("flowchart");
    expect(kept.missingStructure).not.toContain("illustrative");
  });

  it("checks subject and object roles instead of shared words", () => {
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "force", label: "net force" },
            { id: "object", label: "the object" },
          ],
          edges: [{ from: "force", to: "object", label: "acts on" }],
        },
        "A net force acts on the object."
      )
    ).toBe(true);
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "object", label: "the object" },
            { id: "force", label: "net force" },
          ],
          edges: [{ from: "object", to: "force", label: "acts on" }],
        },
        "A net force acts on the object."
      )
    ).toBe(false);
    const newton =
      "An object keeps a constant velocity unless a net force acts on it. That is Newton's first law.";
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "velocity", label: "constant velocity" },
            { id: "force", label: "net force" },
          ],
          edges: [{ from: "velocity", to: "force", label: "keeps" }],
        },
        newton
      )
    ).toBe(false);
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "force", label: "net force" },
            { id: "velocity", label: "constant velocity" },
          ],
          edges: [{ from: "force", to: "velocity", label: "leads to" }],
        },
        newton
      )
    ).toBe(false);
  });

  it("keeps rectangle identities and multiplication, and rejects the reversed arrows", () => {
    const source =
      "The area of a rectangle is length times width. If the length is 8 cm and the width is 5 cm, the area is 40 square centimetres.";
    const recordedConcept = {
      nodes: [
        { id: "node1", label: "area formula" },
        { id: "node2", label: "length times width" },
      ],
      edges: [{ from: "node1", to: "node2", label: "equals" }],
    };
    expect(diagramExplainsSource(recordedConcept, source)).toBe(true);
    expect(
      diagramExplainsSource(
        {
          nodes: recordedConcept.nodes,
          edges: [{ from: "node2", to: "node1", label: "equals" }],
        },
        source
      )
    ).toBe(false);
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "area", label: "Area of a rectangle" },
            { id: "rule", label: "Length times width" },
            { id: "length", label: "Length of the rectangle" },
            { id: "width", label: "Width of the rectangle" },
          ],
          edges: [
            { from: "area", to: "rule", label: "equals" },
            { from: "length", to: "width", label: "multiplied by" },
          ],
        },
        source
      )
    ).toBe(true);
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "width", label: "Width of the rectangle" },
            { id: "length", label: "Length of the rectangle" },
          ],
          edges: [{ from: "width", to: "length", label: "times" }],
        },
        source
      )
    ).toBe(false);
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "area", label: "Area of a rectangle" },
            { id: "width", label: "Width of the rectangle" },
          ],
          edges: [{ from: "area", to: "width", label: "times" }],
        },
        source
      )
    ).toBe(false);
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "length", label: "the length" },
            { id: "eight", label: "8 cm" },
          ],
          edges: [{ from: "length", to: "eight", label: "equals" }],
        },
        source
      )
    ).toBe(true);
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "length", label: "the length" },
            { id: "five", label: "5 cm" },
          ],
          edges: [{ from: "length", to: "five", label: "equals" }],
        },
        source
      )
    ).toBe(false);
    const kept = retainGroundedDiagrams(
      {
        missingStructure: ["flowchart"],
        illustrative: { conceptDiagram: recordedConcept },
      },
      source
    );
    expect(kept.illustrative?.conceptDiagram?.edges[0]?.label).toBe("equals");
    expect(kept.missingStructure).toContain("flowchart");
    expect(kept.missingStructure).not.toContain("illustrative");
  });

  it("keeps an explicit cause in the stated direction and drops a diagram with no supported arrow", () => {
    const source = "Friction causes the puck to slow down.";
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "friction", label: "Friction on the ice" },
            { id: "puck", label: "the puck slows" },
          ],
          edges: [{ from: "friction", to: "puck", label: "causes" }],
        },
        source
      )
    ).toBe(true);
    expect(
      diagramExplainsSource(
        {
          nodes: [
            { id: "puck", label: "the puck slows" },
            { id: "friction", label: "Friction on the ice" },
          ],
          edges: [{ from: "puck", to: "friction", label: "causes" }],
        },
        source
      )
    ).toBe(false);
    const rejected = retainGroundedDiagrams(
      {
        diagram: undefined,
        missingStructure: [],
        markdown_body: "An object keeps a constant velocity unless a net force acts on it.",
        illustrative: {
          mindMap: {
            nodes: [
              { id: "node1", label: "constant velocity" },
              { id: "node2", label: "net force" },
            ],
            edges: [{ from: "node2", to: "node1", label: "acts on" }],
          },
        },
      },
      "An object keeps a constant velocity unless a net force acts on it."
    );
    expect(rejected.illustrative?.mindMap).toBeUndefined();
    expect(rejected.diagram).toBeUndefined();
    expect(rejected.missingStructure).toContain("flowchart");
    expect(rejected.missingStructure).toContain("illustrative");
  });

  const NEWTON =
    "An object keeps a constant velocity unless a net force acts on it. That is Newton's first law, and it is the reason a free-body diagram starts by asking what is actually pushing or pulling.";
  const RECTANGLE =
    "The area of a rectangle is length times width. If the length is 8 cm and the width is 5 cm, the area is 40 square centimetres.";
  type DiagramSlot = {
    title?: string;
    kind?: "flowchart" | "mind_map" | "concept_diagram";
    nodes: Array<{ id: string; label: string }>;
    edges: Array<{ from: string; to: string; label: string }>;
  };
  type IllustratedPayload = {
    missingStructure?: string[];
    illustrative?: {
      flowchart?: DiagramSlot;
      mindMap?: DiagramSlot;
      conceptDiagram?: DiagramSlot;
    };
  };
  function ground(payload: IllustratedPayload, source: string) {
    return groundIllustrativeDiagrams(payload, source);
  }

  it("fills a missing Newton concept map from the unless sentence and rejects acts on", () => {
    const grounded = ground(
      {
        missingStructure: [],
        illustrative: {
          flowchart: {
            title: "Newton's First Law Mechanics",
            nodes: [
              { id: "node1", label: "constant velocity" },
              { id: "node2", label: "net force" },
            ],
            edges: [{ from: "node1", to: "node2", label: "unless" }],
          },
          mindMap: {
            nodes: [
              { id: "node1", label: "constant velocity" },
              { id: "node2", label: "net force" },
            ],
            edges: [{ from: "node2", to: "node1", label: "acts on" }],
          },
        },
      },
      NEWTON
    );
    expect(grounded.illustrative?.flowchart?.edges).toEqual([
      { from: "node1", to: "node2", label: "unless" },
    ]);
    const mindMap = grounded.illustrative?.mindMap;
    expect(mindMap?.edges).toEqual([{ from: "continues", to: "exception", label: "unless" }]);
    expect(mindMap?.nodes.map((node) => node.label)).toEqual(["constant velocity", "net force"]);
    expect(JSON.stringify(grounded)).not.toMatch(/acts on/);
    expect(JSON.stringify(grounded)).not.toMatch(/length times width|40 square/);
    expect(grounded.missingStructure).not.toContain("flowchart");
    expect(grounded.missingStructure).not.toContain("illustrative");
  });

  it("adds the worked rectangle example when the model returned only the formula", () => {
    const grounded = ground(
      {
        missingStructure: ["flowchart"],
        illustrative: {
          mindMap: {
            title: "Rectangle Concepts",
            kind: "mind_map",
            nodes: [
              { id: "node1", label: "The area" },
              { id: "node2", label: "length times width" },
            ],
            edges: [{ from: "node1", to: "node2", label: "equals" }],
          },
        },
      },
      RECTANGLE
    );
    const flowchart = grounded.illustrative?.flowchart;
    const mindMap = grounded.illustrative?.mindMap;
    const concept = grounded.illustrative?.conceptDiagram;
    expect(flowchart?.edges).toEqual(
      expect.arrayContaining([
        { from: "length", to: "width", label: "times" },
        { from: "area", to: "result", label: "equals" },
        { from: "subject", to: "formula", label: "equals" },
      ])
    );
    expect(flowchart?.nodes.map((node) => node.label)).toEqual([
      "length 8 cm",
      "width 5 cm",
      "the area",
      "40 square centimetres",
      "area of a rectangle",
      "length times width",
    ]);
    expect(mindMap?.edges).toEqual([
      { from: "node1", to: "node2", label: "equals" },
      { from: "node1", to: "worked-result", label: "equals" },
    ]);
    expect(mindMap?.nodes.map((node) => node.label)).toContain("40 square centimetres");
    expect(concept?.nodes.map((node) => node.label)).toEqual([
      "area of a rectangle",
      "length times width",
      "40 square centimetres",
    ]);
    expect(JSON.stringify(grounded)).not.toMatch(/constant velocity|acts on/);
    expect(grounded.missingStructure).not.toContain("flowchart");
  });

  it("does not invent a diagram or a worked example the passage does not state", () => {
    const plain = ground(
      {
        missingStructure: [],
        illustrative: {
          flowchart: {
            nodes: [
              { id: "page", label: "landing page" },
              { id: "proof", label: "customer outcome" },
            ],
            edges: [{ from: "page", to: "proof", label: "causes" }],
          },
        },
      },
      "A landing page should lead with one customer outcome, then show proof."
    );
    expect(plain.illustrative?.flowchart).toBeUndefined();
    expect(plain.illustrative?.mindMap).toBeUndefined();
    expect(plain.illustrative?.conceptDiagram).toBeUndefined();
    expect(plain.missingStructure).toContain("flowchart");
    expect(plain.missingStructure).toContain("illustrative");

    const formulaOnly = ground(
      { missingStructure: ["flowchart"] },
      "The area of a rectangle is length times width."
    );
    expect(JSON.stringify(formulaOnly)).not.toMatch(/40|8 cm|5 cm/);
    expect(formulaOnly.illustrative?.mindMap?.edges[0]?.label).toBe("equals");
    expect(formulaOnly.illustrative?.flowchart?.edges[0]?.label).toBe("times");
  });

  it("grounds a leaked diagram to the passage that was actually supplied", () => {
    const leakedOntoRectangle = ground(
      {
        illustrative: {
          flowchart: {
            nodes: [
              { id: "node1", label: "constant velocity" },
              { id: "node2", label: "net force" },
            ],
            edges: [{ from: "node1", to: "node2", label: "unless" }],
          },
        },
      },
      RECTANGLE
    );
    expect(JSON.stringify(leakedOntoRectangle)).not.toMatch(/constant velocity|net force/);
    expect(JSON.stringify(leakedOntoRectangle.illustrative?.flowchart)).toMatch(/8 cm/);
    expect(JSON.stringify(leakedOntoRectangle.illustrative?.mindMap)).toMatch(/40 square centimetres/);

    const leakedOntoNewton = ground(
      {
        illustrative: {
          mindMap: {
            nodes: [
              { id: "node1", label: "The area" },
              { id: "node2", label: "length times width" },
            ],
            edges: [{ from: "node1", to: "node2", label: "equals" }],
          },
        },
      },
      NEWTON
    );
    expect(JSON.stringify(leakedOntoNewton)).not.toMatch(/length times width|40 square|8 cm/);
    expect(leakedOntoNewton.illustrative?.flowchart?.edges[0]?.label).toBe("unless");
    expect(leakedOntoNewton.illustrative?.mindMap?.edges[0]?.label).toBe("unless");
  });
});
