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
  nodes: ReadonlyArray<{ id?: string; label: string }>;
  edges: ReadonlyArray<{ from?: string; to?: string; label?: string }>;
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

type RelatedDiagram = DiagramShape & {
  nodes: ReadonlyArray<{ id?: string; label: string }>;
  edges: ReadonlyArray<{ from?: string; to?: string; label?: string }>;
};

function passageSentences(source: string): string[] {
  const parts = source
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [source.trim()];
}

function contentWordsInOrder(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter(
    (word) => !SOURCE_STOP_WORDS.has(word)
  );
}

function labelWords(text: string): string[] {
  return contentWordsInOrder(text);
}

function clauseBefore(sentence: string, index: number): string {
  const raw = sentence.slice(0, index);
  const separators = [...raw.matchAll(/,|;|:|\b(?:and|or|unless|then|but)\b/gi)];
  const last = separators.at(-1);
  const start = last?.index === undefined ? 0 : last.index + last[0].length;
  return raw.slice(start).trim();
}

function clauseAfter(sentence: string, index: number): string {
  const raw = sentence.slice(index);
  const separator = raw.search(/,|;|:|\b(?:and|or|unless|then|but)\b/i);
  return (separator >= 0 ? raw.slice(0, separator) : raw).trim();
}

function nearestContentWord(clause: string, side: "before" | "after"): string | null {
  const words = contentWordsInOrder(clause);
  if (words.length === 0) return null;
  return side === "before" ? words[words.length - 1] : words[0];
}

function labelHasWord(label: string, word: string | null): boolean {
  return Boolean(word && labelWords(label).includes(word));
}

function clauseHasLabelWord(clause: string, label: string): boolean {
  const words = new Set(contentWordsInOrder(clause));
  return labelWords(label).some((word) => words.has(word));
}

function targetMatchesClause(clause: string, label: string): boolean {
  if (labelHasWord(label, nearestContentWord(clause, "after"))) return true;
  const digits = clause.match(/\d+(?:\.\d+)?/g) ?? [];
  return digits.some((digit) => label.includes(digit));
}

/**
 * The source must play the role before the relation, and the target the role
 * after it. Sharing the relation's words with both labels is not enough.
 */
function directedRelation(
  sentence: string,
  marker: RegExp,
  fromLabel: string,
  toLabel: string,
  mode: "nearest" | "subject"
): boolean {
  const flags = marker.flags.includes("g") ? marker.flags : `${marker.flags}g`;
  const pattern = new RegExp(marker.source, flags);
  for (const match of sentence.matchAll(pattern)) {
    const before = clauseBefore(sentence, match.index ?? 0);
    const after = clauseAfter(sentence, (match.index ?? 0) + match[0].length);
    const sourceMatches =
      mode === "nearest"
        ? labelHasWord(fromLabel, nearestContentWord(before, "before"))
        : clauseHasLabelWord(before, fromLabel);
    if (sourceMatches && targetMatchesClause(after, toLabel)) return true;
  }
  return false;
}

function mentionsForce(label: string): boolean {
  return /\bforces?\b/i.test(label);
}

function mentionsDiagram(label: string): boolean {
  return /\bdiagram\b/i.test(label);
}

function mentionsLaw(label: string): boolean {
  return /\blaws?\b/i.test(label);
}

function mentionsMotion(label: string): boolean {
  return /\b(velocity|motion|speed)\b/i.test(label);
}

/**
 * An arrow is kept only when one sentence gives the source and the target
 * those roles. This is a passage check, not a proof that every accepted
 * diagram is scientifically correct.
 */
