import { DOSHA_STUDY_PRESETS, type Dosha, type HighlightLensType } from "@/lib/prakriti/config";
import type { BoundingBox, CitationReadyChunk } from "@/lib/reader/extractor";

type ComposeTaskType = HighlightLensType | "deep_integrative_synthesis";

export type StudyDiagramKind = "flowchart" | "mind_map" | "concept_diagram";

export interface StudyDiagramNode {
  id: string;
  label: string;
}

export interface StudyDiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface StudyRectangleGeometry {
  kind: "rectangle";
  length: number;
  width: number;
  area: number;
  lengthLabel: string;
  widthLabel: string;
  areaLabel: string;
  unit: string;
}

export type StudyGeometry = StudyRectangleGeometry;

export interface StudyDiagram {
  title: string;
  kind?: StudyDiagramKind;
  nodes: StudyDiagramNode[];
  edges: StudyDiagramEdge[];
  geometry?: StudyGeometry;
}

export interface ExplainSections {
  simpleExplanation: string;
  standardExplanation: string;
  deeperExplanation: string;
  importantConcepts: string[];
  relevantExample: string;
  keyTakeaway: string;
}

export interface StorySections {
  opening: string;
  turningPoint: string;
  close: string;
}

export interface RevisionTableRow {
  topic: string;
  remember: string;
}

export interface RevisionSections {
  quickSummary: string;
  keyPoints: string[];
  revisionTable: RevisionTableRow[];
  memoryAid: string;
  examPractice: string[];
}

export interface AnalogySections {
  setup: string;
  mapping: string;
  takeaway: string;
}

export interface ShortAnswerItem {
  prompt: string;
  expectedPoints: string[];
  sampleAnswer: string;
}

export interface IllustrativeBundle {
  flowchart: StudyDiagram;
  mindMap: StudyDiagram;
  conceptDiagram: StudyDiagram;
  analogy: AnalogySections;
}

export interface ComposedCitation {
  label: string;
  document_id: string;
  page_number: number;
  section_heading: string;
  bounding_box: BoundingBox;
}

export interface ComposedMcqItem {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  citationLabel: string;
  concept?: string;
}

export interface QuizMiss {
  questionIndex: number;
  concept: string;
  question: string;
  explanation: string;
}

export const TEST_ME_QUESTION_COUNT = 10;

export interface ComposedLensPayload {
  lens_type: ComposeTaskType;
  prakriti_dosha: Dosha;
  title: string;
  markdown_body: string;
  key_points: string[];
  mcqs?: ComposedMcqItem[];
  short_answers?: ShortAnswerItem[];
  citations: ComposedCitation[];
  diagram?: StudyDiagram;
  explain?: ExplainSections;
  revision?: RevisionSections;
  illustrative?: IllustrativeBundle;
  story?: StorySections;
  used_fallback?: boolean;
}

export interface ComposeLensRequest {
  documentId: string;
  pageNumber: number;
  sectionHeading: string;
  selectedText: string;
  selectionBoundingBox?: BoundingBox;
  lensType: ComposeTaskType;
  prakritiDosha?: Dosha;
}

const AYURVEDA_SIGNAL =
  /\b(ayurved(a|ic)|dosha|vata|pitta|kapha|prakriti|tridosha|dhee|dhriti|smriti|dinacharya|srotas|agni|ama)\b/i;

const PHYSICS_SIGNAL =
  /\b(newton|velocity|force|inertia|momentum|acceleration|mass|gravity|energy|watt|joule|ampere|circuit|atom|electron|photon|wave|optics|thermodynamic)\b/i;

const MATH_SIGNAL =
  /\b(area|rectangle|triangle|equation|algebra|fraction|multiply|product|sum|cm|square|length|width|radius|perimeter|percent)\b/i;

const MARKETING_SIGNAL =
  /\b(landing page|campaign|customer|call to action|cta|brand|funnel|conversion|marketing|audience|proof|outcome)\b/i;

export function passageDiscussesAyurveda(text: string): boolean {
  return AYURVEDA_SIGNAL.test(text);
}

export function splitPassageSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12);
}

