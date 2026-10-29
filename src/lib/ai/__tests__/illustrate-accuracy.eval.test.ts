import { describe, expect, it } from "vitest";
import {
  dedupeStudyDiagram,
  diagramExplainsSource,
  edgeRelationIsSupported,
  evaluateIllustrativeAccuracy,
  groundIllustrativeDiagrams,
  statedSourceQuantities,
} from "../lens-quality";

const NEWTON =
  "Newton's first law of motion states that an object moves at constant velocity unless a net force acts.";

const RECTANGLE =
  "The area of a rectangle is length times width. If the length is 8 cm and the width is 5 cm, the area is 40 square centimetres.";

const CIRCUIT =
  "An electric circuit needs a closed path so charge can move. Current is the flow of electrons through that path. A current of 2 amperes means two coulombs of charge pass a point each second. Keep the unit: 2 A is a current, not a voltage.";

const BIOLOGY =
  "Bright sunlight causes glucose to form in the leaf. The leaf uses carbon dioxide and water for that change.";

const CHEMISTRY =
  "An acid causes blue litmus paper to turn red. A base causes red litmus paper to turn blue.";

const FRACTIONS = "One half equals 50 percent. One quarter equals 25 percent.";

const HISTORY =
  "In 1857 soldiers began the rebellion then the company lost control then the crown took direct rule in 1858.";

const WATER =
  "Ocean water then evaporates into vapour then the vapour condenses into clouds then rain falls back down.";

const BALANCE =
  "Three small cubes of aluminium weigh the same as a larger iron cube on the balance. The pans stay level only when the larger cube weighs the same as the three small cubes together.";

type ModelPayload = Parameters<typeof groundIllustrativeDiagrams>[0];

function ground(payload: ModelPayload, source: string) {
  return groundIllustrativeDiagrams(payload, source);
}