export function edgeRelationIsSupported(
  fromLabel: string,
  toLabel: string,
  edgeLabel: string,
  source: string
): boolean {
  const relation = edgeLabel.trim().toLowerCase();
  if (!fromLabel.trim() || !toLabel.trim() || relation.length < 2) return false;
  const forceAndDiagram =
    (mentionsForce(fromLabel) && mentionsDiagram(toLabel)) ||
    (mentionsForce(toLabel) && mentionsDiagram(fromLabel));
  const lawAndForce =
    (mentionsLaw(fromLabel) && mentionsForce(toLabel)) ||
    (mentionsLaw(toLabel) && mentionsForce(fromLabel));
  const lawAndMotion =
    (mentionsLaw(fromLabel) && mentionsMotion(toLabel)) ||
    (mentionsLaw(toLabel) && mentionsMotion(fromLabel));
  const sentences = passageSentences(source);
  const directed = (marker: RegExp, mode: "nearest" | "subject") =>
    sentences.some((sentence) => directedRelation(sentence, marker, fromLabel, toLabel, mode));

  if (/^(becomes|become|turns into|transforms into)$/.test(relation)) {
    if (forceAndDiagram) return false;
    return directed(/\b(becomes|become|turns into|changes into)\b/i, "nearest");
  }
  if (/^(equals|equal|equal to|=)$/.test(relation)) {
    if (lawAndForce || lawAndMotion) return false;
    return directed(/\bequals\b|\bequal to\b|\bis\b|\bare\b|=/i, "subject");
  }
  if (/^(causes|cause|creates|produces|leads to|results in)$/.test(relation)) {
    if (lawAndForce) return false;
    return directed(/\b(causes|cause|creates|produces|leads to|results in)\b/i, "nearest");
  }
  if (relation === "unless") return directed(/\bunless\b/i, "nearest");
  if (/^(next|then)$/.test(relation)) return directed(/\b(next|then)\b/i, "nearest");
  if (/^(times|multiplied by|multiplies|multiply)$/.test(relation)) {
    return directed(/\btimes\b|\bmultiplied by\b|×/i, "nearest");
  }
  if (/^(acts on|act on|acts upon|acting on)$/.test(relation)) {
    if (mentionsMotion(fromLabel) || mentionsMotion(toLabel)) return false;
    return directed(/\bacts on\b|\bacts upon\b|\bacting on\b/i, "nearest");
  }
  if (/^(states|means|describes|includes)$/.test(relation)) {
    if (toLabel.trim().split(/\s+/).length < 4) return false;
    const haystack = source.toLowerCase();
    return (
      labelWords(fromLabel).some((word) => haystack.includes(word)) &&
      labelWords(toLabel).some((word) => haystack.includes(word))
    );
  }
  if (labelWords(relation).length === 0 && !relation.includes(" ")) return false;
  const phrase = relation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return directed(new RegExp(`\\b${phrase}\\b`, "i"), "nearest");
}

export function diagramRelationsAreSupported(diagram: RelatedDiagram, source: string): boolean {
  if (!isMeaningfulStudyDiagram(diagram) || !source.trim()) return false;
  const byId = new Map(diagram.nodes.map((node) => [node.id ?? "", node.label]));
  const haystack = source.toLowerCase();
  for (const node of diagram.nodes) {
    const words = node.label.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2 && !/\d/.test(node.label)) return false;
    const sharesWord = labelWords(node.label).some((word) => haystack.includes(word));
    const sharesDigit = (node.label.match(/\d+(?:\.\d+)?/g) ?? []).some((digit) =>
      source.includes(digit)
    );
    if (!sharesWord && !sharesDigit) return false;
  }
  return diagram.edges.every((edge, index) => {
    const from =
      (edge.from ? byId.get(edge.from) : undefined) ??
      diagram.nodes[index]?.label ??
      diagram.nodes[0]?.label ??
      "";
    const to =
      (edge.to ? byId.get(edge.to) : undefined) ??
      diagram.nodes[index + 1]?.label ??
      diagram.nodes[1]?.label ??
      "";
    return edgeRelationIsSupported(from, to, edge.label ?? "", source);
  });
}

export function diagramExplainsSource(diagram: DiagramShape, source: string): boolean {
  return diagramRelationsAreSupported(diagram, source);
}

type GroundedDiagram = {
  nodes: Array<{ id?: string; label: string }>;
  edges: Array<{ from?: string; to?: string; label?: string }>;
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
