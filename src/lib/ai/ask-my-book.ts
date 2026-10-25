import type { CitationReadyChunk } from "@/lib/reader/extractor";

export interface AskBookHistoryTurn {
  question: string;
  answer: string;
}

export interface AskBookThreadTurn extends AskBookHistoryTurn {
  sufficientSource: boolean;
  citations: Array<{
    label: string;
    page_number: number;
    section_heading: string;
  }>;
}

const ASK_STOP =
  /^(what|does|this|that|from|with|about|claim|selected|passage|which|when|where|your|have|been|into|than)$/;

export function isBlankAskQuestion(value: string): boolean {
  return value.replace(/\s+/g, " ").trim().length < 3;
}

export function askContentTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !ASK_STOP.test(word));
}

export function isFollowUpAsk(
  question: string,
  history: readonly AskBookHistoryTurn[] = []
): boolean {
  if (history.length === 0) return false;
  const compact = question.replace(/\s+/g, " ").trim().toLowerCase();
  if (
    /^(why|how|and\b|what about|explain that|why is that|say more|continue)\b/.test(
      compact
    )
  ) {
    return true;
  }
  return askContentTerms(question).length < 2;
}

export function isAskRefusal(answer: string): boolean {
  return /not give enough evidence|insufficient source|does not contain enough evidence|cannot answer that from/i.test(
    answer
  );
}

export function asksForWorkedAnswer(question: string): boolean {
  return /\b(how|solve|solution|steps?|why|explain|derive|show|work|result|formula|answer|find)\b/i.test(
    question
  );
}

export function formulaSpans(text: string): string[] {
  const spans = new Set<string>();
  const pattern = /[A-Za-z][A-Za-z0-9]*(?:\s*[+\-/=≠×÷]\s*-?[A-Za-z0-9()]+)+/g;
  for (const match of text.matchAll(pattern)) {
    const cleaned = match[0].replace(/\s+/g, " ").trim().toLowerCase();
    if (cleaned.length >= 3 && /[+\-/=≠×÷]/.test(cleaned)) spans.add(cleaned);
  }
  return [...spans];
}

const TEACHING_TERMS =
  /^(isolate|subtract|subtracting|divide|dividing|undo|result|resulting|formula|steps|both|sides|cannot|equal|using|inverse|because|unless|then|next|first|after|with|from|into|also|only|just|give|gives|given|keep|make|take|left|right|move|moving)$/;

function isTeachingLanguage(term: string): boolean {
  if (TEACHING_TERMS.test(term)) return true;
  return [
    "isolat",
    "subtract",
    "divid",
    "result",
    "explain",
    "rearrang",
    "cancel",
  ].some((stem) => term.startsWith(stem));
}

export function inventsOffSourceClaim(
  answer: string,
  sourceText: string,
  question: string
): boolean {
  if (isAskRefusal(answer)) return false;
  const source = sourceText.toLowerCase();
  const asked = question.toLowerCase();
  const extra = askContentTerms(answer).filter(
    (term) =>
      !source.includes(term) && !asked.includes(term) && !isTeachingLanguage(term)
  );
  return extra.length >= 3;
}

export function isSourceGroundedAskAnswer(answer: string, sourceText: string): boolean {
  const low = answer.toLowerCase();
  const sourceTerms = askContentTerms(sourceText);
  if (sourceTerms.some((term) => low.includes(term))) return true;
  return formulaSpans(sourceText).some((span) => span.length > 3 && low.includes(span));
}

export function askAnswerScore(
  question: string,
  answer: string,
  sourceText: string
): number {
  const qTerms = askContentTerms(question);
  const overlap = qTerms.filter((term) => answer.toLowerCase().includes(term)).length;
  const forms = formulaSpans(sourceText).filter(
    (span) => span.length > 3 && answer.toLowerCase().includes(span)
  ).length;
  const parts = answer.split(/[.!?\n]/).filter((part) => part.trim().length > 18).length;
  let score = overlap * 3 + forms * 4;
  if (asksForWorkedAnswer(question)) {
    if (/(subtract|divid|isolate|rearrang|both sides|undo|derive)/i.test(answer)) score += 5;
    if (/=/.test(answer)) score += 2;
    if (parts >= 2) score += 1;
  } else {
    score += Math.min(parts, 4);
  }
  return score;
}

