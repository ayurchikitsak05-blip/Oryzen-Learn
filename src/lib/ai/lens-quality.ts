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

function quantitiesPreserved(label: string, clause: string): boolean {
  const numbers = clause.match(/\d+(?:\.\d+)?/g) ?? [];
  if (numbers.some((number) => !label.includes(number))) return false;
  const units =
    clause.match(
      /\b(?:amperes?|coulombs?|volts?|ohms?|watts?|joules?|newtons?|percent|centimetres?|centimeters?|metres?|meters?)\b/gi
    ) ?? [];
  const haystack = label.toLowerCase();
  return units.every((unit) => haystack.includes(unit.toLowerCase().replace(/s$/, "").slice(0, 5)));
}

function transformationPreserved(label: string, clause: string): boolean {
  const match = clause.match(
    /\b(?:turns?|turned|becomes?|became|changes?|changed)(?:\s+into)?\s+([a-z]{3,})/i
  );
  if (!match || match.index === undefined) return true;
  const result = match[1]?.toLowerCase() ?? "";
  const haystack = label.toLowerCase();
  if (!haystack.includes(result)) return false;
  const lead = contentWordsInOrder(clause.slice(0, match.index))[0];
  return !lead || haystack.includes(lead);
}

function detailPreserved(
  sentence: string,
  marker: RegExp,
  fromLabel: string,
  toLabel: string,
  flip: boolean
): boolean {
  const flags = marker.flags.includes("g") ? marker.flags : `${marker.flags}g`;
  const pattern = new RegExp(marker.source, flags);
  for (const match of sentence.matchAll(pattern)) {
    const before = clauseBefore(sentence, match.index ?? 0);
    const after = clauseAfter(sentence, (match.index ?? 0) + match[0].length);
    const sourceClause = flip ? after : before;
    const targetClause = flip ? before : after;
    if (
      quantitiesPreserved(fromLabel, sourceClause) &&
      quantitiesPreserved(toLabel, targetClause) &&
      transformationPreserved(fromLabel, sourceClause) &&
      transformationPreserved(toLabel, targetClause)
    ) {
      return true;
    }
  }
  return false;
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
    sentences.some(
      (sentence) =>
        directedRelation(sentence, marker, fromLabel, toLabel, mode) &&
        detailPreserved(sentence, marker, fromLabel, toLabel, false)
    );
  const becauseCause = () =>
    sentences.some((sentence) => {
      if (!/\bbecause\b/i.test(sentence)) return false;
      const marker = /\bbecause\b/i;
      for (const match of sentence.matchAll(new RegExp(marker.source, "gi"))) {
        const effect = clauseBefore(sentence, match.index ?? 0);
        const cause = clauseAfter(sentence, (match.index ?? 0) + match[0].length);
        const forward =
          labelHasWord(fromLabel, nearestContentWord(cause, "after")) &&
          (labelHasWord(toLabel, nearestContentWord(effect, "before")) ||
            targetMatchesClause(effect, toLabel));
        if (
          forward &&
          detailPreserved(sentence, marker, fromLabel, toLabel, true)
        ) {
          return true;
        }
      }
      return false;
    });
  const statedIf = () =>
    sentences.some((sentence) => {
      const match = sentence.match(/\bif\s+(.+?),\s+(.+)/i);
      if (!match?.[1] || !match[2]) return false;
      const condition = match[1];
      const results = match[2].split(/\bbecause\b/i)[0]?.split(/\band\b/i) ?? [];
      if (!labelHasWord(fromLabel, nearestContentWord(condition, "before"))) return false;
      if (!quantitiesPreserved(fromLabel, condition) || !transformationPreserved(fromLabel, condition)) {
        return false;
      }
      return results.some((result) => {
        const clause = result.trim();
        const aimed =
          labelHasWord(toLabel, nearestContentWord(clause, "after")) ||
          targetMatchesClause(clause, toLabel);
        return aimed && quantitiesPreserved(toLabel, clause) && transformationPreserved(toLabel, clause);
      });
    });

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
    return directed(/\b(causes|cause|creates|produces|leads to|results in)\b/i, "nearest") || becauseCause();
  }
  if (relation === "unless") return directed(/\bunless\b/i, "nearest");
  if (/^(next|then)$/.test(relation)) return directed(/\b(next|then)\b/i, "nearest");
  if (relation === "if") return statedIf();
  if (relation === "so") return directed(/\bso\b/i, "nearest");
  if (/^(times|multiplied by|multiplies|multiply)$/.test(relation)) {
    return directed(/\btimes\b|\bmultiplied by\b|×/i, "nearest");
  }
  if (/^(acts on|act on|acts upon|acting on)$/.test(relation)) {
    if (mentionsMotion(fromLabel) || mentionsMotion(toLabel)) return false;
    return directed(/\bacts on\b|\bacts upon\b|\bacting on\b/i, "nearest");
  }
  if (/^(states|means|describes|includes)$/.test(relation)) {
    return directed(new RegExp(`\\b${relation}\\b`, "i"), "nearest");
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
    const definedTerm = words.length === 1 && node.label.trim().length >= 6;
    if (words.length < 2 && !/\d/.test(node.label) && !definedTerm) return false;
    const sharesWord = labelWords(node.label).some((word) => haystack.includes(word));
    const sharesDigit = (node.label.match(/\d+(?:\.\d+)?/g) ?? []).some((digit) =>
      source.includes(digit)
    );
    if (!sharesWord && !sharesDigit) return false;
  }
  const sequential = diagram.edges.filter((edge) => /^(next|then)$/i.test(edge.label ?? ""));
  if (sequential.length > 0) {
    const sentence = passageSentences(source).find((item) => item.split(/\bthen\b/i).length >= 3);
    const parts = sentence?.split(/\bthen\b/i).map((part) => part.trim()).filter(Boolean) ?? [];
    if (parts.length >= 3) {
      const labels = diagram.nodes.map((node) => node.label).join(" ").toLowerCase();
      const complete = parts.every((part) =>
        contentWordsInOrder(part).some((word) => labels.includes(word))
      );
      if (!complete) return false;
    }
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

const TITLE_STRUCTURE = new Set([
  "what",
  "this",
  "that",
  "passage",
  "states",
  "state",
  "cause",
  "causes",
  "sequence",
  "identity",
  "sentence",
  "page",
  "concept",
  "diagram",
  "relation",
  "process",
  "definition",
  "calculation",
  "exception",
  "quantity",
  "multiplication",
  "equals",
  "shown",
  "study",
]);

function groundedHeading(title: string | undefined, source: string): string | undefined {
  if (!title) return title;
  const unsupported = contentWordsInOrder(title).filter(
    (word) => !TITLE_STRUCTURE.has(word) && !source.toLowerCase().includes(word)
  );
  return unsupported.length === 0 ? title : "The relation this passage states";
}

function withGroundedTitle<D extends GroundedDiagram>(diagram: D, source: string): D {
  const title = (diagram as { title?: string }).title;
  if (!title) return diagram;
  const next = groundedHeading(title, source);
  return next === title ? diagram : { ...diagram, title: next };
}

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
  const titled = (diagram?: GroundedDiagram) =>
    diagram ? withGroundedTitle(diagram, sourceText) : undefined;
  const hasDiagram = Boolean(flowchart || mindMap || conceptDiagram);
  const missing = new Set(payload.missingStructure ?? []);
  if (!flowchart) missing.add("flowchart");
  else missing.delete("flowchart");
  if (!hasDiagram) missing.add("illustrative");
  else missing.delete("illustrative");
  const nextIllustrative =
    hasDiagram || illustrative?.analogy
      ? {
          ...(flowchart ? { flowchart: titled(flowchart) } : {}),
          ...(mindMap ? { mindMap: titled(mindMap) } : {}),
          ...(conceptDiagram ? { conceptDiagram: titled(conceptDiagram) } : {}),
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

type CompletingDiagram = GroundedDiagram & {
  title?: string;
  kind?: "flowchart" | "mind_map" | "concept_diagram";
};

type MeasuredArea = {
  length: string;
  width: string;
  area: string;
  lengthValue: string;
  widthValue: string;
  areaValue: string;
};

const PHRASE_SKIP = new Set([
  "the",
  "and",
  "for",
  "its",
  "are",
  "was",
  "not",
  "but",
  "has",
  "had",
  "his",
  "her",
  "she",
  "him",
  "you",
  "our",
  "any",
  "can",
  "may",
]);

function phraseWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter(
    (word) => !PHRASE_SKIP.has(word)
  );
}

function acceptedDiagram<T extends CompletingDiagram>(diagram: T, source: string): T | null {
  return diagramRelationsAreSupported(diagram, source) ? diagram : null;
}

function explicitUnlessDiagram(source: string): {
  flowchart: CompletingDiagram;
  mindMap: CompletingDiagram;
} | null {
  for (const sentence of passageSentences(source)) {
    const match = sentence.match(/^(.+?)\s+unless\s+(.+?)[.?!]?$/i);
    if (!match?.[1] || !match[2]) continue;
    const before = phraseWords(match[1]);
    const after = phraseWords(match[2]);
    if (before.length < 2 || after.length < 2) continue;
    const nodes = [
      { id: "continues", label: before.slice(-2).join(" ") },
      { id: "exception", label: after.slice(0, 2).join(" ") },
    ];
    const edges = [{ from: "continues", to: "exception", label: "unless" }];
    const flowchart = acceptedDiagram(
      {
        title: "The exception this sentence states",
        kind: "flowchart" as const,
        nodes,
        edges,
      },
      source
    );
    if (!flowchart) continue;
    return {
      flowchart,
      mindMap: {
        title: "The exception this sentence states",
        kind: "mind_map",
        nodes: nodes.map((node) => ({ ...node })),
        edges: edges.map((edge) => ({ ...edge })),
      },
    };
  }
  return null;
}

function explicitFormula(source: string): { subject: string; formula: string } | null {
  for (const sentence of passageSentences(source)) {
    const match = sentence.match(/^(.+?)\s+(?:equals|equal to|is|are|=)\s+(.+)$/i);
    if (!match?.[1] || !match[2]) continue;
    const formula = match[2].replace(/[.?!]+$/, "").replace(/\s+/g, " ").trim();
    if (!/\btimes\b|\bmultiplied by\b|×/i.test(formula)) continue;
    const subject = match[1]
      .replace(/^(?:the|a|an)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (subject.split(/\s+/).length < 2 || formula.split(/\s+/).length < 2) continue;
    const probe = {
      nodes: [
        { id: "subject", label: subject },
        { id: "formula", label: formula },
      ],
      edges: [{ from: "subject", to: "formula", label: "equals" }],
    };
    if (!diagramRelationsAreSupported(probe, source)) continue;
    return { subject, formula };
  }
  return null;
}

function explicitMeasuredArea(source: string): MeasuredArea | null {
  const length = source.match(
    /\blength\s+is\s+(\d+(?:\.\d+)?)\s*(cm|centimetres?|centimeters?|metres?|meters?|mm|m)\b/i
  );
  const width = source.match(
    /\bwidth\s+is\s+(\d+(?:\.\d+)?)\s*(cm|centimetres?|centimeters?|metres?|meters?|mm|m)\b/i
  );
  const area = source.match(
    /\barea\s+is\s+(\d+(?:\.\d+)?)\s+((?:square\s+)?(?:centimetres?|centimeters?|metres?|meters?|cm|mm|m)(?:\s*(?:\^?2|²))?)/i
  );
  if (!length?.[1] || !length[2] || !width?.[1] || !width[2] || !area?.[1] || !area[2]) {
    return null;
  }
  return {
    lengthValue: length[1],
    widthValue: width[1],
    areaValue: area[1],
    length: `${length[1]} ${length[2]}`,
    width: `${width[1]} ${width[2]}`,
    area: `${area[1]} ${area[2].replace(/\s+/g, " ").trim()}`,
  };
}

function identityDiagram(
  source: string,
  formula: { subject: string; formula: string } | null,
  worked: MeasuredArea | null,
  kind: "mind_map" | "concept_diagram",
  title: string
): CompletingDiagram | null {
  if (!formula) return null;
  const nodes = [
    { id: "subject", label: formula.subject },
    { id: "formula", label: formula.formula },
  ];
  const edges = [{ from: "subject", to: "formula", label: "equals" }];
  if (worked && edgeRelationIsSupported(formula.subject, worked.area, "equals", source)) {
    nodes.push({ id: "result", label: worked.area });
    edges.push({ from: "subject", to: "result", label: "equals" });
  }
  return acceptedDiagram({ title, kind, nodes, edges }, source);
}

function workedFlowchart(
  source: string,
  formula: { subject: string; formula: string } | null,
  worked: MeasuredArea | null
): CompletingDiagram | null {
  if (!worked) return null;
  const nodes = [
    { id: "length", label: `length ${worked.length}` },
    { id: "width", label: `width ${worked.width}` },
    { id: "area", label: "the area" },
    { id: "result", label: worked.area },
  ];
  const edges = [
    { from: "length", to: "width", label: "times" },
    { from: "area", to: "result", label: "equals" },
  ];
  if (formula) {
    nodes.push(
      { id: "subject", label: formula.subject },
      { id: "formula", label: formula.formula }
    );
    edges.push({ from: "subject", to: "formula", label: "equals" });
  }
  return acceptedDiagram(
    { title: "The calculation the page states", kind: "flowchart", nodes, edges },
    source
  );
}

function clausePhrase(text: string, maxWords = 8): string | null {
  const cleaned = text
    .replace(/[.?!]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^(?:and|or|but)\s+/i, "")
    .trim();
  if (!cleaned || /[,:;]|\b(?:because|unless|if|when|while)\b/i.test(cleaned)) return null;
  if (/^(?:not|no)\b/i.test(cleaned)) return null;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > maxWords) return null;
  return cleaned;
}

function subjectPhrase(text: string): string | null {
  const stripped = text.replace(/^(?:the|a|an)\s+/i, "").trim();
  return clausePhrase(stripped) ?? (/^[A-Za-z]{6,}$/.test(stripped) ? stripped : null);
}

function explicitCauseDiagram(source: string): {
  flowchart: CompletingDiagram;
  mindMap?: CompletingDiagram;
  conceptDiagram: CompletingDiagram;
} | null {
  const nodes: Array<{ id: string; label: string }> = [];
  const edges: Array<{ from: string; to: string; label: string }> = [];
  const seen = new Map<string, string>();
  const idFor = (label: string, role: string) => {
    const key = label.toLowerCase();
    const existing = seen.get(key);
    if (existing) return existing;
    const id = `${role}-${seen.size + 1}`;
    seen.set(key, id);
    nodes.push({ id, label });
    return id;
  };
  for (const sentence of passageSentences(source)) {
    const match = sentence.match(/^(.+?)\s+causes\s+(.+?)[.?!]?$/i);
    if (!match?.[1] || !match[2]) continue;
    const from = clausePhrase(match[1]);
    const to = clausePhrase(match[2]);
    if (!from || !to) continue;
    if (!edgeRelationIsSupported(from, to, "causes", source)) continue;
    const fromId = idFor(from, "cause");
    const toId = idFor(to, "effect");
    if (fromId === toId) continue;
    edges.push({ from: fromId, to: toId, label: "causes" });
    if (edges.length >= 3) break;
  }
  if (edges.length === 0) return null;
  const flowchart = acceptedDiagram(
    {
      title: "The cause this passage states",
      kind: "flowchart" as const,
      nodes,
      edges,
    },
    source
  );
  if (!flowchart) return null;
  const sources = new Set(edges.map((edge) => edge.from));
  const copy = {
    title: "The cause this passage states",
    nodes: nodes.map((node) => ({ ...node })),
    edges: edges.map((edge) => ({ ...edge })),
  };
  return {
    flowchart,
    mindMap: sources.size === 1 ? { ...copy, kind: "mind_map" as const } : undefined,
    conceptDiagram: { ...copy, kind: "concept_diagram" as const },
  };
}

function explicitThenChain(source: string): CompletingDiagram | null {
  for (const sentence of passageSentences(source)) {
    const parts = sentence
      .split(/\bthen\b/i)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 3) continue;
    const nodes: Array<{ id: string; label: string }> = [];
    const edges: Array<{ from: string; to: string; label: string }> = [];
    let previousId: string | null = null;
    for (const part of parts) {
      const label = clausePhrase(part);
      if (!label) {
        previousId = null;
        continue;
      }
      const id = `step-${nodes.length + 1}`;
      nodes.push({ id, label });
      if (previousId && edgeRelationIsSupported(nodes[nodes.length - 2]?.label ?? "", label, "then", source)) {
        edges.push({ from: previousId, to: id, label: "then" });
      }
      previousId = id;
      if (nodes.length >= 4) break;
    }
    if (edges.length < 2) continue;
    const flowchart = acceptedDiagram(
      { title: "The sequence this passage states", kind: "flowchart", nodes, edges },
      source
    );
    if (flowchart) return flowchart;
  }
  return null;
}