export function excerptForDisplay(text: string, maxChars = 140): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars).replace(/\s+\S*$/, "").trim()}…`;
}

function uniqueKeep<T>(items: T[]): T[] {
  return items.filter((item, index) => items.indexOf(item) === index);
}

export function extractKeyPhrases(text: string, limit = 4): string[] {
  const words = text
    .replace(/[^A-Za-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4);
  const scored = new Map<string, number>();
  for (const word of words) {
    const key = word.toLowerCase();
    if (
      /^(this|that|with|from|they|them|have|been|will|into|about|which|their|there|were|when|what|your|than|then|also|only|such|each|other)$/.test(
        key
      )
    ) {
      continue;
    }
    scored.set(key, (scored.get(key) ?? 0) + word.length);
  }
  const ranked = [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, limit);
  if (ranked.length > 0) return ranked;
  return splitPassageSentences(text)
    .slice(0, limit)
    .map((sentence) => excerptForDisplay(sentence, 32));
}

function presentationStyle(dosha?: Dosha): {
  pace: string;
  firstPass: string;
  hold: string;
  recall: string;
} {
  if (dosha === "Pitta") {
    return {
      pace: `Work in a ${DOSHA_STUDY_PRESETS.Pitta.pomodoro.studySprintMinutes}-minute focused block, then pause.`,
      firstPass: "Map the outline first: claim, mechanism, and what would be tested.",
      hold: "Turn the claim into a comparison table or cause-and-effect line before you memorize wording.",
      recall: "Close the page and reconstruct the table from memory.",
    };
  }
  if (dosha === "Kapha") {
    return {
      pace: `Stay with one idea for about ${DOSHA_STUDY_PRESETS.Kapha.pomodoro.studySprintMinutes} minutes, then stand and reset.`,
      firstPass: "Start from a concrete example in the passage, then name the rule it demonstrates.",
      hold: "Answer one question about the example before you move on.",
      recall: "Teach the example out loud, then check the page.",
    };
  }
  if (dosha === "Vata") {
    return {
      pace: `Use a short ${DOSHA_STUDY_PRESETS.Vata.pomodoro.studySprintMinutes}-minute burst, then a quick recall check.`,
      firstPass: "Read for the single main claim, not every clause.",
      hold: "Turn the claim into a one-sentence story or spoken summary.",
      recall: "Look away and restate the claim in your own words.",
    };
  }
  return {
    pace: "Read in a short focused block, then pause before the next section.",
    firstPass: "Find the main claim, then the support that follows it.",
    hold: "Write one sentence that captures the idea without copying the page.",
    recall: "Cover the passage and say the claim aloud.",
  };
}

function buildCitations(
  request: ComposeLensRequest,
  ragChunks: CitationReadyChunk[]
): ComposedCitation[] {
  const defaultBox: BoundingBox = request.selectionBoundingBox ??
    ragChunks[0]?.bounding_box ?? {
      x: 48,
      y: 660,
      width: 460,
      height: 24,
    };
  const citations: ComposedCitation[] = [
    {
      label: `[Page ${request.pageNumber}]`,
      document_id: request.documentId,
      page_number: request.pageNumber,
      section_heading: request.sectionHeading,
      bounding_box: defaultBox,
    },
  ];
  return citations;
}

function clipClaim(sentence: string): string {
  return sentence.replace(/^["“]+|["”]+$/g, "").replace(/\s+/g, " ").trim();
}

function passageDomain(
  text: string
): "ayurveda" | "physics" | "math" | "marketing" | "general" {
  if (passageDiscussesAyurveda(text)) return "ayurveda";
  if (PHYSICS_SIGNAL.test(text)) return "physics";
  if (MATH_SIGNAL.test(text)) return "math";
  if (MARKETING_SIGNAL.test(text)) return "marketing";
  return "general";
}

export function parseRectangleMeasures(text: string): {
  length: number;
  width: number;
  area: number;
  unit: string;
} | null {
  const compact = text.replace(/\s+/g, " ");
  const lengthMatch = compact.match(/length(?:\s+is)?\s+(\d+(?:\.\d+)?)\s*(cm|mm|m)?/i);
  const widthMatch = compact.match(/width(?:\s+is)?\s+(\d+(?:\.\d+)?)\s*(cm|mm|m)?/i);
  const pairMatch = compact.match(
    /(\d+(?:\.\d+)?)\s*(cm|mm|m)?\s*(?:[×x]|by)\s*(\d+(?:\.\d+)?)\s*(cm|mm|m)?/i
  );
  const areaMatch = compact.match(/area(?:\s+is)?\s+(\d+(?:\.\d+)?)/i);
  const length = lengthMatch
    ? Number(lengthMatch[1])
    : pairMatch
      ? Number(pairMatch[1])
      : Number.NaN;
  const width = widthMatch
    ? Number(widthMatch[1])
    : pairMatch
      ? Number(pairMatch[3])
      : Number.NaN;
  const unit = lengthMatch?.[2] || widthMatch?.[2] || pairMatch?.[2] || pairMatch?.[4] || "cm";
  if (!Number.isFinite(length) || !Number.isFinite(width) || length <= 0 || width <= 0) {
    return null;
  }
  const parsedArea = areaMatch ? Number(areaMatch[1]) : Number.NaN;
  const area = Number.isFinite(parsedArea)
    ? parsedArea
    : Number((length * width).toFixed(2));
  return { length, width, area, unit };
}

export function rectangleGeometryFromText(text: string): StudyRectangleGeometry | undefined {
  const measures = parseRectangleMeasures(text);
  if (!measures) return undefined;
  return {
    kind: "rectangle",
    length: measures.length,
    width: measures.width,
    area: measures.area,
    lengthLabel: `L = ${measures.length} ${measures.unit}`,
    widthLabel: `W = ${measures.width} ${measures.unit}`,
    areaLabel: `Area = ${measures.area} ${measures.unit}²`,
    unit: measures.unit,
  };
}

export function explanationTokenOverlap(a: string, b: string): number {
  const tokenize = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 4)
    );
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size === 0 || right.size === 0) return 0;
  let inter = 0;
  for (const word of left) {
    if (right.has(word)) inter += 1;
  }
  return inter / new Set([...left, ...right]).size;
}

export function explanationsAreDistinct(sections: ExplainSections): boolean {
  const { simpleExplanation, standardExplanation, deeperExplanation } = sections;
  if (
    simpleExplanation === standardExplanation ||
    simpleExplanation === deeperExplanation ||
    standardExplanation === deeperExplanation
  ) {
    return false;
  }
  if (
    standardExplanation.includes(simpleExplanation) ||
    deeperExplanation.includes(standardExplanation)
  ) {
    return false;
  }
  if (explanationTokenOverlap(simpleExplanation, standardExplanation) > 0.58) return false;
  if (explanationTokenOverlap(simpleExplanation, deeperExplanation) > 0.5) return false;
  if (explanationTokenOverlap(standardExplanation, deeperExplanation) > 0.62) return false;
  if (simpleExplanation.length + 36 >= standardExplanation.length) return false;
  if (standardExplanation.length + 36 >= deeperExplanation.length) return false;
  return true;
}

export function longestSharedWordRun(source: string, story: string): number {
  const src = source
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const dst = story
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let best = 0;
  for (let i = 0; i < src.length; i += 1) {
    for (let j = 0; j < dst.length; j += 1) {
      let n = 0;
      while (i + n < src.length && j + n < dst.length && src[i + n] === dst[j + n]) {
        n += 1;
      }
      if (n > best) best = n;
    }
  }
  return best;
}

function buildFlowchart(params: {
  text: string;
  sentences: string[];
  phrases: string[];
}): StudyDiagram {
  const geometry = rectangleGeometryFromText(params.text);
  if (geometry) {
    return {
      title: "Steps to find the area",
      kind: "flowchart",
      geometry,
      nodes: [
        { id: "length", label: `Measure length ${geometry.lengthLabel}` },
        { id: "width", label: `Measure width ${geometry.widthLabel}` },
        { id: "multiply", label: "Multiply L × W" },
        { id: "area", label: geometry.areaLabel },
      ],
      edges: [
        { from: "length", to: "width", label: "and" },
        { from: "width", to: "multiply", label: "then" },
        { from: "multiply", to: "area", label: "gives" },
      ],
    };
  }
  if (/\bcircuit|current|ampere|coulomb\b/i.test(params.text)) {
    const amp = params.text.match(/(\d+(?:\.\d+)?)\s*ampere/i);
    return {
      title: "How current appears",
      kind: "flowchart",
      nodes: [
        { id: "path", label: "Close the path" },
        { id: "flow", label: "Electrons can flow" },
        { id: "current", label: "Call that flow current" },
        {
          id: "unit",
          label: amp
            ? `${amp[1]} A means ${amp[1]} C each second`
            : "Measure current in amperes",
        },
      ],
      edges: [
        { from: "path", to: "flow", label: "then" },
        { from: "flow", to: "current", label: "called" },
        { from: "current", to: "unit", label: "unit" },
      ],
    };
  }
  if (passageDomain(params.text) === "physics") {
    return {
      title: "When velocity stays the same",
      kind: "flowchart",
      nodes: [
        { id: "state", label: "Object keeps its velocity" },
        { id: "unless", label: "Unless a net force acts" },
        { id: "change", label: "Then velocity can change" },
        { id: "check", label: "Ask what is pushing or pulling" },
      ],
      edges: [
        { from: "state", to: "unless", label: "condition" },
        { from: "unless", to: "change", label: "so" },
        { from: "change", to: "check", label: "check with" },
      ],
    };
  }
  const claim = clipClaim(params.sentences[0] ?? params.phrases[0] ?? "Main idea");
  const support = clipClaim(
    params.sentences[1] ?? params.phrases[1] ?? "Supporting point from the passage"
  );
  const extra = clipClaim(params.sentences[2] ?? params.phrases[2] ?? "Check the claim");
  return {
    title: "How the passage reasons",
    kind: "flowchart",
    nodes: [
      { id: "start", label: "Read the claim" },
      { id: "claim", label: excerptForDisplay(claim, 42) },
      { id: "support", label: excerptForDisplay(support, 42) },
      { id: "check", label: excerptForDisplay(extra, 36) },
    ],
    edges: [
      { from: "start", to: "claim", label: "states" },
      { from: "claim", to: "support", label: "because" },
      { from: "support", to: "check", label: "then check" },
    ],
  };
}

function buildMindMap(params: {
  text: string;
  sentences: string[];
  phrases: string[];
}): StudyDiagram {
  const geometry = rectangleGeometryFromText(params.text);
  if (geometry) {
    return {
      title: "What belongs with area",
      kind: "mind_map",
      geometry,
      nodes: [
        { id: "hub", label: "Area of a rectangle" },
        { id: "b0", label: geometry.lengthLabel },
        { id: "b1", label: geometry.widthLabel },
        { id: "b2", label: "Formula L × W" },
        { id: "b3", label: geometry.areaLabel },
      ],
      edges: [
        { from: "hub", to: "b0", label: "length" },
        { from: "hub", to: "b1", label: "width" },
        { from: "hub", to: "b2", label: "rule" },
        { from: "hub", to: "b3", label: "result" },
      ],
    };
  }
  if (/\bcircuit|current|ampere|coulomb\b/i.test(params.text)) {
    return {
      title: "Current in a circuit",
      kind: "mind_map",
      nodes: [
        { id: "hub", label: "Electric current" },
        { id: "b0", label: "Closed path" },
        { id: "b1", label: "Flow of electrons" },
        { id: "b2", label: "Ampere unit" },
        { id: "b3", label: "Charge each second" },
      ],
      edges: [
        { from: "hub", to: "b0", label: "needs" },
        { from: "hub", to: "b1", label: "is" },
        { from: "hub", to: "b2", label: "measured in" },
        { from: "hub", to: "b3", label: "means" },
      ],
    };
  }
  const hub = excerptForDisplay(params.phrases[0] ?? "Core idea", 26);
  const branches = uniqueKeep([
    excerptForDisplay(params.sentences[0] ?? "Main claim", 32),
    excerptForDisplay(params.sentences[1] ?? params.phrases[1] ?? "Support", 32),
    excerptForDisplay(params.phrases[1] ?? "Key term", 24),
    excerptForDisplay(params.phrases[2] ?? params.sentences[2] ?? "Recall check", 24),
  ]).slice(0, 4);
  const nodes: StudyDiagramNode[] = [
    { id: "hub", label: hub },
    ...branches.map((label, index) => ({ id: `b${index}`, label })),
  ];
  return {
    title: "How the ideas connect",
    kind: "mind_map",
    nodes,
    edges: branches.map((_, index) => ({
      from: "hub",
      to: `b${index}`,
      label: index === 0 ? "claim" : index === 1 ? "support" : "detail",
    })),
  };
}

function buildConceptDiagram(params: {
  text: string;
  sentences: string[];
  phrases: string[];
}): StudyDiagram {
  const geometry = rectangleGeometryFromText(params.text);
  if (geometry) {
    return {
      title: "Labelled rectangle",
      kind: "concept_diagram",
      geometry,
      nodes: [
        { id: "length", label: geometry.lengthLabel },
        { id: "width", label: geometry.widthLabel },
        { id: "formula", label: "Area = L × W" },
        { id: "area", label: geometry.areaLabel },
      ],
      edges: [
        { from: "length", to: "formula", label: "one side" },
        { from: "width", to: "formula", label: "other side" },
        { from: "formula", to: "area", label: "product" },
      ],
    };
  }
  if (/\bcircuit|current|ampere|coulomb\b/i.test(params.text)) {
    return {
      title: "Closed path and current",
      kind: "concept_diagram",
      nodes: [
        { id: "a", label: "Closed loop" },
        { id: "b", label: "Electron flow" },
        { id: "c", label: "Current I" },
        { id: "d", label: "Amperes" },
      ],
      edges: [
        { from: "a", to: "b", label: "allows" },
        { from: "b", to: "c", label: "is" },
        { from: "c", to: "d", label: "measured in" },
      ],
    };
  }
  const a = excerptForDisplay(params.phrases[0] ?? "Concept A", 24);
  const b = excerptForDisplay(params.phrases[1] ?? params.sentences[0] ?? "Concept B", 24);
  const c = excerptForDisplay(params.phrases[2] ?? params.sentences[1] ?? "Concept C", 24);
  const d = excerptForDisplay(params.phrases[3] ?? "Outcome", 20);
  return {
    title: "Concept relations",
    kind: "concept_diagram",
    nodes: [
      { id: "a", label: a },
      { id: "b", label: b },
      { id: "c", label: c },
      { id: "d", label: d },
    ],
    edges: [
      { from: "a", to: "b", label: "relates to" },
      { from: "a", to: "c", label: "shapes" },
      { from: "b", to: "d", label: "leads to" },
      { from: "c", to: "d", label: "checks" },
    ],
  };
}

function buildAnalogy(text: string, sentences: string[], phrases: string[]): AnalogySections {
  const domain = passageDomain(text);
  const geometry = rectangleGeometryFromText(text);
  if (geometry) {
    return {
      setup: `Imagine covering a desk with 1 ${geometry.unit} paper squares.`,
      mapping: `You need ${geometry.length} squares along one edge and ${geometry.width} along the other. The number of squares is ${geometry.length} × ${geometry.width} = ${geometry.area}.`,
      takeaway:
        "Area is the count of unit squares that fill the rectangle, not the walk around the edge.",
    };
  }
  if (/\bcircuit|current|ampere|coulomb\b/i.test(text)) {
    return {
      setup: "Think of a single-file line of people walking through a gate.",
      mapping:
        "The closed path is the corridor they must stay in. Current is how many people pass the gate each second. An ampere is that count for charge.",
      takeaway: "No closed path means the line stops, so the current is zero.",
    };
  }
  if (domain === "physics") {
    return {
      setup: "Think of a hockey puck on smooth ice.",
      mapping:
        "The puck keeps its velocity until a stick or a patch of rough ice adds a net force. The free-body diagram is the list of those real pushes and pulls.",
      takeaway: "Motion continues by itself. A force is needed to change it, not to keep it.",
    };
  }
  if (domain === "math") {
    return {
      setup: "Think of tiling a tabletop with equal squares.",
      mapping: `The passage’s “${excerptForDisplay(phrases[0] ?? "area", 28)}” is how many tiles you need. Length and width are the two sides you count.`,
      takeaway: "Multiply the two sides to count the tiles. Do not add them.",
    };
  }
  if (domain === "marketing") {
    return {
      setup: "Think of a shop window that has one promise, then proof, then a door.",
      mapping: `The selected lines ask you to lead with one ${excerptForDisplay(phrases[0] ?? "outcome", 24)}, then show ${excerptForDisplay(phrases[1] ?? "proof", 24)}, then one clear ask.`,
      takeaway: "One promise, then proof, then one door. Extra offers split attention.",
    };
  }
  if (domain === "ayurveda") {
    return {
      setup: "Think of three instruments in one ensemble: each has a job, and the piece holds when they stay in time.",
      mapping: `The passage’s own terms (${phrases.slice(0, 3).join(", ") || "the named energies"}) are those instruments, not a lecture added on top.`,
      takeaway: excerptForDisplay(sentences[0] ?? text, 180),
    };
  }
  return {
    setup: "Think of a claim, the evidence under it, and a check you can say aloud.",
    mapping: `Here the claim is “${excerptForDisplay(sentences[0] ?? text, 90)}”. The next line supplies the support you should be able to restate.`,
    takeaway: excerptForDisplay(sentences[1] ?? sentences[0] ?? text, 180),
  };
}

const OUTSIDE_DISTRACTORS = [
  "A formula or date that is not mentioned on this page.",
  "An author biography that the passage never gives.",
  "A conclusion the writer explicitly says is out of scope.",
  "The passage says students should skip this idea and move on.",
  "The passage only names a heading and gives no explanation.",
  "The passage states that this point is unsolved and should be ignored.",
  "A later chapter result that these selected lines do not give.",
  "A definition copied from a different subject.",
  "A numerical answer that does not appear in the selection.",
  "A claim the writer marks as optional extra reading.",
] as const;

function clipOption(text: string): string {
  return text.length > 110 ? `${text.slice(0, 107).trim()}…` : text;
}

function groundedOptions(correct: string, salt: number): [string, string, string, string] {
  const first = OUTSIDE_DISTRACTORS[salt % OUTSIDE_DISTRACTORS.length];
  const second = OUTSIDE_DISTRACTORS[(salt + 3) % OUTSIDE_DISTRACTORS.length];
  const third = OUTSIDE_DISTRACTORS[(salt + 7) % OUTSIDE_DISTRACTORS.length];
  return [clipOption(correct), first, second, third];
}

function groundedMcqs(text: string, pageNumber: number): ComposedMcqItem[] {
  const sentences = splitPassageSentences(text);
  const phrases = extractKeyPhrases(text, 8);
  const units = sentences.length > 0 ? sentences.map(clipClaim) : [clipClaim(text.trim())];
  const citationLabel = `[Page ${pageNumber}]`;

  const builders: Array<(unit: string, phrase: string, index: number) => Omit<ComposedMcqItem, "options" | "correctIndex" | "citationLabel">> = [
    (unit, phrase) => ({
      question: `According to the selected passage, which statement is grounded in the text?`,
      explanation: `The passage itself states: “${excerptForDisplay(unit, 180)}”`,
      concept: phrase,
    }),
    (unit, phrase) => ({
      question: `What should you be able to recall about “${phrase}” after reading this passage?`,
      explanation: `Stay inside the selected lines. A faithful recall is: “${excerptForDisplay(unit, 180)}”`,
      concept: phrase,
    }),
    (unit, phrase) => ({
      question: `Which wording about “${phrase}” stays inside the selected lines?`,
      explanation: `Only this wording is on the page: “${excerptForDisplay(unit, 180)}”`,
      concept: phrase,
    }),
    (unit, phrase) => ({
      question: `The passage’s own support for “${phrase}” is closest to which line?`,
      explanation: `The selected text supports this as: “${excerptForDisplay(unit, 180)}”`,
      concept: phrase,
    }),
    (unit, phrase) => ({
      question: `Which self-check for “${phrase}” uses only this passage?`,
      explanation: `A fair check uses the page’s own line: “${excerptForDisplay(unit, 180)}”`,
      concept: phrase,
    }),
    (unit, phrase) => ({
      question: `After this passage, which claim about “${phrase}” is fair?`,
      explanation: `The selected lines allow this claim: “${excerptForDisplay(unit, 180)}”`,
      concept: phrase,
    }),
    (unit, phrase) => ({
      question: `Which example would still be faithful to the selected text on “${phrase}”?`,
      explanation: `A faithful example stays with: “${excerptForDisplay(unit, 180)}”`,
      concept: phrase,
    }),
    (unit, phrase) => ({
      question: `Which of these is from the page, not added from outside, about “${phrase}”?`,
      explanation: `This is on the page: “${excerptForDisplay(unit, 180)}”`,
      concept: phrase,
    }),
    (unit, phrase) => ({
      question: `What follows the opening idea when the passage discusses “${phrase}”?`,
      explanation: `The selected continuation is: “${excerptForDisplay(unit, 180)}”`,
      concept: phrase,
    }),
    (unit, phrase) => ({
      question: `Which recall of “${phrase}” would an exam marker accept from these lines alone?`,
      explanation: `The marker can accept: “${excerptForDisplay(unit, 180)}”`,
      concept: phrase,
    }),
  ];

  return Array.from({ length: TEST_ME_QUESTION_COUNT }, (_, index) => {
    const unit = units[index % units.length] ?? clipClaim(text);
    const phrase =
      phrases[index % Math.max(1, phrases.length)] ??
      extractKeyPhrases(unit, 1)[0] ??
      "this idea";
    const built = builders[index]!(unit, phrase, index);
    return {
      ...built,
      options: groundedOptions(unit, index),
      correctIndex: 0,
      citationLabel,
    };
  });
}

export function identifyIncorrectAnswers(
  mcqs: ComposedMcqItem[],
  answers: Record<number, number>
): QuizMiss[] {
  return mcqs.flatMap((mcq, index) => {
    const picked = answers[index];
    if (picked === undefined || picked === mcq.correctIndex) return [];
    return [
      {
        questionIndex: index,
        concept:
          mcq.concept ||
          extractKeyPhrases(mcq.options[mcq.correctIndex] ?? "", 1)[0] ||
          "this idea",
        question: mcq.question,
        explanation: mcq.explanation,
      },
    ];
  });
}

export function weakConceptsFromMisses(misses: QuizMiss[]): string[] {
  return uniqueKeep(misses.map((miss) => miss.concept)).slice(0, 8);
}

export function composeRevisionFromMisses(params: {
  selectedText: string;
  misses: QuizMiss[];
}): RevisionSections {
  const sentences = splitPassageSentences(params.selectedText);
  const weak = weakConceptsFromMisses(params.misses);
  const phrases = weak.length > 0 ? weak : extractKeyPhrases(params.selectedText);
  const base = buildRevision(
    {
      documentId: "local-quiz",
      pageNumber: 1,
      sectionHeading: "Missed concepts",
      selectedText: params.selectedText,
      lensType: "high_yield_revision",
    },
    sentences,
    phrases
  );
  if (weak.length === 0) {
    return {
      ...base,
      quickSummary: "You answered every question from the passage. Keep the same claims for revision.",
    };
  }
  return {
    ...base,
    quickSummary: `Revise the ideas you missed: ${weak.join(", ")}. Stay inside the selected lines.`,
    keyPoints: weak.map((concept) => {
      const hit =
        sentences.find((sentence) =>
          sentence.toLowerCase().includes(concept.toLowerCase())
        ) ??
        sentences[0] ??
        params.selectedText;
      return `${concept}: ${excerptForDisplay(hit, 140)}`;
    }),
    revisionTable: weak.map((concept) => ({
      topic: concept,
      remember: excerptForDisplay(
        sentences.find((sentence) =>
          sentence.toLowerCase().includes(concept.toLowerCase())
        ) ?? params.selectedText,
        140
      ),
    })),
    examPractice: weak.map(
      (concept) => `Cover the page and say what the passage claims about ${concept}.`
    ),
  };
}

export function preferTenGroundedMcqs(
  modelMcqs: ComposedMcqItem[] | undefined,
  fallbackMcqs: ComposedMcqItem[] | undefined
): ComposedMcqItem[] | undefined {
  if (modelMcqs && modelMcqs.length >= TEST_ME_QUESTION_COUNT) {
    return modelMcqs.slice(0, TEST_ME_QUESTION_COUNT);
  }
  return fallbackMcqs;
}

function learningApproachBody(
  request: ComposeLensRequest,
  sentences: string[],
  phrases: string[]
): { markdown: string; keyPoints: string[] } {
  const style = presentationStyle(request.prakritiDosha);
  const claim = clipClaim(sentences[0] ?? request.selectedText);
  const ayurvedaPassage = passageDiscussesAyurveda(request.selectedText);
  const lines = [
    `### How to study this passage`,
    `- **Main claim to hold:** ${claim}`,
    `- **First pass:** ${style.firstPass}`,
    `- **Keep focus:** ${style.hold}`,
    `- **Recall check:** ${style.recall}`,
    `- **Pace:** ${style.pace}`,
  ];
  if (phrases.length > 0) {
    lines.push(`- **Words worth marking:** ${phrases.slice(0, 4).join(", ")}`);
  }
  if (ayurvedaPassage) {
    lines.push(
      `- **From the passage’s own terms:** keep the writer’s vocabulary; do not add a constitution lecture on top of it.`
    );
  }
  return {
    markdown: lines.join("\n"),
    keyPoints: [
      excerptForDisplay(claim, 90),
      style.firstPass,
      style.recall,
    ],
  };
}