describe("Illustrate educational accuracy evaluation set", () => {
  it("rejects invented Newton relations that looked diagram-like in live failures", () => {
    expect(
      edgeRelationIsSupported("net force", "free-body diagram", "becomes", NEWTON)
    ).toBe(false);
    expect(edgeRelationIsSupported("net force", "velocity", "acts on", NEWTON)).toBe(false);
    expect(
      edgeRelationIsSupported("Newton's first law of motion", "net force", "equals", NEWTON)
    ).toBe(false);
    expect(
      edgeRelationIsSupported("Newton's first law of motion", "net force", "causes", NEWTON)
    ).toBe(false);

    const invented: ModelPayload = {
      illustrative: {
        flowchart: {
          nodes: [
            { id: "a", label: "net force" },
            { id: "b", label: "free-body diagram" },
          ],
          edges: [{ from: "a", to: "b", label: "becomes" }],
        },
        mindMap: {
          title: "Law map",
          kind: "mind_map",
          nodes: [
            { id: "l", label: "Newton's first law of motion" },
            { id: "f", label: "net force" },
          ],
          edges: [{ from: "l", to: "f", label: "equals" }],
        },
      },
    };

    const report = evaluateIllustrativeAccuracy(invented, NEWTON);
    expect(report.verdict).toBe("complete");
    expect(JSON.stringify(report)).not.toMatch(/becomes|acts on/);
    const grounded = ground(invented, NEWTON);
    expect(grounded.illustrative?.flowchart?.edges.map((edge) => edge.label)).toEqual(["unless"]);
    expect(grounded.illustrative?.flowchart?.nodes.map((node) => node.label)).toEqual([
      "constant velocity",
      "net force",
    ]);
  });

  it("treats formula-only rectangle diagrams as incomplete until worked quantities appear", () => {
    const formulaOnly: ModelPayload = {
      missingStructure: ["flowchart"],
      illustrative: {
        conceptDiagram: {
          title: "Area",
          kind: "concept_diagram",
          nodes: [
            { id: "a", label: "area of a rectangle" },
            { id: "b", label: "length times width" },
          ],
          edges: [{ from: "a", to: "b", label: "equals" }],
        },
      },
    };

    expect(statedSourceQuantities(RECTANGLE).sort()).toEqual(["40", "5", "8"]);
    // Before grounding the concept is supported but educationally incomplete.
    expect(
      diagramExplainsSource(formulaOnly.illustrative!.conceptDiagram!, RECTANGLE)
    ).toBe(true);
    expect(
      formulaOnly.illustrative!.conceptDiagram!.nodes.some((node) => /\d/.test(node.label))
    ).toBe(false);

    const report = evaluateIllustrativeAccuracy(formulaOnly, RECTANGLE);
    expect(report.verdict).toBe("complete");
    expect(report.missingQuantities).toEqual([]);
    const grounded = ground(formulaOnly, RECTANGLE);
    const blob = JSON.stringify(grounded);
    expect(blob).toMatch(/8 cm/);
    expect(blob).toMatch(/5 cm/);
    expect(blob).toMatch(/40 square centimetres/);
  });

  it("repairs crowded formula diagrams that previously skipped the worked area", () => {
    const crowded: ModelPayload = {
      illustrative: {
        flowchart: {
          title: "Area parts",
          kind: "flowchart",
          nodes: [
            { id: "n1", label: "area of a rectangle" },
            { id: "n2", label: "length times width" },
            { id: "n3", label: "rectangle shape" },
            { id: "n4", label: "measured sides" },
            { id: "n5", label: "product rule" },
            { id: "n6", label: "square units" },
          ],
          edges: [{ from: "n1", to: "n2", label: "equals" }],
        },
      },
    };

    // Keep only supported edges; crowded filler without quantities must not win.
    const report = evaluateIllustrativeAccuracy(crowded, RECTANGLE);
    expect(report.verdict).toBe("complete");
    expect(report.missingQuantities).toEqual([]);
    expect(JSON.stringify(ground(crowded, RECTANGLE))).toMatch(/40 square centimetres/);
  });

  it("keeps circuit current units and rejects unit drift", () => {
    const drifted: ModelPayload = {
      illustrative: {
        conceptDiagram: {
          nodes: [
            { id: "a", label: "2 amperes" },
            { id: "b", label: "voltage" },
          ],
          edges: [{ from: "a", to: "b", label: "equals" }],
        },
      },
    };
    expect(diagramExplainsSource(drifted.illustrative!.conceptDiagram!, CIRCUIT)).toBe(false);

    const report = evaluateIllustrativeAccuracy({}, CIRCUIT);
    expect(report.verdict).toBe("complete");
    expect(JSON.stringify(ground({}, CIRCUIT))).toMatch(/2 amperes|2 A/);
    expect(report.missingQuantities).toEqual([]);
  });

  it("rejects biology diagrams that drop glucose while keeping a leaf node", () => {
    const incomplete = {
      nodes: [
        { id: "a", label: "Bright sunlight" },
        { id: "b", label: "the leaf" },
      ],
      edges: [{ from: "a", to: "b", label: "causes" }],
    };
    expect(diagramExplainsSource(incomplete, BIOLOGY)).toBe(false);

    const report = evaluateIllustrativeAccuracy(
      { illustrative: { flowchart: incomplete } },
      BIOLOGY
    );
    expect(report.verdict).toBe("complete");
    const grounded = ground({ illustrative: { flowchart: incomplete } }, BIOLOGY);
    expect(grounded.illustrative?.flowchart?.nodes.map((node) => node.label)).toEqual([
      "Bright sunlight",
      "glucose to form in the leaf",
    ]);
    expect(JSON.stringify(grounded)).not.toMatch(/chlorophyll|oxygen|Newton/);
  });

  it("preserves both litmus colour changes for chemistry", () => {
    const oneSided: ModelPayload = {
      illustrative: {
        flowchart: {
          nodes: [
            { id: "a", label: "An acid" },
            { id: "b", label: "blue litmus paper turns red" },
          ],
          edges: [{ from: "a", to: "b", label: "causes" }],
        },
      },
    };
    const report = evaluateIllustrativeAccuracy(oneSided, CHEMISTRY);
    expect(report.verdict).toBe("complete");
    const grounded = ground(oneSided, CHEMISTRY);
    expect(JSON.stringify(grounded)).toMatch(/blue litmus paper to turn red/);
    expect(JSON.stringify(grounded)).toMatch(/red litmus paper to turn blue/);
  });

  it("keeps percent quantities for fraction identities", () => {
    const report = evaluateIllustrativeAccuracy({}, FRACTIONS);
    expect(report.verdict).toBe("complete");
    expect(report.missingQuantities).toEqual([]);
    const grounded = ground({}, FRACTIONS);
    expect(JSON.stringify(grounded)).toMatch(/50 percent/);
    expect(JSON.stringify(grounded)).toMatch(/25 percent/);
  });

  it("requires the middle history event and drops duplicate middle nodes", () => {
    const skippedMiddle = {
      nodes: [
        { id: "a", label: "soldiers began the rebellion" },
        { id: "c", label: "the crown took direct rule in 1858" },
      ],
      edges: [{ from: "a", to: "c", label: "then" }],
    };
    expect(diagramExplainsSource(skippedMiddle, HISTORY)).toBe(false);

    const duplicated: ModelPayload = {
      illustrative: {
        flowchart: {
          nodes: [
            { id: "a", label: "soldiers began the rebellion" },
            { id: "b", label: "the company lost control" },
            { id: "b2", label: "the company lost control" },
            { id: "c", label: "the crown took direct rule in 1858" },
          ],
          edges: [
            { from: "a", to: "b", label: "then" },
            { from: "b", to: "b2", label: "then" },
            { from: "b2", to: "c", label: "then" },
          ],
        },
      },
    };

    const deduped = dedupeStudyDiagram(duplicated.illustrative!.flowchart!);
    expect(deduped.nodes.map((node) => node.label)).toEqual([
      "soldiers began the rebellion",
      "the company lost control",
      "the crown took direct rule in 1858",
    ]);

    const report = evaluateIllustrativeAccuracy(duplicated, HISTORY);
    expect(report.verdict).toBe("complete");
    expect(report.duplicateNodes).toBe(0);
    const grounded = ground({ illustrative: { flowchart: skippedMiddle } }, HISTORY);
    expect(JSON.stringify(grounded)).toMatch(/company lost control/);
  });

  it("keeps the full water-cycle sequence without inventing extra stages", () => {
    const report = evaluateIllustrativeAccuracy({}, WATER);
    expect(report.verdict).toBe("complete");
    const grounded = ground({}, WATER);
    expect(grounded.illustrative?.flowchart?.edges.every((edge) => edge.label === "then")).toBe(
      true
    );
    expect(JSON.stringify(grounded)).toMatch(/evaporates|vapour/);
    expect(JSON.stringify(grounded)).toMatch(/condenses|clouds/);
    expect(JSON.stringify(grounded)).not.toMatch(/photosynthesis|Newton|litmus/);
  });

  it("grounds the balance comparison without unsupported claims", () => {
    const report = evaluateIllustrativeAccuracy({}, BALANCE);
    expect(report.verdict).toBe("complete");
    const grounded = ground({}, BALANCE);
    const edge = grounded.illustrative?.flowchart?.edges[0];
    expect(edge?.label).toMatch(/same as|weighs the same as/);
    expect(JSON.stringify(grounded)).toMatch(/three small cubes|aluminium/i);
    expect(JSON.stringify(grounded)).toMatch(/iron cube/i);
  });

  it("marks analogy-only payloads as not educationally complete", () => {
    const report = evaluateIllustrativeAccuracy(
      {
        illustrative: {
          analogy: {
            concept: "force",
            everydayImage: "a shopping trolley",
            mapping: [{ from: "force", to: "a push on the trolley" }],
            limits: ["not every push is a net force"],
          },
        },
      },
      "Force changes the motion of objects."
    );
    expect(report.verdict).toBe("analogy_only");
  });

  it("scores a withheld payload when nothing can be drawn from the lines", () => {
    const report = evaluateIllustrativeAccuracy({}, "Hello there.");
    expect(report.verdict).toBe("withheld");
  });
});
