/**
 * "How sure were you?" after each Test me answer (owner, 12 Nov 2026).
 * Being right by luck and being wrong while certain are both hidden by a plain score.
 * Pairing each answer with the student's own confidence shows which ideas are truly solid,
 * which need a second look, and which are misconceptions to fix first.
 * Runs on the device only: no AI call and nothing new stored on the server.
 */

export type Confidence = "guess" | "fairly" | "certain";

export const CONFIDENCE_CHOICES: readonly { id: Confidence; label: string }[] = [
  { id: "guess", label: "Guessed" },
  { id: "fairly", label: "Fairly sure" },
  { id: "certain", label: "Certain" },
];

/** solid: right and sure · lucky: right but guessed · trap: wrong but sure · gap: wrong and unsure. */
export type AnswerInsight = "solid" | "lucky" | "trap" | "gap";

export const INSIGHT_TEXT: Record<AnswerInsight, { title: string; advice: string }> = {
  trap: {
    title: "Fix first: you felt sure but it was wrong",
    advice: "A confident mistake usually repeats in the exam. Reread these lines and say the correct idea aloud once.",
  },
  gap: {
    title: "Still to learn",
    advice: "You knew you weren't sure. Read the explanation, then test yourself again tomorrow.",
  },
  lucky: {
    title: "Right, but by a guess",
    advice: "Worth one more look. A guess may not land next time.",
  },
  solid: {
    title: "Solid",
    advice: "Right and sure. A quick recap before the exam is enough.",
  },
};

/** Order to show results in: the most useful to fix first. */
export const INSIGHT_ORDER: readonly AnswerInsight[] = ["trap", "gap", "lucky", "solid"];

export function isConfidence(value: unknown): value is Confidence {
  return value === "guess" || value === "fairly" || value === "certain";
}

/** Without a confidence answer, correctness alone decides (right = solid, wrong = gap). */
export function insightFor(correct: boolean, confidence?: Confidence | null): AnswerInsight {
  const sure = confidence === "fairly" || confidence === "certain";
  const guessed = confidence === "guess";
  if (correct) return guessed ? "lucky" : "solid";
  return sure ? "trap" : "gap";
}

export interface InsightQuestion {
  question: string;
  correctIndex: number;
}

export type InsightGroups = Record<AnswerInsight, number[]>;

/** Question numbers (0-based) grouped by insight, for the answered questions only. */
export function groupInsights(
  mcqs: readonly InsightQuestion[],
  picks: Readonly<Record<number, number>>,
  confidence: Readonly<Record<number, Confidence>>
): InsightGroups {
  const groups: InsightGroups = { trap: [], gap: [], lucky: [], solid: [] };
  mcqs.forEach((mcq, index) => {
    const pick = picks[index];
    if (pick === undefined) return;
    groups[insightFor(pick === mcq.correctIndex, confidence[index])].push(index);
  });
  return groups;
}

/**
 * A suggested chapter level from one quiz: all solid → exam ready; any confident mistake → shaky.
 * The student always decides; this is only offered as a suggestion.
 */
export function suggestedLevelFromInsights(groups: InsightGroups): "shaky" | "getting_there" | "exam_ready" | null {
  const total = INSIGHT_ORDER.reduce((sum, key) => sum + groups[key].length, 0);
  if (total === 0) return null;
  if (groups.trap.length > 0) return "shaky";
  const solidShare = groups.solid.length / total;
  if (solidShare === 1) return "exam_ready";
  if (solidShare >= 0.5) return "getting_there";
  return "shaky";
}