function buildRevision(request: ComposeLensRequest, sentences: string[], phrases: string[]): RevisionSections {
  const claim = clipClaim(sentences[0] ?? request.selectedText);
  const support = clipClaim(sentences[1] ?? "Restate the claim in one line.");
  const detail = clipClaim(sentences[2] ?? phrases[1] ?? "Name one supporting word from the page.");
  const domain = passageDomain(request.selectedText);
  const initials = uniqueKeep(
    phrases.map((phrase) => phrase.charAt(0).toUpperCase()).filter(Boolean)
  ).slice(0, 4);
  const memoryAid =
    domain === "marketing"
      ? `Remember the page’s own sequence: ${excerptForDisplay(claim, 100)} Then keep ${excerptForDisplay(support, 80)}.`
      : domain === "physics"
        ? `Hold this as a cause-and-effect line: ${excerptForDisplay(claim, 120)}`
        : initials.length >= 2
          ? `${initials.join("-")} stands for ${phrases.slice(0, initials.length).join(", ")}.`
          : `Say this without looking: ${excerptForDisplay(claim, 140)}`;
  return {
    quickSummary: excerptForDisplay(claim, 220),
    keyPoints: [claim, support, detail].map((item) => excerptForDisplay(item, 140)),
    revisionTable: [
      { topic: "Main claim", remember: excerptForDisplay(claim, 140) },
      { topic: "Support", remember: excerptForDisplay(support, 140) },
      { topic: "Extra detail", remember: excerptForDisplay(detail, 140) },
      { topic: "Self-check", remember: "Cover the page and say the claim, then the support." },
    ],
    memoryAid,
    examPractice: [
      `In one sentence, what does the passage claim about ${phrases[0] ?? "this idea"}?`,
      `What would count as a faithful example of that claim, using only these lines?`,
    ],
  };
}

