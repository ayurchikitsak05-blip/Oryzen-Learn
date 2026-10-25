import { DOSHA_STUDY_PRESETS, type Dosha, type HighlightLensType } from "@/lib/prakriti/config";
import type { BoundingBox, CitationReadyChunk } from "@/lib/reader/extractor";
import {
  type AskBookHistoryTurn,
  resolveAskGrounding,
  selectAskSupportingText,
} from "./ask-my-book";
import {
  conciseNodeLabel,
  filterRevisionTable,
  isEducationallyEmptyLabel,
  isMeaningfulRevisionCell,
  placeCorrectOption,
} from "./lens-quality";

type ComposeTaskType = HighlightLensType | "deep_integrative_synthesis" | "ask_my_book";

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
  flowchart?: StudyDiagram;
  mindMap?: StudyDiagram;
  conceptDiagram?: StudyDiagram;
  analogy?: AnalogySections;
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

/** Maximum questions to accept. Do not pad to this count with dummy items. */
export const TEST_ME_QUESTION_COUNT = 8;

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
  askMyBook?: {
    question: string;
    answer: string;
    sufficientSource: boolean;
  };
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
  studentQuestion?: string;
  conversationHistory?: AskBookHistoryTurn[];
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

export type PassageStudyTopic =
  | "rectangle"
  | "circuit"
  | "newton_first"
  | "work_formula"
  | "work_joule"
  | "work_component"
  | "work_energy"
  | "kinetic_energy"
  | "potential_energy"
  | "power"
  | "marketing"
  | "ayurveda"
  | "linear_equation"
  | "math"
  | "physics_other"
  | "general";

const LINEAR_EQUATION_TOPIC =
  /\b(linear equation|one variable|ax\s*\+\s*b\s*=\s*0|x\s*=\s*-?\s*b\s*\/\s*a|y\s*=\s*ax\s*\+\s*b)\b/i;
