import { describe, expect, it } from "vitest";
import {
  answerAsTable,
  blankNote,
  cornellCardId,
  cornellCards,
  noteFormatOf,
  noteHasContent,
  noteProblem,
  notePreviewText,
  noteTextForReading,
  parseNote,
  serializeNote,
  type FormattedNote,
} from "../formats";
import { diagramAsBranches, diagramAsSteps, noteOptionsForAnswer } from "../from-answer";
import { noteStylesFor } from "@/lib/study/techniques";
import { toRevisionNotes } from "@/components/revision/MorningRevision";
import type { AiLensResponsePayload } from "@/lib/ai/gateway";

const cornell: FormattedNote = {
  format: "cornell",
  pairs: [
    { q: "Definition?", a: "Anaemia due to too little iron for haemoglobin." },
    { q: "Ferritin?", a: "Usually low." },
    { q: "", a: "" },
  ],
  summary: "Less iron, so microcytic hypochromic anaemia.",
};

describe("note formats", () => {
  it("saves each format as readable text and reads it back", () => {
    const samples: FormattedNote[] = [
      { format: "cornell", pairs: cornell.pairs.slice(0, 2), summary: cornell.summary },
      { format: "outline", items: [{ level: 0, text: "Anaemia" }, { level: 1, text: "Classification" }, { level: 2, text: "Microcytic" }] },
      { format: "mindmap", items: [{ level: 0, text: "Nidana" }, { level: 1, text: "Ahara" }] },
      { format: "table", rows: [["Property", "Vata", "Pitta"], ["Guna", "Ruksha", "Ushna"]] },
      { format: "flowchart", steps: ["Endothelial dysfunction", "LDL enters intima", "Plaque"] },
    ];
    for (const sample of samples) {
      const text = serializeNote(sample);
      expect(noteFormatOf(text)).toBe(sample.format);
      expect(parseNote(text)).toEqual(sample);
    }
    expect(serializeNote(cornell)).toContain("Format: Cornell\n\nQ: Definition?\nA: Anaemia");
    expect(serializeNote({ format: "flowchart", steps: ["a", "", "b"] })).toBe("Format: Flowchart\n1. a\n2. b");
  });

  it("treats old notes as plain and keeps table cells apart", () => {
    expect(noteFormatOf("Just my note")).toBe("plain");
    expect(parseNote("Just my note")).toEqual({ format: "plain", text: "Just my note" });
    expect(serializeNote({ format: "table", rows: [["A|B", "C"], ["1"]] })).toBe("Format: Table\nA/B | C\n1 | ");
    expect(serializeNote({ format: "table", rows: [["", ""], ["", ""], ["x", "y"]] })).toBe("Format: Table\n | \nx | y");
  });

  it("knows when something has been written", () => {
    expect(noteHasContent(blankNote("cornell"))).toBe(false);
    expect(noteHasContent(blankNote("table"))).toBe(false);
    expect(noteHasContent(cornell)).toBe(true);
    expect(noteProblem({ format: "table", rows: [["", ""], ["Guna", "Ruksha"]] })).toMatch(/top row/);
    expect(noteProblem({ format: "cornell", pairs: [{ q: "Causes?", a: "" }], summary: "" })).toBeNull();
  });

  it("reads notes aloud and previews them without the Format line", () => {
    const text = serializeNote({ format: "flowchart", steps: ["Heat", "Melt"] });
    expect(noteTextForReading("Ice", text)).toBe("Ice. Step 1. Heat. Step 2. Melt");
    expect(notePreviewText(text)).toBe("Heat → Melt");
    expect(notePreviewText(serializeNote(cornell))).not.toContain("Format:");
  });
});