function explicitShortIdentity(source: string): {
  mindMap: CompletingDiagram;
  conceptDiagram: CompletingDiagram;
} | null {
  const nodes: Array<{ id: string; label: string }> = [];
  const edges: Array<{ from: string; to: string; label: string }> = [];
  const seen = new Map<string, string>();
  const idFor = (label: string) => {
    const key = label.toLowerCase();
    const existing = seen.get(key);
    if (existing) return existing;
    const id = `identity-${seen.size + 1}`;
    seen.set(key, id);
    nodes.push({ id, label });
    return id;
  };
  for (const sentence of passageSentences(source)) {
    if (/\bnot\b/i.test(sentence) || /^if\b/i.test(sentence)) continue;
    const match = sentence.match(/^(.+?)\s+(?:equals|equal to|is|are|=)\s+(.+)$/i);
    const means = sentence.match(/^(.+?)\s+means\s+(.+)$/i);
    const found = match?.[1] && match[2] ? { left: match[1], right: match[2], label: "equals" } : null;
    const stated = found ?? (means?.[1] && means[2] ? { left: means[1], right: means[2], label: "means" } : null);
    if (!stated) continue;
    const subject = subjectPhrase(stated.left);
    const value = clausePhrase(stated.right, 12);
    if (!subject || !value || /\btimes\b|\bmultiplied by\b|×/i.test(value)) continue;
    if (!edgeRelationIsSupported(subject, value, stated.label, source)) continue;
    const from = idFor(subject);
    const to = idFor(value);
    if (from === to) continue;
    edges.push({ from, to, label: stated.label });
    if (edges.length >= 3) break;
  }
  if (edges.length === 0) return null;
  const first = edges[0];
  const mindNodes = nodes.filter((node) => node.id === first?.from || node.id === first?.to);
  const mindMap = acceptedDiagram(
    {
      title: "The identity this sentence states",
      kind: "mind_map" as const,
      nodes: mindNodes,
      edges: first ? [{ ...first }] : [],
    },
    source
  );
  const conceptDiagram = acceptedDiagram(
    {
      title: "The identity this sentence states",
      kind: "concept_diagram" as const,
      nodes,
      edges,
    },
    source
  );
  if (!mindMap || !conceptDiagram) return null;
  return { mindMap, conceptDiagram };
}