const CIRCUIT_TOPIC = /\b(circuit|current|ampere|coulomb)\b/i;
const NEWTON_FIRST_TOPIC =
  /\b(newton'?s first law|constant velocity|inertia|free-body(?: diagram)?|free body diagram)\b/i;
const WORK_FORMULA_TOPIC = /\b(?:w\s*=\s*f\s*[x×*]\s*d|work is done only when|the formula is w\s*=)\b/i;
const WORK_COMPONENT_TOPIC =
  /\b(?:part of the force|along the displacement|right angle to the motion|component of (?:the )?force)\b/i;
const WORK_JOULE_TOPIC = /\b(?:si unit of work|\bjoule\b|1 newton acting|1 metre)\b/i;
const KINETIC_TOPIC = /\b(?:kinetic energy|ke\s*=)\b/i;
const POTENTIAL_TOPIC = /\b(?:potential energy|pe\s*=|gravitational potential)\b/i;
const POWER_TOPIC = /\b(?:p\s*=\s*w\s*\/\s*t|how quickly work|si unit is the watt|\bwatt\b)\b/i;
const PUCK_STOCK = /hockey puck|leah sets a hockey|\ba puck on\b/i;
const NOTICE_BOARD_STOCK = /notice board|mina is covering/i;

function isWorkEnergySelection(text: string): boolean {
  return (
    /\bwork\b/i.test(text) &&
    /\b(force|joule|displacement|newton|metre|meter|\bJ\b|\bN\b)\b/i.test(text)
  );
}

export function detectPassageTopic(text: string): PassageStudyTopic {
  if (rectangleGeometryFromText(text)) return "rectangle";
  if (CIRCUIT_TOPIC.test(text)) return "circuit";
  if (passageDiscussesAyurveda(text)) return "ayurveda";
  if (MARKETING_SIGNAL.test(text)) return "marketing";
  if (WORK_COMPONENT_TOPIC.test(text)) return "work_component";
  if (WORK_FORMULA_TOPIC.test(text)) return "work_formula";
  if (KINETIC_TOPIC.test(text)) return "kinetic_energy";
  if (POTENTIAL_TOPIC.test(text)) return "potential_energy";
  if (POWER_TOPIC.test(text)) return "power";
  if (WORK_JOULE_TOPIC.test(text)) return "work_joule";
  if (isWorkEnergySelection(text)) return "work_energy";
  if (NEWTON_FIRST_TOPIC.test(text)) return "newton_first";
  if (LINEAR_EQUATION_TOPIC.test(text)) return "linear_equation";
  if (PHYSICS_SIGNAL.test(text)) return "physics_other";
  if (MATH_SIGNAL.test(text)) return "math";
  return "general";
}

export function leaksForeignStockStory(output: string, selection: string): boolean {
  const puckAllowed = /hockey puck|\bpuck\b/i.test(selection);
  const boardAllowed = /notice board/i.test(selection);
  if (!puckAllowed && PUCK_STOCK.test(output)) return true;
  if (!boardAllowed && NOTICE_BOARD_STOCK.test(output)) return true;
  return false;
}

export function cannotReliablyExplain(text: string): boolean {
  const compact = text.replace(/\s+/g, " ").trim();
  if (passageDiscussesAyurveda(compact)) return false;
  const topic = detectPassageTopic(compact);
  if (
    topic !== "physics_other" &&
    topic !== "general" &&
    topic !== "math"
  ) {
    return false;
  }
  if (/[A-Za-z]{1,4}\s*=/.test(compact)) return false;
  const words = compact.split(/\s+/).filter((word) => word.length > 2);
  const sentences = splitPassageSentences(compact);
  const phrases = extractKeyPhrases(compact);
  if (words.length < 8) return true;
  if (sentences.length === 0 && phrases.length < 2) return true;
  return false;
}

function workExampleFromText(
  text: string
): { force: string; distance: string; work: string } | null {
  const worked = text.match(
    /(\d+(?:\.\d+)?)\s*N\b[\s\S]{0,80}?(\d+(?:\.\d+)?)\s*m\b[\s\S]{0,80}?(\d+(?:\.\d+)?)\s*J\b/i
  );
  if (worked?.[1] && worked[2] && worked[3]) {
    return { force: worked[1], distance: worked[2], work: worked[3] };
  }
  return null;
}

function selectionHas(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
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
  const rectangleContext = /\b(rectangle|area|length|width)\b/i.test(compact);
  const pairMatch = rectangleContext
    ? compact.match(
        /(\d+(?:\.\d+)?)\s*(cm|mm|m)?\s*(?:[×x]|by)\s*(\d+(?:\.\d+)?)\s*(cm|mm|m)?/i
      )
    : null;
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
  if (CIRCUIT_TOPIC.test(params.text)) {
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
  const topic = detectPassageTopic(params.text);
  if (topic === "linear_equation") {
    return {
      title: "Solve a linear equation",
      kind: "flowchart",
      nodes: [
        { id: "form", label: "Start from ax + b = 0" },
        { id: "subtract", label: "Subtract b from both sides" },
        { id: "divide", label: "Divide both sides by a" },
        { id: "check", label: "Solution is x = -b / a" },
      ],
      edges: [
        { from: "form", to: "subtract", label: "undo +b" },
        { from: "subtract", to: "divide", label: "undo ×a" },
        { from: "divide", to: "check", label: "gives" },
      ],
    };
  }
  if (topic === "newton_first") {
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
  if (
    topic === "work_formula" ||
    topic === "work_joule" ||
    topic === "work_component" ||
    topic === "work_energy" ||
    topic === "kinetic_energy" ||
    topic === "potential_energy" ||
    topic === "power"
  ) {
    const hasFormula = selectionHas(params.text, /w\s*=\s*f\s*[x×*]\s*d/i);
    const hasJoule = selectionHas(params.text, /\bjoule\b|\b\d+\s*J\b/i);
    const hasComponent = selectionHas(params.text, WORK_COMPONENT_TOPIC);
    return {
      title: "What the selected lines teach",
      kind: "flowchart",
      nodes: [
        { id: "claim", label: excerptForDisplay(params.sentences[0] ?? params.phrases[0] ?? "Work idea", 42) },
        {
          id: "rule",
          label: hasFormula
            ? "W = F × d"
            : hasComponent
              ? "Only the along-path part counts"
              : hasJoule
                ? "Measure that work in joules"
                : excerptForDisplay(params.phrases[0] ?? "Named rule", 36),
        },
        {
          id: "check",
          label: hasComponent
            ? "A right-angle force does no work"
            : excerptForDisplay(params.sentences[1] ?? params.phrases[1] ?? "Check the claim", 36),
        },
        { id: "hold", label: excerptForDisplay(params.phrases[1] ?? params.sentences[2] ?? "Stay on this page", 32) },
      ],
      edges: [
        { from: "claim", to: "rule", label: "means" },
        { from: "rule", to: "check", label: "so" },
        { from: "check", to: "hold", label: "hold" },
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
      { id: "claim", label: conciseNodeLabel(claim, 42) },
      { id: "support", label: conciseNodeLabel(support, 42) },
      { id: "check", label: conciseNodeLabel(extra, 36) },
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
  if (detectPassageTopic(params.text) === "linear_equation") {
    return {
      title: "Linear equation in one variable",
      kind: "mind_map",
      nodes: [
        { id: "hub", label: "Linear equation" },
        { id: "b0", label: "One variable x" },
        { id: "b1", label: "Coefficient a ≠ 0" },
        { id: "b2", label: "Solution x = -b / a" },
        { id: "b3", label: "Graph y = ax + b" },
      ],
      edges: [
        { from: "hub", to: "b0", label: "unknown" },
        { from: "hub", to: "b1", label: "needs" },
        { from: "hub", to: "b2", label: "solves" },
        { from: "hub", to: "b3", label: "draws" },
      ],
    };
  }
  if (detectPassageTopic(params.text) === "newton_first") {
    return {
      title: "Newton's first law",
      kind: "mind_map",
      nodes: [
        { id: "hub", label: "Newton's first law" },
        { id: "b0", label: "Constant velocity" },
        { id: "b1", label: "Unless a net force" },
        { id: "b2", label: "Free-body diagram" },
        { id: "b3", label: "Name real pushes" },
      ],
      edges: [
        { from: "hub", to: "b0", label: "keeps" },
        { from: "hub", to: "b1", label: "until" },
        { from: "hub", to: "b2", label: "check with" },
        { from: "hub", to: "b3", label: "starts by" },
      ],
    };
  }
  if (CIRCUIT_TOPIC.test(params.text)) {
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
  const hub = conciseNodeLabel(params.phrases[0] ?? "Core idea", 26);
  const branches = uniqueKeep([
    conciseNodeLabel(params.sentences[0] ?? "Main claim", 32),
    conciseNodeLabel(params.sentences[1] ?? params.phrases[1] ?? "Support", 32),
    conciseNodeLabel(params.phrases[1] ?? "Key term", 24),
    conciseNodeLabel(params.phrases[2] ?? params.sentences[2] ?? "Recall check", 24),
  ])
    .filter((label) => !isEducationallyEmptyLabel(label))
    .slice(0, 4);
  if (branches.length < 2) {
    branches.push(
      conciseNodeLabel(params.sentences[0] ?? "Main claim", 32),
      conciseNodeLabel(params.sentences[1] ?? "Supporting point", 32)
    );
  }
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
  if (detectPassageTopic(params.text) === "linear_equation") {
    return {
      title: "From equation to graph",
      kind: "concept_diagram",
      nodes: [
        { id: "a", label: "ax + b = 0" },
        { id: "b", label: "Inverse operations" },
        { id: "c", label: "x = -b / a" },
        { id: "d", label: "Straight line y = ax + b" },
      ],
      edges: [
        { from: "a", to: "b", label: "undo" },
        { from: "b", to: "c", label: "isolate x" },
        { from: "c", to: "d", label: "same a, b" },
      ],
    };
  }
  if (CIRCUIT_TOPIC.test(params.text)) {
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
  if (detectPassageTopic(text) === "linear_equation") {
    return {
      setup: "Think of undoing a packing job: first take off the extra box, then split what is left.",
      mapping:
        "In ax + b = 0, adding b is the extra box and multiplying by a is the packing. Inverse operations take b off, then divide by a, so x = -b / a.",
      takeaway: "Undo addition, then undo multiplication. Do not invent a number the page does not give.",
    };
  }
  if (CIRCUIT_TOPIC.test(text)) {
    return {
      setup: "Think of a single-file line of people walking through a gate.",
      mapping:
        "The closed path is the corridor they must stay in. Current is how many people pass the gate each second. An ampere is that count for charge.",
      takeaway: "No closed path means the line stops, so the current is zero.",
    };
  }
  if (domain === "physics") {
    const topic = detectPassageTopic(text);
    if (topic === "newton_first") {
      return {
        setup: "Think of a hockey puck on smooth ice.",
        mapping:
          "The puck keeps its velocity until a stick or a patch of rough ice adds a net force. The free-body diagram is the list of those real pushes and pulls.",
        takeaway: "Motion continues by itself. A force is needed to change it, not to keep it.",
      };
    }
    if (
      topic === "work_formula" ||
      topic === "work_joule" ||
      topic === "work_component" ||
      topic === "work_energy" ||
      topic === "kinetic_energy" ||
      topic === "potential_energy" ||
      topic === "power"
    ) {
      const example = workExampleFromText(text);
      const hasFormula = selectionHas(text, /w\s*=\s*f\s*[x×*]\s*d/i);
      return {
        setup: selectionHas(text, /\bbag\b/i)
          ? "Think of carrying a bag along a flat corridor."
          : "Think of pushing a crate along a smooth floor.",
        mapping: hasFormula
          ? `Work is the force along the path times the displacement${example ? `, as in ${example.force} N through ${example.distance} m = ${example.work} J` : ""}.`
          : `The selected lines say: “${excerptForDisplay(sentences[0] ?? text, 110)}”`,
        takeaway: excerptForDisplay(sentences[1] ?? sentences[0] ?? phrases[0] ?? text, 160),
      };
    }
    return {
      setup: "Think of a claim, the evidence under it, and a check you can say aloud.",
      mapping: `Here the claim is “${excerptForDisplay(sentences[0] ?? text, 90)}”. The next line supplies the support you should be able to restate.`,
      takeaway: excerptForDisplay(sentences[1] ?? sentences[0] ?? text, 180),
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

function clipOption(text: string): string {
  return text.length > 110 ? `${text.slice(0, 107).trim()}…` : text;
}

function makeMcq(
  question: string,
  correct: string,
  distractors: [string, string, string],
  explanation: string,
  concept: string,
  slot: number,
  citationLabel: string
): ComposedMcqItem {
  const placed = placeCorrectOption(clipOption(correct), distractors.map(clipOption) as [string, string, string], slot);
  return {
    question,
    ...placed,
    explanation,
    concept,
    citationLabel,
  };
}

function qualityMcqs(text: string, pageNumber: number): ComposedMcqItem[] {
  const topic = detectPassageTopic(text);
  const citationLabel = `[Page ${pageNumber}]`;
  const geometry = rectangleGeometryFromText(text);

  if (topic === "linear_equation") {
    return [
      makeMcq(
        "In ax + b = 0, why must a not be zero?",
        "If a is zero, you cannot divide to get the unique solution x = -b / a.",
        [
          "a is only a label and can be anything, including zero.",
          "b has to be zero or the graph is not a line.",
          "x is already known, so a does not matter.",
        ],
        "The passage writes ax + b = 0 with a not zero, then solves x = -b / a. Division by zero is not a solution of that form.",
        "coefficient a",
        0,
        citationLabel
      ),
      makeMcq(
        "Which inverse operations isolate x in ax + b = 0?",
        "Subtract b, then divide by a, giving x = -b / a.",
        [
          "Add a and b, then divide by x.",
          "Multiply by b, then add a.",
          "Swap a and b, then take the square root.",
        ],
        "Solving for x undoes +b and then ×a. The page states the result x = -b / a.",
        "inverse operations",
        1,
        citationLabel
      ),
      makeMcq(
        "What does the passage say about the graph of y = ax + b?",
        "It is a straight line.",
        [
          "It is a circle centred at the origin.",
          "It is a curve that never crosses the x-axis.",
          "It is a single point at x = 0.",
        ],
        "The selected lines say the graph of y = ax + b is a straight line.",
        "straight line graph",
        2,
        citationLabel
      ),
      makeMcq(
        "Which statement matches the form of a linear equation in one variable on this page?",
        "ax + b = 0, with a not zero.",
        [
          "a/x + b = 0, with x not zero.",
          "ax² + b = 0, with a not zero.",
          "x + y + b = 0, with two variables.",
        ],
        "The page gives the one-variable form ax + b = 0, where a is not zero.",
        "standard form",
        3,
        citationLabel
      ),
    ];
  }

  if (topic === "newton_first") {
    const items = [
      makeMcq(
        "What stays the same until a net force acts?",
        "The object’s velocity — its speed and direction.",
        [
          "Only the object’s colour.",
          "The object must come to rest as soon as you stop pushing.",
          "The mass must double.",
        ],
        "Newton's first law says an object keeps a constant velocity unless a net force acts on it.",
        "constant velocity",
        0,
        citationLabel
      ),
      makeMcq(
        "When does the first law say velocity can change?",
        "When a net force acts on the object.",
        [
          "Whenever time passes, even with no force.",
          "Only when the object is at rest.",
          "Only if the mass is zero.",
        ],
        "The selected lines require a net force before velocity changes.",
        "net force",
        1,
        citationLabel
      ),
      makeMcq(
        "What name does the passage give this rule?",
        "Newton's first law",
        [
          "The law of reflection",
          "The area rule for rectangles",
          "A later-chapter energy formula",
        ],
        "The passage names Newton's first law as the rule for constant velocity.",
        "Newton's first law",
        2,
        citationLabel
      ),
    ];
    if (/\bpuck\b/i.test(text)) {
      items.push(
        makeMcq(
          "In the puck example, what can change the velocity?",
          "A stick or friction.",
          [
            "The ice forcing the puck to keep moving by itself.",
            "A formula from a later chapter.",
            "The puck changing colour.",
          ],
          "The passage says a puck on ice keeps sliding until a stick or friction changes that velocity.",
          "changing velocity",
          3,
          citationLabel
        )
      );
    }
    return items;
  }

  if (geometry) {
    return [
      makeMcq(
        "How do you find the area of the rectangle on this page?",
        `Multiply length ${geometry.length} ${geometry.unit} by width ${geometry.width} ${geometry.unit}.`,
        [
          `Add ${geometry.length} and ${geometry.width}.`,
          `Subtract ${geometry.width} from ${geometry.length}.`,
          "Count only the walk around the edge.",
        ],
        `The page’s numbers give ${geometry.length} × ${geometry.width} = ${geometry.area} ${geometry.unit}².`,
        "area formula",
        0,
        citationLabel
      ),
      makeMcq(
        "What does the area number count?",
        `The unit squares that fill the rectangle, ${geometry.area} ${geometry.unit}².`,
        [
          "Only the two sides you walk along.",
          "The perimeter around the shape.",
          "A volume in cubic units.",
        ],
        "Area is the space inside, not the walk around the edge.",
        "area meaning",
        1,
        citationLabel
      ),
    ];
  }

  if (topic === "circuit") {
    return [
      makeMcq(
        "What must be true before current can flow?",
        "The path must be a closed loop.",
        [
          "The path must stay open.",
          "Current is used up at the first bulb.",
          "Charge only moves if the wire is painted.",
        ],
        "A circuit is a closed path. An open path stops the flow.",
        "closed path",
        0,
        citationLabel
      ),
    ];
  }

  const sentences = splitPassageSentences(text);
  const claim = clipClaim(sentences[0] ?? text);
  if (!claim || claim.split(/\s+/).length < 4) return [];
  return [
    makeMcq(
      "Which statement restates the main claim from these lines?",
      claim,
      [
        "A later-chapter formula that these lines do not give.",
        "The idea is optional and can be skipped.",
        "The page gives only a heading and no claim.",
      ],
      `Stay with the selected claim: ${excerptForDisplay(claim, 120)}`,
      "main claim",
      0,
      citationLabel
    ),
  ];
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

export { preferValidatedMcqs } from "./lens-quality";

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
  const topic = detectPassageTopic(request.selectedText);
  if (topic === "newton_first") {
    return {
      quickSummary:
        "Newton's first law: an object keeps a constant velocity unless a net force acts on it.",
      keyPoints: [
        "Velocity is speed with a direction, and it stays the same until a leftover force acts.",
        "A free-body diagram starts by asking what is actually pushing or pulling.",
        "Motion does not need a force to continue; it needs a force to change.",
      ],
      revisionTable: [
        { topic: "First law", remember: "Constant velocity unless a net force acts." },
        { topic: "Net force", remember: "The leftover push after all forces are combined." },
        { topic: "Free-body diagram", remember: "Start by naming the actual pushes and pulls." },
      ],
      memoryAid: "Hold this as a cause-and-effect line: no leftover force, same velocity.",
      examPractice: [
        "What stays the same until a net force acts?",
        "What should a free-body diagram ask first?",
      ],
    };
  }
  if (topic === "linear_equation") {
    return {
      quickSummary: "A linear equation in one variable has the form ax + b = 0, with a not zero. Solve x = -b / a. The graph of y = ax + b is a straight line.",
      keyPoints: [
        "Form: ax + b = 0, where a is the coefficient of x and is not zero.",
        "Inverse operations give the solution x = -b / a.",
        "The related graph y = ax + b is a straight line.",
      ],
      revisionTable: [
        { topic: "Standard form", remember: "ax + b = 0, with a not zero." },
        { topic: "Solve for x", remember: "Undo +b, then undo ×a: x = -b / a." },
        { topic: "Check", remember: "Substitute x back into ax + b and confirm the sum is 0." },
        { topic: "Graph", remember: "y = ax + b is a straight line." },
      ],
      memoryAid: "Undo plus, then undo times: subtract b, divide by a, get x = -b / a.",
      examPractice: [
        "Name a, b, and x in ax + b = 0 without inventing numbers.",
        "How would you check that x = -b / a is the solution?",
      ],
    };
  }

  const claim = clipClaim(sentences[0] ?? request.selectedText);
  const support = clipClaim(sentences[1] ?? "Restate the claim in one line.");
  const detail = clipClaim(sentences[2] ?? "");
  const domain = passageDomain(request.selectedText);
  const memoryAid =
    domain === "marketing"
      ? `Remember the page’s own sequence: ${excerptForDisplay(claim, 100)} Then keep ${excerptForDisplay(support, 80)}.`
      : domain === "physics"
        ? `Hold this as a cause-and-effect line: ${excerptForDisplay(claim, 120)}`
        : `Say this without looking: ${excerptForDisplay(claim, 140)}`;
  const keyPoints = [claim, support, detail]
    .map((item) => excerptForDisplay(item, 140))
    .filter((item) => isMeaningfulRevisionCell(item));
  const revisionTable = filterRevisionTable([
    { topic: "Main claim", remember: excerptForDisplay(claim, 140) },
    { topic: "Support", remember: excerptForDisplay(support, 140) },
    ...(isMeaningfulRevisionCell(detail)
      ? [{ topic: "Extra detail", remember: excerptForDisplay(detail, 140) }]
      : []),
    { topic: "Self-check", remember: "Cover the page and say the claim, then the support." },
  ]);
  return {
    quickSummary: excerptForDisplay(claim, 220),
    keyPoints: keyPoints.length > 0 ? keyPoints : [excerptForDisplay(claim, 140)],
    revisionTable,
    memoryAid,
    examPractice: [
      `In one sentence, what does the passage claim about ${phrases[0] && phrases[0].length > 3 ? phrases[0] : "this idea"}?`,
      `What would count as a faithful example of that claim, using only these lines?`,
    ],
  };
}

function limitationExplain(): ExplainSections {
  return {
    simpleExplanation:
      "These selected lines are too thin to teach here. I will not invent another physics story.",
    standardExplanation:
      "The local fallback only explains the exact selection. This excerpt does not name a complete definition, a formula, or a cause-and-effect claim I can teach without guessing a different chapter.",
      deeperExplanation:
      "Paid AI is off, so I will not swap in a generic motion story or a tiling story from another chapter. Highlight a longer stretch that states the definition or worked example, then try Explain again. Self-check: which sentence on the page is the claim you wanted explained? Self-check: does that sentence name a formula or a unit?",
    importantConcepts: ["Stay inside the selection", "Do not invent another chapter"],
    relevantExample:
      "A usable selection names the idea in full, such as a formula with its unit or a worked number from the same page.",
    keyTakeaway:
      "If the local fallback cannot teach the selected lines without guessing, it says so instead of swapping in a stock story.",
  };
}

function buildWorkEnergyExplain(
  text: string,
  sentences: string[],
  phrases: string[],
  topic: PassageStudyTopic
): ExplainSections {
  const claim = clipClaim(sentences[0] ?? text);
  const support = sentences[1] ? clipClaim(sentences[1]) : null;
  const example = workExampleFromText(text);
  const hasFormula = selectionHas(text, /w\s*=\s*f\s*[x×*]\s*d/i);
  const hasJoule = selectionHas(text, /\bjoule\b|\b1 newton acting\b|\b\d+\s*J\b/i);
  const hasComponent = topic === "work_component" || selectionHas(text, WORK_COMPONENT_TOPIC);
  const hasZeroWork = selectionHas(text, /\b0\s*J\b|does not move|work is zero/i);
  const exampleLine = example
    ? `${example.force} N through ${example.distance} m is ${example.work} J`
    : excerptForDisplay(claim, 70);

  if (hasComponent && !hasFormula) {
    const bagExample = selectionHas(text, /\bbag\b/i)
      ? "carrying a bag across a flat corridor"
      : "a force at a right angle to the path";
    return {
      simpleExplanation: `Only the along-path part of a force counts. Example: ${bagExample} does no work against gravity.`,
      standardExplanation: `Work is defined from the component of force along the displacement. A force at a right angle has a zero component, so the work is zero. Worked example: a vertical weight on a horizontal path adds nothing.`,
      deeperExplanation: `Why only that component? Displacement has a direction. A sideways or vertical push does not move the object along the path you are measuring. A common misconception is that any effort you feel must be work. Self-check: if the force and the path are perpendicular, what is the work? Self-check: which words on this page name the part that counts?`,
      importantConcepts: uniqueKeep([
        "Component along the displacement",
        "Right-angle force does no work",
        excerptForDisplay(phrases[0] ?? "Displacement", 40),
      ]).slice(0, 4),
      relevantExample: excerptForDisplay(support ?? claim, 200),
      keyTakeaway: "Only the along-path part of the force counts as work.",
    };
  }

  if (hasJoule && !hasFormula && topic === "work_joule") {
    return {
      simpleExplanation:
        "A joule counts work, not a push. Example: one newton through one metre makes one joule.",
      standardExplanation:
        "The SI unit of work is defined as the joule (J). It is the work done by a 1 N force acting through 1 m. Worked example: write 30 J for work, never 30 N.",
      deeperExplanation:
        "Why a new unit? Force is a push. Work also needs a distance, so the unit changes. A common misconception is to copy the force unit onto a work answer. Self-check: why is 30 J not the same as 30 N? Self-check: which sentence on this page defines one joule?",
      importantConcepts: ["Joule (J)", "1 N through 1 m", "Keep the unit with the quantity"],
      relevantExample: excerptForDisplay(support ?? claim, 200),
      keyTakeaway: "Work is counted in joules, not in newtons.",
    };
  }

  const formulaLine = hasFormula
    ? "Work is defined as W = F × d. F is the push along the motion. d is the displacement. Their product is the work done."
    : `The selected lines define work as: ${excerptForDisplay(claim, 110)}`;

  return {
    simpleExplanation: `Work means a force actually moves something. Example: ${exampleLine}.`,
    standardExplanation: `${formulaLine} Worked example: ${example ? `${example.force} newtons along ${example.distance} metres equals ${example.work} joules` : exampleLine}.`,
    deeperExplanation: `Why that product? A push that does not move the object transfers no work, even if someone feels tired${hasZeroWork ? "; the page says 0 m of displacement is 0 J" : ""}. A common misconception is that effort alone is work. Self-check: if the object does not move, what is the work? Self-check: which two quantities sit in the selected relation?`,
    importantConcepts: uniqueKeep([
      hasFormula ? "W = F × d" : excerptForDisplay(phrases[0] ?? "Work", 40),
      "Force along the path",
      "Displacement",
      hasJoule ? "Joule (J)" : excerptForDisplay(phrases[1] ?? "Worked example", 40),
    ]).slice(0, 4),
    relevantExample: example
      ? `From the page: ${example.force} N along ${example.distance} m gives ${example.work} J.`
      : excerptForDisplay(support ?? claim, 200),
    keyTakeaway: hasFormula
      ? "Work is force along the path times displacement."
      : excerptForDisplay(claim, 160),
  };
}

function buildTopicPhysicsExplain(
  text: string,
  sentences: string[],
  phrases: string[],
  topic: PassageStudyTopic
): ExplainSections | null {
  const claim = clipClaim(sentences[0] ?? text);
  const support = sentences[1] ? clipClaim(sentences[1]) : null;
  if (topic === "kinetic_energy") {
    const hasFormula = selectionHas(text, /ke\s*=|1\/2|½/i);
    return {
      simpleExplanation: `Kinetic energy is the energy of motion. Example: ${excerptForDisplay(claim, 70)}`,
      standardExplanation: `${hasFormula ? "Kinetic energy is defined as KE = (1/2) m v². Mass is in kilograms and speed is in metres per second." : `The selected lines define kinetic energy as: ${excerptForDisplay(claim, 110)}`} Worked example: ${excerptForDisplay(support ?? claim, 90)}.`,
      deeperExplanation: `Why square the speed? Doubling speed multiplies kinetic energy by four if the page shows that relation. A common misconception is to treat kinetic energy as the same as speed. Self-check: what happens to KE if the speed halves? Self-check: which unit does the page use for this energy?`,
      importantConcepts: uniqueKeep(["Kinetic energy", hasFormula ? "KE = (1/2) m v²" : "Energy of motion", "Joule"]).slice(0, 4),
      relevantExample: excerptForDisplay(support ?? claim, 200),
      keyTakeaway: "Kinetic energy belongs to motion, not to a different chapter.",
    };
  }
  if (topic === "potential_energy") {
    const hasFormula = selectionHas(text, /pe\s*=|m\s*g\s*h/i);
    return {
      simpleExplanation: `Potential energy depends on height. Example: ${excerptForDisplay(claim, 70)}`,
      standardExplanation: `${hasFormula ? "Gravitational potential energy is defined as PE = m g h." : `The selected lines define potential energy as: ${excerptForDisplay(claim, 110)}`} Worked example: ${excerptForDisplay(support ?? claim, 90)}.`,
      deeperExplanation: `Why height, not speed? Height is a position. A common misconception is to treat height as speed. Self-check: if the mass is raised higher, what happens to PE? Self-check: which formula, if any, is actually on this selection?`,
      importantConcepts: uniqueKeep(["Potential energy", hasFormula ? "PE = m g h" : "Height", "Joule"]).slice(0, 4),
      relevantExample: excerptForDisplay(support ?? claim, 200),
      keyTakeaway: "Potential energy tracks height, not a stock motion story.",
    };
  }
  if (topic === "power") {
    const hasFormula = selectionHas(text, /p\s*=\s*w\s*\/\s*t/i);
    return {
      simpleExplanation: `Power is how quickly work is done. Example: ${excerptForDisplay(claim, 70)}`,
      standardExplanation: `${hasFormula ? "Power is defined as P = W / t. The SI unit is the watt: one joule each second." : `The selected lines define power as: ${excerptForDisplay(claim, 110)}`} Worked example: ${excerptForDisplay(support ?? claim, 90)}.`,
      deeperExplanation: `Why divide by time? The same work in less time is more power. A common misconception is that power already tells you the total energy. Self-check: if the time doubles and the work stays the same, what happens to power? Self-check: which unit does the page use?`,
      importantConcepts: uniqueKeep(["Power", hasFormula ? "P = W / t" : "Work and time", "Watt"]).slice(0, 4),
      relevantExample: excerptForDisplay(support ?? claim, 200),
      keyTakeaway: "Power is work divided by time.",
    };
  }
  return null;
}

function buildExplain(request: ComposeLensRequest, sentences: string[], phrases: string[]): ExplainSections {
  const text = request.selectedText;
  const geometry = rectangleGeometryFromText(text);
  const domain = passageDomain(text);
  const topic = detectPassageTopic(text);
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

  if (CIRCUIT_TOPIC.test(text)) {
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

  if (
    topic === "work_formula" ||
    topic === "work_joule" ||
    topic === "work_component" ||
    topic === "work_energy"
  ) {
    return buildWorkEnergyExplain(text, sentences, phrases, topic);
  }

  const otherPhysics = buildTopicPhysicsExplain(text, sentences, phrases, topic);
  if (otherPhysics) return otherPhysics;

  if (topic === "linear_equation") {
    return {
      simpleExplanation:
        "A linear equation has one unknown, x. It looks like ax + b = 0. Example: undo the +b and the ×a to find x = -b / a.",
      standardExplanation:
        "a is the coefficient of x and is not zero. b is the constant term. Inverse operations isolate x: subtract b, then divide by a, so x = -b / a. Check by substituting that x back into ax + b. The related graph y = ax + b is a straight line.",
      deeperExplanation:
        "Why a ≠ 0: if a were zero, you could not divide to get a unique x of the form -b / a. Why inverse operations: subtraction undoes addition, and division undoes multiplication. A common misconception is to write x = b / a or to treat y = ax + b as a different unknown instead of the straight-line graph of the same a and b. Self-check: if you put x = -b / a into ax + b, what must you get? Self-check: which sentence on this page names the graph?",
      importantConcepts: ["ax + b = 0", "Coefficient a ≠ 0", "x = -b / a", "Straight line y = ax + b"],
      relevantExample:
        "From the page only: start with ax + b = 0, subtract b, divide by a, and verify ax + b returns 0. Do not invent a number the selection does not give.",
      keyTakeaway: "Isolate x with inverse operations. The solution is x = -b / a, and y = ax + b is a straight line.",
    };
  }

  if (passageDomain(text) === "ayurveda") {
    return {
      simpleExplanation: `The page names three study energies: Vata, Pitta, and Kapha. Example: ${excerptForDisplay(claim, 70)}`,
      standardExplanation: `These lines treat Vata, Pitta, and Kapha as named energies on the page, not as a lecture added from outside. ${support ? `The next line adds: ${excerptForDisplay(support, 90)}.` : ""} Worked example: name each energy the selection actually writes.`,
      deeperExplanation: `Why stay with those names? The passage itself introduces them. A common misconception is to import a different constitution theory. Self-check: which three names are on this page? Self-check: what do these lines say balance supports?`,
      importantConcepts: uniqueKeep(["Vata", "Pitta", "Kapha", excerptForDisplay(support ?? "Balance", 40)]).slice(0, 4),
      relevantExample: excerptForDisplay(support ?? claim, 200),
      keyTakeaway: excerptForDisplay(claim, 160),
    };
  }

  if (topic === "newton_first") {
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

  if (cannotReliablyExplain(text)) {
    return limitationExplain();
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

  const formula = request.selectedText.match(/[A-Za-z]\s*=\s*[^\n.]{2,48}/)?.[0];
  if (domain === "math" && formula) {
    return {
      simpleExplanation: `The page gives a rule you can write as ${formula.trim()}. Example: name each letter from the selected lines only.`,
      standardExplanation: `The relationship on the page is ${formula.trim()}. ${support ? `The next line adds: ${excerptForDisplay(support, 90)}.` : "Keep every letter as the page defines it."} Worked example: substitute only values that appear in these lines.`,
      deeperExplanation: `Why that rule? Each symbol is defined on this selection; do not import a different chapter. A common misconception is to invent a number the page never gives. Self-check: which letters are named here? Self-check: what would count as a check that stays inside these lines?`,
      importantConcepts: uniqueKeep([
        excerptForDisplay(formula, 40),
        excerptForDisplay(phrases[0] ?? "Named quantity", 40),
        excerptForDisplay(support ?? "Check the substitution", 40),
      ]).slice(0, 4),
      relevantExample: excerptForDisplay(support ?? claim, 200),
      keyTakeaway: excerptForDisplay(formula, 160),
    };
  }

  return {
    simpleExplanation: `${excerptForDisplay(claim, 90)} Example: ${excerptForDisplay(support ?? claim, 70)}`,
    standardExplanation: `The governing idea is ${excerptForDisplay(claim, 110)}${support ? ` The support is ${excerptForDisplay(support, 90)}.` : ""} Worked example: restate that idea, then the support, using only these lines.`,
    deeperExplanation: `Why that link? The support is what makes the claim usable. A common misconception is to memorize wording and drop the reason. Self-check: cover the page and say the claim. Self-check: what would count as a fair example that stays inside these lines?`,
    importantConcepts: uniqueKeep([
      excerptForDisplay(phrases[0] ?? "Main claim", 40),
      excerptForDisplay(phrases[1] ?? support ?? "Support", 40),
      excerptForDisplay(support ?? extra ?? "Recall check", 40),
    ]).slice(0, 4),
    relevantExample: excerptForDisplay(support ?? claim, 200),
    keyTakeaway: excerptForDisplay(extra ?? claim, 180),
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

  if (CIRCUIT_TOPIC.test(text)) {
    const amp = text.match(/(\d+(?:\.\d+)?)\s*ampere/i)?.[1] ?? "2";
    return {
      opening:
        "Arun’s torch stays dark even though the battery is new. The spring in the tail cap is bent, so the metal path does not complete a loop.",
      turningPoint:
        "He straightens the spring. The path closes. Charge can now move through the filament, and the lamp lights.",
      close: `A meter in that loop would count charge each second. A reading of ${amp} A means ${amp} coulombs pass the meter every second. Current needs a closed path.`,
    };
  }

  const topic = detectPassageTopic(text);
  if (topic === "linear_equation") {
    return {
      opening:
        "Rina writes a linear equation in one variable, ax + b = 0, and asks what x is. She will not pick a number the page never gave.",
      turningPoint:
        "Solving for x, she subtracts b from both sides, then divides by a, because a is not zero. That isolates x = -b / a. She substitutes it back and ax + b becomes 0.",
      close:
        "Then she sketches the graph y = ax + b. The same a and b make a straight line, so the solution is where that line meets y = 0.",
    };
  }
  if (topic === "newton_first") {
    return {
      opening:
        "Leah writes Newton's first law, then sets a hockey puck on smooth ice and gives it one tap. The object keeps a constant velocity in a straight line even after she stops touching it.",
      turningPoint:
        "A patch of rough ice tugs on the puck. That leftover net force is the first thing that changes its velocity. Until then, nothing had to keep pushing.",
      close:
        "Unless a net force acts, velocity stays the same. That is why a free-body diagram starts by naming the real pushes and pulls.",
    };
  }
  if (
    topic === "work_formula" ||
    topic === "work_joule" ||
    topic === "work_component" ||
    topic === "work_energy" ||
    topic === "kinetic_energy" ||
    topic === "potential_energy" ||
    topic === "power"
  ) {
    const example = workExampleFromText(text);
    const hasBag = selectionHas(text, /\bbag\b/i);
    return {
      opening: hasBag
        ? "A student carries a bag along a flat corridor and wonders whether that counts as work."
        : "A student pushes a crate along a smooth floor and writes down the force and the distance.",
      turningPoint: example
        ? `The numbers on the page settle it: ${example.force} N through ${example.distance} m is ${example.work} J, but only when the force is along the path.`
        : sentences[1]
          ? excerptForDisplay(sentences[1], 180)
          : "Only the part of the force along the displacement counts. Effort that does not move the object along that path is not work.",
      close: excerptForDisplay(sentences[2] ?? sentences[0] ?? text, 200),
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

  const claim = clipClaim(sentences[0] ?? text);
  return {
    opening: `A student has to use this idea, not copy it: ${excerptForDisplay(claim, 90)}`,
    turningPoint: sentences[1]
      ? `They try a wrong first move, then correct it using ${excerptForDisplay(sentences[1], 90)}`
      : "They try a wrong first move, then correct it using only the selected rule.",
    close: excerptForDisplay(sentences[2] ?? sentences[0] ?? text, 180),
  };
}

function buildAskMyBook(
  request: ComposeLensRequest,
  sentences: string[]
): { question: string; answer: string; sufficientSource: boolean; keyPoints: string[] } {
  const raw = (request.studentQuestion ?? "").trim();
  const question =
    raw.length >= 3
      ? raw
      : "What does the selected passage claim?";
  const history = request.conversationHistory ?? [];
  const grounding = resolveAskGrounding({
    question,
    selectedText: request.selectedText,
    history,
  });
  if (!grounding.sufficient) {
    return {
      question,
      answer: `The selected lines do not give enough evidence to answer that. They discuss: ${excerptForDisplay(request.selectedText, 160)} Highlight a passage that names the idea you asked about.`,
      sufficientSource: false,
      keyPoints: ["Insufficient source evidence", excerptForDisplay(request.selectedText, 80)],
    };
  }
  const followNote =
    grounding.followUp && history[history.length - 1]
      ? ` Following your last question (“${excerptForDisplay(history[history.length - 1].question, 80)}”), stay with the same lines.`
      : "";
  const supporting = selectAskSupportingText(question, request.selectedText);
  return {
    question,
    answer: `${supporting}${followNote}`,
    sufficientSource: true,
    keyPoints: [excerptForDisplay(supporting, 90), `Source: page ${request.pageNumber}`],
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
  const lens: ComposeTaskType =
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
    case "ask_my_book": {
      const asked = buildAskMyBook(request, sentences);
      return {
        ...base,
        lens_type: "ask_my_book",
        title: "Ask My Book",
        markdown_body: [
          `### Question`,
          asked.question,
          asked.sufficientSource ? "### Answer" : "### Insufficient source evidence",
          asked.answer,
        ].join("\n"),
        key_points: asked.keyPoints,
        askMyBook: {
          question: asked.question,
          answer: asked.answer,
          sufficientSource: asked.sufficientSource,
        },
      };
    }
    case "test_me": {
      const mcqs = qualityMcqs(request.selectedText, request.pageNumber);
      const shortAnswers = groundedShortAnswers(request.selectedText, phrases);
      const revision = buildRevision(request, sentences, phrases);
      return {
        ...base,
        lens_type: "test_me",
        title: "Test Me",
        markdown_body: [
          `### Check yourself`,
          `Answer these ${mcqs.length} questions from the selected passage only.`,
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

export function isDisplayableModelText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 40) return false;
  if (/api key|permission denied|quota exceeded|safety|blocked/i.test(trimmed)) return false;
  return true;
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
