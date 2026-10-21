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

export interface StudyDiagram {
  title: string;
  kind?: StudyDiagramKind;
  nodes: StudyDiagramNode[];
  edges: StudyDiagramEdge[];
}

export interface ExplainSections {
  simpleExplanation: string;
  importantConcepts: string[];
  relevantExample: string;
  keyTakeaway: string;
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
}

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

function passageDomain(text: string): "ayurveda" | "physics" | "marketing" | "general" {
  if (passageDiscussesAyurveda(text)) return "ayurveda";
  if (PHYSICS_SIGNAL.test(text)) return "physics";
  if (MARKETING_SIGNAL.test(text)) return "marketing";
  return "general";
}

function buildFlowchart(params: {
  sentences: string[];
  phrases: string[];
}): StudyDiagram {
  const claim = clipClaim(params.sentences[0] ?? params.phrases[0] ?? "Main idea");
  const support = clipClaim(
    params.sentences[1] ?? params.phrases[1] ?? "Supporting point from the passage"
  );
  const extra = clipClaim(params.sentences[2] ?? params.phrases[2] ?? "Check the claim");
  return {
    title: "Passage flowchart",
    kind: "flowchart",
    nodes: [
      { id: "idea", label: excerptForDisplay(params.phrases[0] ?? "Core idea", 28) },
      { id: "claim", label: excerptForDisplay(claim, 42) },
      { id: "support", label: excerptForDisplay(support, 42) },
      { id: "check", label: excerptForDisplay(extra, 36) },
    ],
    edges: [
      { from: "idea", to: "claim", label: "states" },
      { from: "claim", to: "support", label: "supported by" },
      { from: "support", to: "check", label: "then" },
    ],
  };
}

function buildMindMap(params: {
  sentences: string[];
  phrases: string[];
}): StudyDiagram {
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
    title: "Passage mind map",
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
  sentences: string[];
  phrases: string[];
}): StudyDiagram {
  const a = excerptForDisplay(params.phrases[0] ?? "Concept A", 24);
  const b = excerptForDisplay(params.phrases[1] ?? params.sentences[0] ?? "Concept B", 24);
  const c = excerptForDisplay(params.phrases[2] ?? params.sentences[1] ?? "Concept C", 24);
  const d = excerptForDisplay(params.phrases[3] ?? "Outcome", 20);
  return {
    title: "Concept diagram",
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
  const claim = clipClaim(sentences[0] ?? text);
  if (domain === "physics") {
    return {
      setup: "Think of a hockey puck on smooth ice.",
      mapping: `The passage’s “${excerptForDisplay(phrases[0] ?? "object", 28)}” is the puck. “${excerptForDisplay(phrases[1] ?? "net force", 28)}” is a stick or a patch of rough ice.`,
      takeaway: excerptForDisplay(claim, 180),
    };
  }
  if (domain === "marketing") {
    return {
      setup: "Think of a shop window that has one promise, then proof, then a door.",
      mapping: `The selected lines ask you to lead with one ${excerptForDisplay(phrases[0] ?? "outcome", 24)}, then show ${excerptForDisplay(phrases[1] ?? "proof", 24)}, then one clear ask.`,
      takeaway: excerptForDisplay(claim, 180),
    };
  }
  if (domain === "ayurveda") {
    return {
      setup: "Think of three instruments in one ensemble: each has a job, and the piece holds when they stay in time.",
      mapping: `The passage’s own terms (${phrases.slice(0, 3).join(", ") || "the named energies"}) are those instruments, not a lecture added on top.`,
      takeaway: excerptForDisplay(claim, 180),
    };
  }
  return {
    setup: "Think of a claim, the evidence under it, and a check you can say aloud.",
    mapping: `Here the claim is “${excerptForDisplay(claim, 90)}”. The next line supplies the support you should be able to restate.`,
    takeaway: excerptForDisplay(sentences[1] ?? claim, 180),
  };
}

function groundedMcqs(text: string, pageNumber: number): ComposedMcqItem[] {
  const sentences = splitPassageSentences(text);
  const claim = clipClaim(sentences[0] ?? text.trim());
  const support = clipClaim(sentences[1] ?? claim);
  const phrase = extractKeyPhrases(text, 1)[0] ?? "this idea";
  const citationLabel = `[Page ${pageNumber}]`;

  const first: ComposedMcqItem = {
    question: `According to the selected passage, which statement is grounded in the text?`,
    options: [
      claim.length > 110 ? `${claim.slice(0, 107).trim()}…` : claim,
      "The passage says students should skip this idea and move on.",
      "The passage only names a heading and gives no explanation.",
      "The passage states that this point is unsolved and should be ignored.",
    ],
    correctIndex: 0,
    explanation: `The passage itself states: “${excerptForDisplay(claim, 180)}”`,
    citationLabel,
  };

  const second: ComposedMcqItem = {
    question: `What should you be able to recall about “${phrase}” after reading this passage?`,
    options: [
      support.length > 110 ? `${support.slice(0, 107).trim()}…` : support,
      "A formula or date that is not mentioned on this page.",
      "An author biography that the passage never gives.",
      "A conclusion the writer explicitly says is out of scope.",
    ],
    correctIndex: 0,
    explanation: `Stay inside the selected lines. A faithful recall is: “${excerptForDisplay(support, 180)}”`,
    citationLabel,
  };

  return sentences.length > 1 ? [first, second] : [first];
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
  const claim = clipClaim(sentences[0] ?? request.selectedText);
  const support = sentences[1] ? clipClaim(sentences[1]) : null;
  const extra = sentences[2] ? clipClaim(sentences[2]) : null;
  const domain = passageDomain(request.selectedText);
  const relevantExample =
    domain === "physics"
      ? `A free-body sketch starts by asking what is actually pushing or pulling, which is how the passage uses “${excerptForDisplay(phrases[0] ?? "force", 24)}”.`
      : domain === "marketing"
        ? `A landing page that opens with one customer result, then proof, then a single ask, is doing what these lines describe.`
        : support
          ? excerptForDisplay(support, 200)
          : `If you can restate “${excerptForDisplay(claim, 80)}” without looking back, you have the example.`;
  return {
    simpleExplanation: support
      ? `This passage is making a concrete point: ${claim} It then develops that point: ${support}`
      : `This passage is making a concrete point: ${claim}`,
    importantConcepts: uniqueKeep([
      excerptForDisplay(phrases[0] ?? "Main claim", 40),
      excerptForDisplay(phrases[1] ?? support ?? "Support", 40),
      excerptForDisplay(phrases[2] ?? extra ?? "Recall check", 40),
    ]).slice(0, 4),
    relevantExample,
    keyTakeaway: extra
      ? excerptForDisplay(extra, 180)
      : `If you can restate that claim in one sentence without looking back, you have the passage.`,
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
    "### Important concepts",
    ...sections.importantConcepts.map((item) => `- ${item}`),
    "### Relevant example",
    sections.relevantExample,
    "### Key takeaway",
    sections.keyTakeaway,
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
      const flowchart = buildFlowchart({ sentences, phrases });
      const mindMap = buildMindMap({ sentences, phrases });
      const conceptDiagram = buildConceptDiagram({ sentences, phrases });
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
      return {
        ...base,
        lens_type: "test_me",
        title: "Test Me",
        markdown_body: [
          `### Check yourself`,
          `Answer from the selected passage only. Guessing beyond these lines is not useful.`,
        ].join("\n"),
        key_points: mcqs.map((item) => item.question),
        mcqs,
        short_answers: shortAnswers,
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