function buildExplain(request: ComposeLensRequest, sentences: string[], phrases: string[]): ExplainSections {
  const text = request.selectedText;
  const geometry = rectangleGeometryFromText(text);
  const domain = passageDomain(text);
  const claim = clipClaim(sentences[0] ?? text);
  const support = sentences[1] ? clipClaim(sentences[1]) : null;
  const extra = sentences[2] ? clipClaim(sentences[2]) : null;

  if (geometry) {
    return {
      simpleExplanation: `A rectangle is a four-sided box. Area is the space inside it. Example: an ${geometry.length} ${geometry.unit} by ${geometry.width} ${geometry.unit} card has ${geometry.area} ${geometry.unit}² of space inside.`,
      standardExplanation: `Area is defined as length times width. Length and width are the two sides that meet at a right angle. Their product counts the unit squares that fill the shape. Worked example: ${geometry.length} ${geometry.unit} × ${geometry.width} ${geometry.unit} = ${geometry.area} ${geometry.unit}².`,
      deeperExplanation: `Why multiply? Picture a grid of 1 ${geometry.unit} squares. ${geometry.length} squares fit along the length and ${geometry.width} along the width, so you have ${geometry.length} groups of ${geometry.width}, which is ${geometry.area}. You use this whenever you cover a floor, cut paper, or size a field. A common misconception is to add ${geometry.length} + ${geometry.width}; that walk around two sides is not the space inside. Self-check: if the width became ${geometry.width + 1} ${geometry.unit}, what would the area be? Self-check: why must the unit be ${geometry.unit}², not ${geometry.unit}?`,
      importantConcepts: [
        "Area = length × width",
        geometry.lengthLabel,
        geometry.widthLabel,
        geometry.areaLabel,
      ],
      relevantExample: `Worked numbers from the page: ${geometry.length} × ${geometry.width} = ${geometry.area} ${geometry.unit}².`,
      keyTakeaway: `Multiply the two sides. For ${geometry.length} by ${geometry.width}, the inside space is ${geometry.area} ${geometry.unit}².`,
    };
  }

  if (/\bcircuit|current|ampere|coulomb\b/i.test(text)) {
    const amp = text.match(/(\d+(?:\.\d+)?)\s*ampere/i)?.[1] ?? "2";
    return {
      simpleExplanation: `A circuit is a loop electricity can travel around. Current is how much charge moves past a point. Example: ${amp} amperes means ${amp} coulombs slip past each second.`,
      standardExplanation: `Current is defined as charge passing a point each second. It needs a closed path; an open switch breaks the loop, so the flow stops. The ampere is that rate. Worked example: a ${amp} A current means ${amp} C of charge pass the meter every second.`,
      deeperExplanation: `The reasoning is conservation of charge in a single loop: what enters a point must leave it, so the current is the same all the way around. You use this when you wire a torch, a doorbell, or a simple series lab circuit. A common misconception is that current is used up by a bulb. The bulb transfers energy; the charge keeps moving. Self-check: if the path is opened, what happens to the ammeter reading? Self-check: why is the unit C/s the same as an ampere?`,
      importantConcepts: ["Closed path", "Current as charge per second", "Ampere"],
      relevantExample: `If ${amp} coulombs pass a point each second, the current is ${amp} A.`,
      keyTakeaway: "No closed path, no current. The ampere counts charge each second.",
    };
  }

  if (domain === "physics") {
    return {
      simpleExplanation:
        "An object keeps going the same way if nothing pushes it. A force can change that. Example: a puck on smooth ice keeps sliding until a stick hits it.",
      standardExplanation:
        "Newton's first law says velocity stays constant unless a net force acts. Velocity is speed with a direction. Net force is the leftover push after all pushes and pulls are combined. Worked example: if the pushes cancel, the free-body diagram shows no leftover force, so velocity does not change.",
      deeperExplanation:
        "The reasoning is inertia: motion does not need a force to continue, only to change. You use this when you design brakes, seatbelts, or a spacecraft coasting between burns. A common misconception is that a moving object must have a force on it or it would stop. Self-check: if the ice is smoother, does the puck need a bigger force just to keep moving? Self-check: what should the free-body diagram ask first?",
      importantConcepts: ["Constant velocity", "Net force", "Free-body diagram"],
      relevantExample:
        "A free-body sketch starts by asking what is actually pushing or pulling.",
      keyTakeaway: "Velocity stays the same until a leftover force changes it.",
    };
  }

  if (domain === "marketing") {
    return {
      simpleExplanation:
        "Open with one result the customer wants. Then show proof. Example: one metric, then one button.",
      standardExplanation:
        "A landing page is defined by a single promise, then evidence, then one ask. The relationship is order: proof sits between the outcome and the button so the ask feels earned. Worked example: “Cut study time by 20%”, then a short testimonial, then one trial button.",
      deeperExplanation:
        "The reasoning is limited attention: extra offers compete with the first promise. You use this whenever a page must convert a cold visitor. A common misconception is that more buttons raise conversions. Self-check: if you added a second offer, what would a first-time visitor do? Self-check: can you name the one outcome, the proof, and the one ask from these lines?",
      importantConcepts: ["One outcome", "Proof", "One ask"],
      relevantExample:
        "A page that opens with one customer result, then proof, then a single ask, is doing what these lines describe.",
      keyTakeaway: "One promise, then proof, then one door.",
    };
  }

  const topic = phrases[0] ?? "this idea";
  return {
    simpleExplanation: `This page is about ${topic}. Hold one clear claim. Example: ${excerptForDisplay(claim, 70)}`,
    standardExplanation: `${topic} is defined by the claim on the page. The next line is the relationship that supports it${support ? `: ${excerptForDisplay(support, 90)}` : ""}. Worked example: restate the claim, then the support, without copying the paragraph.`,
    deeperExplanation: `The reasoning to keep is why the support belongs with the claim, not only that both appear. You use this whenever you have to explain the idea to someone else. A common misconception is to memorize the wording and skip the link between the lines. Self-check: cover the page and say the claim. Self-check: what would count as a fair example that stays inside these lines?`,
    importantConcepts: uniqueKeep([
      excerptForDisplay(phrases[0] ?? "Main claim", 40),
      excerptForDisplay(phrases[1] ?? support ?? "Support", 40),
      excerptForDisplay(phrases[2] ?? extra ?? "Recall check", 40),
    ]).slice(0, 4),
    relevantExample: support
      ? excerptForDisplay(support, 200)
      : `If you can restate “${excerptForDisplay(claim, 80)}” without looking back, you have the example.`,
    keyTakeaway: extra
      ? excerptForDisplay(extra, 180)
      : `If you can restate that claim in one sentence without looking back, you have the passage.`,
  };
}