export function selectAskSupportingText(question: string, selectedText: string): string {
  const sentences = selectedText
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8);
  if (sentences.length === 0) return selectedText.replace(/\s+/g, " ").trim();
  const terms = askContentTerms(question);
  const qForms = formulaSpans(question);
  const rows = sentences.map((sentence, index) => {
    const low = sentence.toLowerCase();
    const termHits = terms.filter((term) => low.includes(term)).length;
    const formHits = qForms.filter((form) => low.includes(form)).length;
    return {
      sentence,
      index,
      sForms: formulaSpans(sentence),
      score: termHits * 2 + formHits,
    };
  });
  const keep = new Set<number>();
  for (const row of rows) {
    if (row.score > 0) keep.add(row.index);
  }
  if (asksForWorkedAnswer(question)) {
    const keptForms = new Set([
      ...qForms,
      ...[...keep].flatMap((index) => rows[index]?.sForms ?? []),
    ]);
    const keptTerms = [...keep].flatMap((index) => askContentTerms(rows[index]?.sentence ?? ""));
    const askedLetters = new Set(
      [...question.matchAll(/\b[a-zA-Z]\b/g)].map((match) => match[0].toLowerCase())
    );
    for (const row of rows) {
      if (row.sForms.some((form) => keptForms.has(form))) keep.add(row.index);
      const shared = askContentTerms(row.sentence).filter((term) => keptTerms.includes(term)).length;
      if (shared >= 2) keep.add(row.index);
      if (
        row.sForms.some((form) =>
          [...askedLetters].some((letter) => new RegExp(`^${letter}\\s*=`).test(form))
        )
      ) {
        keep.add(row.index);
      }
    }
    if (keep.size === 0) {
      for (const row of rows) {
        if (row.sForms.length === 0) continue;
        const mentionsAsked =
          askedLetters.size === 0 ||
          row.sForms.some((form) =>
            [...askedLetters].some((letter) =>
              new RegExp(`(?:^|[^a-z])${letter}(?:$|[^a-z])`).test(form)
            )
          );
        if (mentionsAsked) keep.add(row.index);
      }
    }
    if (keep.size === 0) {
      for (const row of rows) {
        if (row.sForms.length > 0) keep.add(row.index);
      }
    }
  }
  if (keep.size === 0) return sentences[0] ?? selectedText.trim();
  return [...keep]
    .sort((left, right) => left - right)
    .map((index) => rows[index].sentence)
    .join(" ");
}

