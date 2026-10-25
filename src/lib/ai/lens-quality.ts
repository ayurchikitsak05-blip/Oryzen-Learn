import type { ComposedMcqItem, RevisionTableRow } from "./lens-compose";

const GENERIC_EXPLAIN =
  /this page is about|hold one clear claim|restate the claim, then the support|without copying the paragraph/i;

const GENERIC_STORY =
  /paragraph to copy|retell the scene without looking back|copying the page is not the same|meets “[^”]+” as a problem/i;

const DUMMY_DISTRACTOR =
  /not mentioned on this page|author biography|different subject|skip this idea and move on|optional extra reading|later chapter result/i;

const GENERIC_QUIZ_STEM =
  /according to the selected passage, which statement is grounded|which wording about “[^”]+” stays inside the selected lines/i;

export function isGenericExplainTemplate(text: string): boolean {
  return GENERIC_EXPLAIN.test(text);
}

export function explanationsAreDistinct(
  simple: string,
  standard: string,
  deeper: string
): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const parts = [norm(simple), norm(standard), norm(deeper)];
  if (parts.some((part) => part.length < 12)) return false;
  return new Set(parts).size === 3;
}

export function isGenericStudyStory(text: string): boolean {
  return GENERIC_STORY.test(text);
}

export function isMeaningfulRevisionCell(text: string): boolean {
  const compact = text.replace(/\s+/g, " ").trim();
  const words = compact.split(/\s+/).filter(Boolean);
  return words.length >= 2 && compact.length >= 8;
}

export function filterRevisionTable(rows: RevisionTableRow[]): RevisionTableRow[] {
  return rows.filter((row) => row.topic.trim().length > 0 && isMeaningfulRevisionCell(row.remember));
}

export function conciseNodeLabel(text: string, maxChars = 36): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "Idea";
  if (compact.length <= maxChars && !compact.endsWith("…")) return compact;
  return `${compact.slice(0, maxChars).replace(/\s+\S*$/, "").trim()}`;
}

export function isEducationallyEmptyLabel(text: string): boolean {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length < 3) return true;
  const words = compact.split(/\s+/);
  if (words.length === 1 && compact.length < 12) return true;
  if (/^(keeps|where|gives|this|that|idea|claim)$/i.test(compact)) return true;
  return false;
}

const WEAK_EDGE_LABEL = /^(and|or|related|link|edge|to|of|node)$/i;
const SOURCE_STOP_WORDS = new Set([
  "that",
  "this",
  "with",
  "from",
  "into",
  "when",
  "where",
  "which",
  "their",
  "there",
  "about",
  "would",
  "could",
  "should",
  "after",
  "before",
  "than",
  "then",
  "only",
  "also",
  "does",
  "have",
  "been",
  "were",
  "what",
  "your",
  "page",
  "text",
  "says",
  "said",
]);

type DiagramShape = {
  nodes: ReadonlyArray<{ label: string }>;
  edges: ReadonlyArray<{ label?: string }>;
};

export function isMeaningfulStudyDiagram(diagram: DiagramShape): boolean {
  if (diagram.nodes.length < 2 || diagram.edges.length < 1) return false;
  const labeled = diagram.edges.filter((edge) => (edge.label ?? "").trim().length >= 2);
  if (labeled.length < 1) return false;
  const keywordNodes = diagram.nodes.every(
    (node) => node.label.trim().split(/\s+/).length === 1
  );
  const weakEdges = labeled.every((edge) => WEAK_EDGE_LABEL.test((edge.label ?? "").trim()));
  if (keywordNodes && weakEdges) return false;
  return diagram.nodes.some(
    (node) => node.label.trim().split(/\s+/).length >= 2 || /\d/.test(node.label)
  );
}

