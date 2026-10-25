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