function extractMarkdownAskAnswer(markdown?: string): string | null {
  if (!markdown?.trim()) return null;
  const answerBlock = markdown.split(/###\s*Answer\b/i)[1];
  if (answerBlock) {
    const cleaned = answerBlock.replace(/###[\s\S]*$/, "").trim();
    return cleaned || null;
  }
  if (/###\s*Question\b/i.test(markdown)) return null;
  return markdown.trim();
}

export function preferAskMyBookAnswer(params: {
  question: string;
  sourceText: string;
  model?: { question: string; answer: string; sufficientSource: boolean } | null;
  fallback?: { question: string; answer: string; sufficientSource: boolean } | null;
  markdownBody?: string;
  history?: readonly AskBookHistoryTurn[];
  allowSourceExtract?: boolean;
}): { question: string; answer: string; sufficientSource: boolean } {
  const question =
    params.question.replace(/\s+/g, " ").trim() ||
    params.model?.question ||
    params.fallback?.question ||
    "What does the selected passage claim?";
  const grounding = resolveAskGrounding({
    question,
    selectedText: params.sourceText,
    history: params.history,
  });
  const supporting = selectAskSupportingText(question, params.sourceText);
  const refusal = `The selected lines do not give enough evidence to answer that. They discuss: ${params.sourceText.replace(/\s+/g, " ").trim().slice(0, 160)} Highlight a passage that names the idea you asked about.`;

  if (!grounding.sufficient) {
    if (
      params.model &&
      params.model.sufficientSource === false &&
      isAskRefusal(params.model.answer) &&
      !inventsOffSourceClaim(params.model.answer, params.sourceText, question)
    ) {
      return { question, answer: params.model.answer.trim(), sufficientSource: false };
    }
    if (params.fallback && params.fallback.sufficientSource === false) {
      return { question, answer: params.fallback.answer, sufficientSource: false };
    }
    return { question, answer: refusal, sufficientSource: false };
  }

  const candidates: string[] = [];
  const consider = (answer?: string | null) => {
    if (!answer?.trim()) return;
    if (isAskRefusal(answer)) return;
    if (inventsOffSourceClaim(answer, params.sourceText, question)) return;
    if (!isSourceGroundedAskAnswer(answer, params.sourceText)) return;
    candidates.push(answer.trim());
  };
  if (params.model?.sufficientSource !== false) consider(params.model?.answer);
  consider(extractMarkdownAskAnswer(params.markdownBody));
  if (params.fallback?.sufficientSource !== false) consider(params.fallback?.answer);
  if (params.allowSourceExtract !== false) consider(supporting);

  if (candidates.length === 0) {
    if (params.allowSourceExtract === false) {
      return { question, answer: "", sufficientSource: false };
    }
    return { question, answer: supporting || refusal, sufficientSource: Boolean(supporting) };
  }
  const best = [...candidates].sort((left, right) => {
    const scoreDelta =
      askAnswerScore(question, right, params.sourceText) -
      askAnswerScore(question, left, params.sourceText);
    if (scoreDelta !== 0) return scoreDelta;
    return right.length - left.length;
  })[0];
  return { question, answer: best, sufficientSource: true };
}

export function resolveAskGrounding(params: {
  question: string;
  selectedText: string;
  history?: readonly AskBookHistoryTurn[];
}): { sufficient: boolean; terms: string[]; followUp: boolean } {
  const history = params.history ?? [];
  const followUp = isFollowUpAsk(params.question, history);
  const prior = history[history.length - 1];
  const terms = followUp
    ? [
        ...askContentTerms(prior?.question ?? ""),
        ...askContentTerms(params.question),
      ]
    : askContentTerms(params.question);
  if (followUp) {
    const priorFailed = Boolean(
      prior && /not give enough evidence|insufficient source/i.test(prior.answer)
    );
    return { sufficient: !priorFailed, terms, followUp };
  }
  const hay = params.selectedText.toLowerCase();
  const overlap = terms.filter((term) => hay.includes(term)).length;
  if (terms.length >= 2 && overlap === 0) {
    return { sufficient: false, terms, followUp };
  }
  return { sufficient: true, terms, followUp };
}

export function isolateChunksForDocument(
  chunks: readonly CitationReadyChunk[],
  documentId: string
): CitationReadyChunk[] {
  return chunks.filter((chunk) => chunk.document_id === documentId);
}

export function askMyBookCacheSeed(params: {
  selectedText: string;
  studentQuestion?: string;
  conversationHistory?: readonly AskBookHistoryTurn[];
}): string {
  const history = (params.conversationHistory ?? [])
    .map((turn) => turn.question.trim())
    .filter(Boolean)
    .join("\n");
  return `${params.selectedText}\nQ:${params.studentQuestion ?? ""}\nH:${history}`;
}

export function buildAskMyBookLensBody(params: {
  documentId: string;
  documentHash: string;
  pageNumber: number;
  sectionHeading: string;
  selectedText: string;
  selectionBoundingBox?: CitationReadyChunk["bounding_box"];
  studentQuestion: string;
  conversationHistory?: readonly AskBookHistoryTurn[];
  prakritiDosha?: string;
  activePageText?: string;
  candidateChunks: readonly CitationReadyChunk[];
}) {
  return {
    documentId: params.documentId,
    documentHash: params.documentHash,
    pageNumber: params.pageNumber,
    sectionHeading: params.sectionHeading,
    selectedText: params.selectedText,
    selectionBoundingBox: params.selectionBoundingBox,
    lensType: "ask_my_book" as const,
    studentQuestion: params.studentQuestion.trim(),
    conversationHistory: (params.conversationHistory ?? []).map((turn) => ({
      question: turn.question,
      answer: turn.answer,
    })),
    prakritiDosha: params.prakritiDosha,
    activePageText: params.activePageText,
    candidateChunks: isolateChunksForDocument(
      params.candidateChunks,
      params.documentId
    ),
  };
}