function formulaFlowchart(
  source: string,
  formula: { subject: string; formula: string } | null
): CompletingDiagram | null {
  if (!formula) return null;
  return acceptedDiagram(
    {
      title: "The multiplication the page states",
      kind: "flowchart",
      nodes: [
        { id: "length", label: "the length" },
        { id: "width", label: "the width" },
      ],
      edges: [{ from: "length", to: "width", label: "times" }],
    },
    source
  );
}

function labelHasNumber(diagram: CompletingDiagram, value: string): boolean {
  const pattern = new RegExp(`(?<!\\d)${value}(?!\\d)`);
  return diagram.nodes.some((node) => pattern.test(node.label));
}

function withNodeIds(diagram: CompletingDiagram): CompletingDiagram {
  return {
    ...diagram,
    nodes: diagram.nodes.map((node, index) => ({
      ...node,
      id: node.id || `n${index}`,
    })),
  };
}

function includeWorkedResult(
  diagram: CompletingDiagram,
  source: string,
  worked: MeasuredArea | null
): CompletingDiagram {
  if (!worked || labelHasNumber(diagram, worked.areaValue) || diagram.nodes.length >= 6) {
    return diagram;
  }
  const current = withNodeIds(diagram);
  const existing = current.nodes.find((node) =>
    edgeRelationIsSupported(node.label, worked.area, "equals", source)
  );
  const subject = existing ?? { id: "area-subject", label: "the area" };
  if (!edgeRelationIsSupported(subject.label, worked.area, "equals", source)) return diagram;
  const nodes = existing ? current.nodes : [...current.nodes, subject];
  if (nodes.length >= 6) return diagram;
  const next = {
    ...current,
    nodes: [...nodes, { id: "worked-result", label: worked.area }],
    edges: [...current.edges, { from: subject.id ?? "area-subject", to: "worked-result", label: "equals" }],
  };
  return acceptedDiagram(next, source) ?? diagram;
}

