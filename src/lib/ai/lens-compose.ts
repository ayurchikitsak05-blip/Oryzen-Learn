import { DOSHA_STUDY_PRESETS, type Dosha, type HighlightLensType } from "@/lib/prakriti/config";
import type { BoundingBox, CitationReadyChunk } from "@/lib/reader/extractor";

type ComposeTaskType = HighlightLensType | "deep_integrative_synthesis";

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
  nodes: StudyDiagramNode[];
  edges: StudyDiagramEdge[];
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
  citations: ComposedCitation[];
  diagram?: StudyDiagram;
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

function buildDiagram(params: {
  title: string;
  sentences: string[];
  phrases: string[];
}): StudyDiagram {
  const claim = clipClaim(params.sentences[0] ?? params.phrases[0] ?? "Main idea");
  const support = clipClaim(
    params.sentences[1] ?? params.phrases[1] ?? "Supporting point from the passage"
  );
  const check = clipClaim(params.phrases[0] ?? "Recall the main idea");
  return {
    title: params.title,
    nodes: [
      { id: "idea", label: excerptForDisplay(params.phrases[0] ?? "Core idea", 28) },
      { id: "claim", label: excerptForDisplay(claim, 42) },
      { id: "support", label: excerptForDisplay(support, 42) },
      { id: "recall", label: `Recall: ${excerptForDisplay(check, 24)}` },
    ],
    edges: [
      { from: "idea", to: "claim", label: "states" },
      { from: "claim", to: "support", label: "supported by" },
      { from: "support", to: "recall", label: "check" },
    ],
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

function illustrativeBody(
  request: ComposeLensRequest,
  sentences: string[],
  phrases: string[],
  diagram: StudyDiagram
): { markdown: string; keyPoints: string[] } {
  const claim = clipClaim(sentences[0] ?? request.selectedText);
  return {
    markdown: [
      `### Visual map of this passage`,
      `Follow the flowchart: the core idea leads to the claim, then the support, then a recall check.`,
      `- **Core idea:** ${excerptForDisplay(phrases[0] ?? "the selected idea", 80)}`,
      `- **Claim:** ${excerptForDisplay(claim, 160)}`,
      `- **Next node:** ${excerptForDisplay(sentences[1] ?? "Restate the claim without looking back.", 160)}`,
      "",
      "```mermaid",
      `flowchart LR`,
      `  A[${diagram.nodes[0]?.label ?? "Idea"}] --> B[${diagram.nodes[1]?.label ?? "Claim"}]`,
      `  B --> C[${diagram.nodes[2]?.label ?? "Support"}]`,
      `  C --> D[${diagram.nodes[3]?.label ?? "Recall"}]`,
      "```",
    ].join("\n"),
    keyPoints: diagram.nodes.map((node) => node.label),
  };
}

function revisionBody(
  request: ComposeLensRequest,
  sentences: string[],
  phrases: string[]
): { markdown: string; keyPoints: string[] } {
  const claim = clipClaim(sentences[0] ?? request.selectedText);
  const support = clipClaim(sentences[1] ?? "Restate the claim in one line.");
  const detail = clipClaim(sentences[2] ?? phrases[1] ?? "Name one supporting word from the page.");
  const mnemonic = uniqueKeep(
    phrases
      .map((phrase) => phrase.charAt(0).toUpperCase())
      .filter(Boolean)
  )
    .slice(0, 5)
    .join("-");
  return {
    markdown: [
      `### Revision sheet`,
      `| Focus | What to remember |`,
      `| :--- | :--- |`,
      `| Main claim | ${excerptForDisplay(claim, 120)} |`,
      `| Support | ${excerptForDisplay(support, 120)} |`,
      `| Extra detail | ${excerptForDisplay(detail, 120)} |`,
      `| Self-check | Cover the page and say the claim, then the support. |`,
      ``,
      `- **Memory aid:** ${mnemonic || "CLAIM"} = ${phrases.slice(0, 4).join(" → ") || "claim → support → check"}`,
      `- **Do not memorize:** page chrome, decorative headings, or anything not in the selected lines.`,
    ].join("\n"),
    keyPoints: [claim, support, detail].map((item) => excerptForDisplay(item, 100)),
  };
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

function explainBody(
  request: ComposeLensRequest,
  sentences: string[]
): { markdown: string; keyPoints: string[] } {
  const claim = clipClaim(sentences[0] ?? request.selectedText);
  const support = sentences[1] ? clipClaim(sentences[1]) : null;
  const extra = sentences[2] ? clipClaim(sentences[2]) : null;
  const lines = [
    `### Explanation`,
    `This passage is making a concrete point: **${claim}**`,
    support
      ? `It then develops that point: ${support}`
      : `The rest of the selection stays on that same point rather than opening a new topic.`,
  ];
  if (extra) {
    lines.push(`A further detail in the same lines: ${extra}`);
  }
  lines.push(
    `If you can restate that claim in one sentence without looking back, you have the passage.`
  );
  return {
    markdown: lines.join("\n"),
    keyPoints: [claim, support, extra].filter((item): item is string => Boolean(item)),
  };
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
      const diagram = buildDiagram({
        title: "Passage flowchart",
        sentences,
        phrases,
      });
      const body = illustrativeBody(request, sentences, phrases, diagram);
      return {
        ...base,
        lens_type: "illustrative",
        title: "Illustrative View",
        markdown_body: body.markdown,
        key_points: body.keyPoints,
        diagram,
      };
    }
    case "high_yield_revision": {
      const body = revisionBody(request, sentences, phrases);
      return {
        ...base,
        lens_type: "high_yield_revision",
        title: "Revision View",
        markdown_body: body.markdown,
        key_points: body.keyPoints,
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
      };
    }
    case "explain":
    default: {
      const body = explainBody(request, sentences);
      return {
        ...base,
        lens_type: lens === "explain" ? "explain" : request.lensType,
        title: "Explain This Passage",
        markdown_body: body.markdown,
        key_points: body.keyPoints,
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