function sourceContentWords(source: string): string[] {
  return (source.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter(
    (word) => !SOURCE_STOP_WORDS.has(word)
  );
}

export function diagramExplainsSource(diagram: DiagramShape, source: string): boolean {
  if (!isMeaningfulStudyDiagram(diagram)) return false;
  const words = sourceContentWords(source);
  if (words.length === 0) return false;
  const labels = diagram.nodes.map((node) => node.label.toLowerCase()).join(" ");
  for (let index = 0; index < words.length - 1; index += 1) {
    const phrase = `${words[index]} ${words[index + 1]}`;
    if (phrase.length >= 8 && labels.includes(phrase)) return true;
  }
  const hits = new Set(words.filter((word) => labels.includes(word)));
  return hits.size >= 2;
}

type GroundedDiagram = {
  nodes: Array<{ label: string }>;
  edges: Array<{ label?: string }>;
};

export function retainGroundedDiagrams<
  T extends {
    diagram?: GroundedDiagram;
    illustrative?: {
      flowchart?: GroundedDiagram;
      mindMap?: GroundedDiagram;
      conceptDiagram?: GroundedDiagram;
      analogy?: unknown;
    };
    missingStructure?: string[];
  },
>(payload: T, sourceText: string): T {
  const illustrative = payload.illustrative;
  const keep = <D extends GroundedDiagram>(diagram?: D) =>
    diagram && diagramExplainsSource(diagram, sourceText) ? diagram : undefined;
  const flowchart = keep(illustrative?.flowchart) ?? keep(payload.diagram);
  const mindMap = keep(illustrative?.mindMap);
  const conceptDiagram = keep(illustrative?.conceptDiagram);
  const hasDiagram = Boolean(flowchart || mindMap || conceptDiagram);
  const missing = new Set(payload.missingStructure ?? []);
  if (!flowchart) missing.add("flowchart");
  if (!hasDiagram) missing.add("illustrative");
  else missing.delete("illustrative");
  const nextIllustrative =
    hasDiagram || illustrative?.analogy
      ? {
          ...(flowchart ? { flowchart } : {}),
          ...(mindMap ? { mindMap } : {}),
          ...(conceptDiagram ? { conceptDiagram } : {}),
          ...(illustrative?.analogy ? { analogy: illustrative.analogy } : {}),
        }
      : undefined;
  return {
    ...payload,
    diagram: flowchart,
    illustrative: nextIllustrative,
    missingStructure: [...missing],
  };
}

export function isQualityMcq(mcq: ComposedMcqItem, sourceText: string): boolean {
  if (!mcq.question || mcq.options.length !== 4) return false;
  if (!Number.isInteger(mcq.correctIndex) || mcq.correctIndex < 0 || mcq.correctIndex > 3) {
    return false;
  }
  const unique = new Set(mcq.options.map((option) => option.trim().toLowerCase()));
  if (unique.size !== 4) return false;
  if (GENERIC_QUIZ_STEM.test(mcq.question)) return false;
  const dummyCount = mcq.options.filter((option) => DUMMY_DISTRACTOR.test(option)).length;
  if (dummyCount >= 2) return false;
  const haystack = `${mcq.question} ${mcq.options[mcq.correctIndex]} ${mcq.explanation}`.toLowerCase();
  const sourceTerms = sourceText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4)
    .slice(0, 8);
  return sourceTerms.some((term) => haystack.includes(term));
}

export function preferValidatedMcqs(
  modelMcqs: ComposedMcqItem[] | undefined,
  _fallbackMcqs: ComposedMcqItem[] | undefined,
  sourceText: string
): ComposedMcqItem[] | undefined {
  const validModel = (modelMcqs ?? []).filter((item) => isQualityMcq(item, sourceText));
  return validModel.length > 0 ? validModel : undefined;
}

export function placeCorrectOption(
  correct: string,
  distractors: [string, string, string],
  slot: number
): { options: [string, string, string, string]; correctIndex: number } {
  const correctIndex = ((slot % 4) + 4) % 4;
  const options = [...distractors];
  options.splice(correctIndex, 0, correct);
  return {
    options: options as [string, string, string, string],
    correctIndex,
  };
}