function includeMeasuredFactors(
  diagram: CompletingDiagram,
  source: string,
  worked: MeasuredArea | null
): CompletingDiagram {
  if (!worked || diagram.nodes.length > 4) return diagram;
  if (labelHasNumber(diagram, worked.lengthValue) && labelHasNumber(diagram, worked.widthValue)) {
    return diagram;
  }
  const lengthLabel = `length ${worked.length}`;
  const widthLabel = `width ${worked.width}`;
  if (!edgeRelationIsSupported(lengthLabel, widthLabel, "times", source)) return diagram;
  const current = withNodeIds(diagram);
  const next = {
    ...current,
    nodes: [
      ...current.nodes,
      { id: "measured-length", label: lengthLabel },
      { id: "measured-width", label: widthLabel },
    ],
    edges: [
      ...current.edges,
      { from: "measured-length", to: "measured-width", label: "times" },
    ],
  };
  return acceptedDiagram(next, source) ?? diagram;
}

function explicitStatedProcesses(source: string): CompletingDiagram | null {
  const nodes: Array<{ id: string; label: string }> = [];
  const edges: Array<{ from: string; to: string; label: string }> = [];
  const seen = new Map<string, string>();
  const idFor = (label: string) => {
    const key = label.toLowerCase();
    const existing = seen.get(key);
    if (existing) return existing;
    const id = `process-${seen.size + 1}`;
    seen.set(key, id);
    nodes.push({ id, label });
    return id;
  };
  const add = (from: string | null, to: string | null, label: string) => {
    if (!from || !to || edges.length >= 8) return;
    if (!edgeRelationIsSupported(from, to, label, source)) return;
    const fromId = idFor(from);
    const toId = idFor(to);
    if (fromId === toId) return;
    if (edges.some((edge) => edge.from === fromId && edge.to === toId && edge.label === label)) return;
    edges.push({ from: fromId, to: toId, label });
  };
  for (const sentence of passageSentences(source)) {
    const becauseAt = sentence.search(/\bbecause\b/i);
    if (becauseAt >= 0) {
      add(
        clausePhrase(clauseAfter(sentence, becauseAt + "because".length), 12),
        clausePhrase(clauseBefore(sentence, becauseAt), 12),
        "causes"
      );
    }
    const conditional = sentence.match(/\bif\s+(.+?),\s+(.+)/i);
    if (conditional?.[1] && conditional[2]) {
      const condition = clausePhrase(conditional[1], 12);
      const results = conditional[2].split(/\bbecause\b/i)[0]?.split(/\band\b/i) ?? [];
      for (const result of results) add(condition, clausePhrase(result, 12), "if");
    }
    const needs = sentence.match(/^(.+?)\s+needs\s+(.+)$/i);
    if (needs?.[1] && needs[2]) {
      const [needed, purpose] = needs[2].split(/\s+so\s+/i);
      const object = clausePhrase(needed ?? "", 12);
      add(clausePhrase(needs[1], 12), object, "needs");
      if (purpose) add(object, clausePhrase(purpose, 12), "so");
    }
    const verb = sentence.match(
      /^(.+?)\s+(lowers|raises|increases|decreases|reduces)\s+(.+?)[.?!]?$/i
    );
    if (verb?.[1] && verb[2] && verb[3]) {
      add(clausePhrase(verb[1], 12), clausePhrase(verb[3], 12), verb[2].toLowerCase());
    }
    if (edges.length >= 8) break;
  }
  if (edges.length === 0) return null;
  return acceptedDiagram(
    { title: "The relation this passage states", kind: "flowchart", nodes, edges },
    source
  );
}