function buildStory(request: ComposeLensRequest, sentences: string[], phrases: string[]): StorySections {
  const text = request.selectedText;
  const geometry = rectangleGeometryFromText(text);

  if (geometry) {
    return {
      opening: `Mina is covering a classroom notice board with coloured 1 ${geometry.unit} paper squares. The board is a rectangle: ${geometry.length} ${geometry.unit} along the top and ${geometry.width} ${geometry.unit} down the side.`,
      turningPoint: `She first adds ${geometry.length} and ${geometry.width} and writes ${geometry.length + geometry.width}. That number only walks two edges. Her friend starts tiling: ${geometry.length} squares in the first row, then ${geometry.width} rows.`,
      close: `Counting the tiles gives ${geometry.area}. Area is the count of unit squares that fill the board, which is why we multiply length by width.`,
    };
  }

  if (/\bcircuit|current|ampere|coulomb\b/i.test(text)) {
    const amp = text.match(/(\d+(?:\.\d+)?)\s*ampere/i)?.[1] ?? "2";
    return {
      opening:
        "Arun’s torch stays dark even though the battery is new. The spring in the tail cap is bent, so the metal path does not complete a loop.",
      turningPoint:
        "He straightens the spring. The path closes. Charge can now move through the filament, and the lamp lights.",
      close: `A meter in that loop would count charge each second. A reading of ${amp} A means ${amp} coulombs pass the meter every second. Current needs a closed path.`,
    };
  }

  if (passageDomain(text) === "physics") {
    return {
      opening:
        "Leah sets a hockey puck on smooth ice and gives it one tap. It keeps sliding in a straight line even after she stops touching it.",
      turningPoint:
        "A patch of rough ice tugs on the puck. That leftover force is the first thing that changes its velocity. Until then, nothing had to keep pushing.",
      close:
        "That is why a force sketch begins by naming the real pushes and pulls. Motion continues by itself. A leftover force is needed to change it.",
    };
  }

  if (passageDomain(text) === "marketing") {
    return {
      opening:
        "Two classmates build a study-app page. Maya wants three buttons. Dev wants one sentence about a result the visitor already wants.",
      turningPoint:
        "They try Maya’s version first. Visitors stall. They switch: one outcome, a short proof line, then a single trial button.",
      close:
        "The second page is easier to finish. Attention holds when the promise, the proof, and the ask stay in that order.",
    };
  }

  const subject = excerptForDisplay(phrases[0] ?? "this idea", 28);
  return {
    opening: `A student meets “${subject}” as a problem, not as a paragraph to copy. They write one sentence they could teach to a friend.`,
    turningPoint: sentences[1]
      ? `The hard part is connecting the next fact — ${excerptForDisplay(sentences[1], 80)} — to that sentence, instead of stacking quotes.`
      : "The hard part is saying what would have to change for the claim to stop being true.",
    close:
      "If they can retell the scene without looking back, they have the idea. Copying the page is not the same as being able to use it.",
  };
}

