/**
 * Layer 4: Self-Evolving Adaptive Cognitive Memory Engine (`student_cognitive_memory`)
 *
 * Tracks student note modifications (+ Add Detail, - Subtract Detail, Illustrative Example,
 * Constitution Lens, Convert to Table/Flowchart) and video rewind friction, condensing them
 * into a rolling <= 200-word "Student Cognitive DNA Card" stored in `student_cognitive_memory`
 * and injected into future AI prompts for proactive nudging.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dosha } from "@/lib/prakriti/config";
import type { CognitiveDnaCardJson } from "@/lib/supabase/types";

export type NoteModificationAction =
  | "add_detail"
  | "subtract_detail"
  | "illustrative_example"
  | "ayurvedic_lens"
  | "convert_table_flowchart";

export type CognitiveTelemetryEventType =
  | NoteModificationAction
  | "video_rewind_friction";

export const MAX_COGNITIVE_DNA_WORDS = 200;
export const LOCAL_COGNITIVE_DNA_STORAGE_KEY =
  "prakriti_study_ai_cognitive_dna_v1";

export interface ExtendedCognitiveSignals {
  detail_additions: number;
  simplifications: number;
  illustrative_requests: number;
  video_rewind_count: number;
  ayurvedic_lens_requests: number;
  table_flowchart_conversions: number;
  last_friction_timestamp_label?: string;
}

export interface AdaptiveCognitiveDnaState extends CognitiveDnaCardJson {
  signals: ExtendedCognitiveSignals;
  proactive_nudge: string;
}

export interface TelemetryEventInput {
  userId: string;
  eventType: CognitiveTelemetryEventType;
  prakritiDosha?: Dosha;
  classification?: string;
  contextLabel?: string; // e.g. "[04:18] Free-body diagrams" or "[Page 2, Section Screen Endurance]"
   supabase?: SupabaseClient | null;
}

let inMemoryDnaState = new Map<string, AdaptiveCognitiveDnaState>();

export function clearLocalAdaptiveMemory(): void {
  inMemoryDnaState = new Map();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LOCAL_COGNITIVE_DNA_STORAGE_KEY);
    } catch {
      // Ignored
    }
  }
}

export function createDefaultCognitiveDnaState(
  prakritiDosha: Dosha = "Vata",
  classification: string = prakritiDosha
): AdaptiveCognitiveDnaState {
  const initialSignals: ExtendedCognitiveSignals = {
    detail_additions: 0,
    simplifications: 0,
    illustrative_requests: 0,
    video_rewind_count: 0,
    ayurvedic_lens_requests: 0,
    table_flowchart_conversions: 0,
  };

  return buildRollingCognitiveDnaCard({
    prakritiDosha,
    classification,
    signals: initialSignals,
  });
}

/**
 * Generates the rolling <= 200-word Student Cognitive DNA Card from cumulative
 * behavioral telemetry signals and Prakriti baseline.
 */