describe("Cornell revision cards", () => {
  it("turns each question with an answer into its own card", () => {
    const body = serializeNote(cornell);
    expect(cornellCards(body)).toHaveLength(2);
    const cards = toRevisionNotes({
      subjects: [{ id: "s1", title: "Pathology" }],
      notes: [
        { id: "n1", subject_id: "s1", title: "Iron deficiency", body, updated_at: "2026-11-11" },
        { id: "n2", subject_id: "s1", title: "Plain", body: "Some text", updated_at: "2026-11-11" },
      ],
    } as never);
    expect(cards.map((card) => [card.id, card.title, card.subject])).toEqual([
      [cornellCardId("n1", 0), "Iron deficiency: Definition?", "Pathology"],
      [cornellCardId("n1", 1), "Iron deficiency: Ferritin?", "Pathology"],
      ["n2", "Plain", "Pathology"],
    ]);
    expect(cards[1].body).toBe("Usually low.");
  });

  it("keeps a Cornell note with no answers yet as one card", () => {
    const body = serializeNote({ format: "cornell", pairs: [{ q: "Causes?", a: "" }], summary: "To finish" });
    const cards = toRevisionNotes({ subjects: [], notes: [{ id: "n3", subject_id: "x", title: "Draft", body, updated_at: "" }] } as never);
    expect(cards.map((card) => card.id)).toEqual(["n3"]);
  });
});

describe("saving an answer already on screen as a note", () => {
  const flow = {
    title: "Atherosclerosis",
    kind: "flowchart" as const,
    nodes: [
      { id: "c", label: "Plaque" },
      { id: "a", label: "Endothelial injury" },
      { id: "b", label: "LDL enters intima" },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ],
  };

  it("follows the arrows for a flowchart and the branches for a mind map", () => {
    expect(diagramAsSteps(flow)).toEqual(["Endothelial injury", "LDL enters intima", "Plaque"]);
    const mind = {
      title: "Prameha",
      kind: "mind_map" as const,
      nodes: [
        { id: "r", label: "Prameha" },
        { id: "n", label: "Nidana" },
        { id: "x", label: "Ahara" },
      ],
      edges: [
        { from: "r", to: "n" },
        { from: "n", to: "x" },
      ],
    };
    expect(diagramAsBranches(mind)).toEqual([
      { level: 0, text: "Nidana" },
      { level: 1, text: "Ahara" },
    ]);
  });

  it("offers only the formats the answer has", () => {
    const payload = {
      title: "Cells",
      key_points: ["Cell theory", "Organelles"],
      illustrative: { flowchart: flow },
      revision: {
        quickSummary: "Cells are the unit of life.",
        keyPoints: [],
        revisionTable: [
          { topic: "Nucleus", remember: "Control centre" },
          { topic: "Mitochondria", remember: "Energy" },
        ],
        memoryAid: "",
        examPractice: [],
      },
    } as unknown as AiLensResponsePayload;
    const options = noteOptionsForAnswer(payload);
    expect(options.map((option) => option.format)).toEqual(["flowchart", "cornell", "table", "outline"]);
    const cornellOption = options.find((option) => option.format === "cornell")!;
    expect(cornellCards(serializeNote(cornellOption.note))).toEqual([
      { q: "Nucleus?", a: "Control centre" },
      { q: "Mitochondria?", a: "Energy" },
    ]);
    expect(noteOptionsForAnswer({ title: "x", key_points: [] } as unknown as AiLensResponsePayload)).toEqual([]);
  });

  it("finds a table written in an answer's text", () => {
    expect(answerAsTable("| A | B |\n|---|---|\n| 1 | 2 |")).toEqual({ format: "table", rows: [["A", "B"], ["1", "2"]] });
    expect(answerAsTable("no table here")).toBeNull();
  });
});

describe("which note style", () => {
  it("puts the styles that suit the student first", () => {
    expect(noteStylesFor("pitta")[0].format).toBe("flowchart");
    expect(noteStylesFor("vata")[0].format).toBe("cornell");
    expect(noteStylesFor(null)).toHaveLength(5);
  });
});