function groundedShortAnswers(text: string, phrases: string[]): ShortAnswerItem[] {
  const sentences = splitPassageSentences(text);
  const claim = clipClaim(sentences[0] ?? text.trim());
  return [
    {
      prompt: `In your own words, what should you be able to recall about “${phrases[0] ?? "this idea"}” from the selected lines?`,
      expectedPoints: [claim, phrases[0] ?? "the main claim"].map((item) =>
        excerptForDisplay(item, 80)
      ),
      sampleAnswer: excerptForDisplay(claim, 200),
    },
  ];
}

function saveBody(request: ComposeLensRequest): { markdown: string; keyPoints: string[] } {
  const excerpt = excerptForDisplay(request.selectedText, 180);
  return {
    markdown: [
      `### Saved to My Notebook`,
      `Kept a short pointer to page ${request.pageNumber} so you can return to this idea.`,
      `- **Section:** ${request.sectionHeading}`,
      `- **Excerpt:** ${excerpt}`,
    ].join("\n"),
    keyPoints: [
      `Page ${request.pageNumber}`,
      request.sectionHeading,
      excerpt,
    ],
  };
}

function explainMarkdown(sections: ExplainSections): string {
  return [
    "### Simple explanation",
    sections.simpleExplanation,
    "### Standard explanation",
    sections.standardExplanation,
    "### Deeper explanation",
    sections.deeperExplanation,
    "### Important concepts",
    ...sections.importantConcepts.map((item) => `- ${item}`),
    "### Relevant example",
    sections.relevantExample,
    "### Key takeaway",
    sections.keyTakeaway,
  ].join("\n");
}