export function buildRollingCognitiveDnaCard(params: {
  prakritiDosha: Dosha;
  classification?: string;
  signals: ExtendedCognitiveSignals;
}): AdaptiveCognitiveDnaState {
  const {
    prakritiDosha,
    classification = prakritiDosha,
    signals,
  } = params;

  // Determine dominant behavioral preference from observed telemetry
  let preferredLens = "illustrative";
  let proactiveNudge =
    "Maintain balanced Prakriti study sprints with active recall checkpoints.";

  if (
    signals.table_flowchart_conversions > signals.illustrative_requests &&
    signals.table_flowchart_conversions >= signals.ayurvedic_lens_requests
  ) {
    preferredLens = "high_yield_revision";
    proactiveNudge =
      "Student frequently converts prose into structured tables and flowcharts; proactively format complex ideas into comparison matrices.";
  } else if (
    signals.ayurvedic_lens_requests > signals.illustrative_requests
  ) {
    preferredLens = "ayurvedic";
    proactiveNudge =
      "Student asks for constitution mapping; proactively relate ideas to Vata, Pitta, and Kapha energy and to Dhee, Dhriti, and Smriti.";
  } else if (signals.illustrative_requests > 0) {
    preferredLens = "illustrative";
    proactiveNudge =
      "Student learns fastest through visual analogies and mind-maps (Dhee); proactively lead explanations with a real-world analogy.";
  } else if (prakritiDosha === "Pitta") {
    preferredLens = "high_yield_revision";
  } else if (prakritiDosha === "Kapha") {
    preferredLens = "test_me";
  }

  if (signals.video_rewind_count >= 2) {
    proactiveNudge += ` Detected ${signals.video_rewind_count} video lecture rewinds${
      signals.last_friction_timestamp_label
        ? ` near ${signals.last_friction_timestamp_label}`
        : ""
    }; slow down conceptual pacing and insert a bite-sized recap card.`;
  }

  const densityPreference =
    signals.detail_additions > signals.simplifications
      ? `prefers deeper elaboration (+${signals.detail_additions} detail expansions vs ${signals.simplifications} simplifications)`
      : signals.simplifications > signals.detail_additions
        ? `prefers concise high-clarity distillation (${signals.simplifications} simplifications vs +${signals.detail_additions} expansions)`
        : "maintains balanced explanation depth";

  const rawSentences = [
    `Student Cognitive DNA Card (${classification}, Primary Dosha: ${prakritiDosha}):`,
    `Observed reading and lecture telemetry indicates the student ${densityPreference}.`,
    `Cumulative interaction signals: +Detail(${signals.detail_additions}), -Simplify(${signals.simplifications}), Illustrative(${signals.illustrative_requests}), ConstitutionLens(${signals.ayurvedic_lens_requests}), Table/Flowchart(${signals.table_flowchart_conversions}), VideoRewinds(${signals.video_rewind_count}).`,
    `Dominant AI explanation lens: ${preferredLens}.`,
    `Proactive AI Nudge Directive: ${proactiveNudge}`,
  ];

  const joined = rawSentences.join(" ").replace(/\s+/g, " ").trim();
  const words = joined.split(" ").filter(Boolean);
  const boundedWords =
    words.length <= MAX_COGNITIVE_DNA_WORDS
      ? words
      : words.slice(0, MAX_COGNITIVE_DNA_WORDS);
  const summaryText = boundedWords.join(" ");

  return {
    summary_text: summaryText,
    word_count: boundedWords.length,
    primary_dosha: prakritiDosha,
    classification,
    preferred_lens: preferredLens,
    signals: { ...signals },
    proactive_nudge: proactiveNudge,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Applies a 1-tap Student Note Modification to an existing note markdown string
 * while preserving its timestamp or page citation badge.
 */
export function applyOneTapNoteModification(params: {
  originalText: string;
  action: NoteModificationAction;
  citationBadge: string; // e.g. "[04:18]" or "[Page 2, Section Alochaka Pitta]"
  prakritiDosha?: Dosha;
}): string {
  const {
    originalText,
    action,
    citationBadge,
    prakritiDosha = "Vata",
  } = params;
  const cleanOriginal = originalText.trim();

  switch (action) {
    case "add_detail":
      return `${cleanOriginal}\n\n➕ **Explain Further:** Adds the definition, the mechanism, a worked example, a common exception, and why it matters, anchored at ${citationBadge}.`;

    case "subtract_detail": {
      const firstSentence =
        cleanOriginal.split(/(?<=[.!?])\s+/)[0] ?? cleanOriginal;
      return `➖ **Make It Easier ${citationBadge}:** ${firstSentence.slice(
        0,
        180
      )}`;
    }

    case "illustrative_example":
      return `${cleanOriginal}\n\n🎨 **Show an Example (${citationBadge}):** Think of the idea as a three-channel system: flow, heat, and structure stay in sync so the concept is easy to grasp, hold, and recall. In Ayurveda this is sometimes described as Vata, Pitta, and Kapha.`;

    case "ayurvedic_lens":
      return `${cleanOriginal}\n\n🌿 **Explore My Learning Approach (${citationBadge}):** Optional strategies you can try. In Ayurveda this is sometimes mapped to *Vata* (movement), *Pitta* (transformation), and *Kapha* (stability)—not a measure of ability.`;

    case "convert_table_flowchart":
      return [
        cleanOriginal,
        ``,
        `📊 **Turn Into a Table (${citationBadge}):**`,
        "```",
        `[Core Idea] ──► [Mechanism] ──► [Worked Example] ──► [Recall Check]`,
        "```",
        `| Stage | Why It Matters | Source Anchor |`,
        `| :--- | :--- | :--- |`,
        `| Primary Mechanism | ${cleanOriginal.slice(0, 60)}... | ${citationBadge} |`,
      ].join("\n");
  }
}

/**
 * Retrieves the student's current Adaptive Cognitive DNA Card from local storage / memory.
 */
export function getLocalCognitiveDnaState(
  userId: string = "local-student-scholar",
  defaultDosha: Dosha = "Vata"
): AdaptiveCognitiveDnaState {
  const cached = inMemoryDnaState.get(userId);
  if (cached) return cached;

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(LOCAL_COGNITIVE_DNA_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AdaptiveCognitiveDnaState;
        if (parsed && parsed.summary_text) {
          inMemoryDnaState.set(userId, parsed);
          return parsed;
        }
      }
    } catch {
      // Ignore corrupt localStorage
    }
  }

  const initial = createDefaultCognitiveDnaState(defaultDosha);
  inMemoryDnaState.set(userId, initial);
  return initial;
}

/**
 * Records a student note modification or video rewind friction event,
 * updates the rolling <= 200-word Student Cognitive DNA Card, and persists it
 * to local storage and the Supabase `student_cognitive_memory` table.
 */
export async function recordCognitiveTelemetryEvent(
  input: TelemetryEventInput
): Promise<AdaptiveCognitiveDnaState> {
  const current = getLocalCognitiveDnaState(
    input.userId,
    input.prakritiDosha ?? "Vata"
  );

  const nextSignals: ExtendedCognitiveSignals = {
    ...current.signals,
  };

  switch (input.eventType) {
    case "add_detail":
      nextSignals.detail_additions += 1;
      break;
    case "subtract_detail":
      nextSignals.simplifications += 1;
      break;
    case "illustrative_example":
      nextSignals.illustrative_requests += 1;
      break;
    case "ayurvedic_lens":
      nextSignals.ayurvedic_lens_requests += 1;
      break;
    case "convert_table_flowchart":
      nextSignals.table_flowchart_conversions += 1;
      break;
    case "video_rewind_friction":
      nextSignals.video_rewind_count += 1;
      if (input.contextLabel) {
        nextSignals.last_friction_timestamp_label = input.contextLabel;
      }
      break;
  }

  const updatedCard = buildRollingCognitiveDnaCard({
    prakritiDosha:
      input.prakritiDosha ?? (current.primary_dosha as Dosha) ?? "Vata",
    classification: input.classification ?? current.classification,
    signals: nextSignals,
  });

  inMemoryDnaState.set(input.userId, updatedCard);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        LOCAL_COGNITIVE_DNA_STORAGE_KEY,
        JSON.stringify(updatedCard)
      );
    } catch {
      // Ignored
    }
  }

  if (input.supabase) {
    try {
      await input.supabase.from("student_cognitive_memory").upsert(
        {
          user_id: input.userId,
          cognitive_dna_summary: updatedCard,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch {
      // Local state already updated
    }
  }

  return updatedCard;
}