/**
 * Fills an empty flowchart, mind map, or concept diagram only when the
 * passage states the relation. A diagram that fails the relation gate is
 * not inserted.
 */
export function completeExplicitDiagrams<
  T extends {
    illustrative?: {
      flowchart?: CompletingDiagram;
      mindMap?: CompletingDiagram;
      conceptDiagram?: CompletingDiagram;
      analogy?: unknown;
    };
  },
>(payload: T, sourceText: string): T {
  const source = sourceText.trim();
  if (!source) return payload;
  const illustrative = payload.illustrative;
  const unlessDiagram = explicitUnlessDiagram(source);
  const formula = explicitFormula(source);
  const worked = explicitMeasuredArea(source);
  const cause = explicitCauseDiagram(source);
  const sequence = explicitThenChain(source);
  const identity = explicitShortIdentity(source);
  const process = explicitStatedProcesses(source);

  let flowchart = illustrative?.flowchart;
  let mindMap = illustrative?.mindMap;
  let conceptDiagram = illustrative?.conceptDiagram;

  if (!flowchart) {
    flowchart =
      unlessDiagram?.flowchart ??
      workedFlowchart(source, formula, worked) ??
      formulaFlowchart(source, formula) ??
      sequence ??
      cause?.flowchart ??
      process ??
      undefined;
  } else if (worked) {
    flowchart = includeMeasuredFactors(includeWorkedResult(flowchart, source, worked), source, worked);
  }

  if (!mindMap) {
    mindMap =
      identityDiagram(source, formula, worked, "mind_map", "What this quantity equals") ??
      identity?.mindMap ??
      unlessDiagram?.mindMap ??
      cause?.mindMap ??
      undefined;
  } else if (worked) {
    mindMap = includeWorkedResult(mindMap, source, worked);
  }

  if (!conceptDiagram) {
    conceptDiagram =
      identityDiagram(
        source,
        formula,
        worked,
        "concept_diagram",
        "The identity the page states"
      ) ??
      identity?.conceptDiagram ??
      cause?.conceptDiagram ??
      undefined;
  } else if (worked) {
    conceptDiagram = includeWorkedResult(conceptDiagram, source, worked);
  }

  if (!flowchart && !mindMap && !conceptDiagram && !illustrative?.analogy) return payload;
  return {
    ...payload,
    illustrative: {
      ...(flowchart ? { flowchart } : {}),
      ...(mindMap ? { mindMap } : {}),
      ...(conceptDiagram ? { conceptDiagram } : {}),
      ...(illustrative?.analogy ? { analogy: illustrative.analogy } : {}),
    },
  };
}

export function groundIllustrativeDiagrams<
  T extends {
    title?: string;
    diagram?: GroundedDiagram;
    illustrative?: {
      flowchart?: CompletingDiagram;
      mindMap?: CompletingDiagram;
      conceptDiagram?: CompletingDiagram;
      analogy?: unknown;
    };
    missingStructure?: string[];
  },
>(payload: T, sourceText: string): T {
  const grounded = retainGroundedDiagrams(payload, sourceText);
  const completed = retainGroundedDiagrams(completeExplicitDiagrams(grounded, sourceText), sourceText);
  const title = groundedHeading(completed.title, sourceText);
  return title === completed.title ? completed : { ...completed, title };
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