function storyMarkdown(sections: StorySections): string {
  return [
    "### Opening",
    sections.opening,
    "### Turning point",
    sections.turningPoint,
    "### Close",
    sections.close,
  ].join("\n");
}

function revisionMarkdown(sections: RevisionSections): string {
  return [
    "### Quick summary",
    sections.quickSummary,
    "### Key points",
    ...sections.keyPoints.map((item) => `- ${item}`),
    "| Topic | What to remember |",
    "| :--- | :--- |",
    ...sections.revisionTable.map((row) => `| ${row.topic} | ${row.remember} |`),
    "### Memory aid",
    sections.memoryAid,
    "### Exam practice",
    ...sections.examPractice.map((item) => `- ${item}`),
  ].join("\n");
}

export function composeDeterministicLensPayload(params: {
  request: ComposeLensRequest;
  ragChunks: CitationReadyChunk[];
}): ComposedLensPayload {
  const { request, ragChunks } = params;
  const dosha: Dosha = request.prakritiDosha ?? "Vata";
  const citations = buildCitations(request, ragChunks);
  const sentences = splitPassageSentences(request.selectedText);
  const phrases = extractKeyPhrases(request.selectedText);
  const lens: HighlightLensType =
    request.lensType === "deep_integrative_synthesis"
      ? "explain"
      : request.lensType;

  const base = {
    prakriti_dosha: dosha,
    citations,
    used_fallback: true as const,
  };

  switch (lens) {
    case "ayurvedic": {
      const body = learningApproachBody(request, sentences, phrases);
      return {
        ...base,
        lens_type: "ayurvedic",
        title: "Explore My Learning Approach",
        markdown_body: body.markdown,
        key_points: body.keyPoints,
      };
    }
    case "illustrative": {
      const flowchart = buildFlowchart({
        text: request.selectedText,
        sentences,
        phrases,
      });
      const mindMap = buildMindMap({
        text: request.selectedText,
        sentences,
        phrases,
      });
      const conceptDiagram = buildConceptDiagram({
        text: request.selectedText,
        sentences,
        phrases,
      });
      const analogy = buildAnalogy(request.selectedText, sentences, phrases);
      return {
        ...base,
        lens_type: "illustrative",
        title: "Illustrative View",
        markdown_body: [
          "### Illustrative view",
          "Use the flowchart, mind map, or concept diagram. The analogy is written and stays inside the selected lines.",
          `Claim to hold: ${excerptForDisplay(sentences[0] ?? request.selectedText, 160)}`,
        ].join("\n"),
        key_points: flowchart.nodes.map((node) => node.label),
        diagram: flowchart,
        illustrative: {
          flowchart,
          mindMap,
          conceptDiagram,
          analogy,
        },
      };
    }
    case "high_yield_revision": {
      const revision = buildRevision(request, sentences, phrases);
      return {
        ...base,
        lens_type: "high_yield_revision",
        title: "Revision View",
        markdown_body: revisionMarkdown(revision),
        key_points: revision.keyPoints,
        revision,
      };
    }
    case "save_passage": {
      const body = saveBody(request);
      return {
        ...base,
        lens_type: "save_passage",
        title: "Saved to My Notebook",
        markdown_body: body.markdown,
        key_points: body.keyPoints,
      };
    }
    case "test_me": {
      const mcqs = groundedMcqs(request.selectedText, request.pageNumber);
      const shortAnswers = groundedShortAnswers(request.selectedText, phrases);
      const revision = buildRevision(request, sentences, phrases);
      return {
        ...base,
        lens_type: "test_me",
        title: "Test Me",
        markdown_body: [
          `### Check yourself`,
          `Answer all ${TEST_ME_QUESTION_COUNT} questions from the selected passage only.`,
        ].join("\n"),
        key_points: mcqs.map((item) => item.question),
        mcqs,
        short_answers: shortAnswers,
        revision,
      };
    }
    case "story": {
      const story = buildStory(request, sentences, phrases);
      return {
        ...base,
        lens_type: "story",
        title: "Story Mode",
        markdown_body: storyMarkdown(story),
        key_points: [story.opening, story.turningPoint, story.close],
        story,
      };
    }
    case "explain":
    default: {
      const explain = buildExplain(request, sentences, phrases);
      return {
        ...base,
        lens_type: lens === "explain" ? "explain" : request.lensType,
        title: "Explain This Passage",
        markdown_body: explainMarkdown(explain),
        key_points: explain.importantConcepts,
        explain,
      };
    }
  }
}

export function isUsableModelText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 80) return false;
  if (/api key|permission denied|quota|safety|blocked/i.test(trimmed)) return false;
  return trimmed.split(/\s+/).length >= 20;
}

export function mergeModelTextIntoPayload<T extends { markdown_body: string; used_fallback?: boolean }>(
  base: T,
  modelText: string
): T {
  return {
    ...base,
    markdown_body: modelText.trim(),
    used_fallback: false,
  };
}
