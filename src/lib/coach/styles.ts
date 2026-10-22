import type { CoachStyleId } from "@/lib/rhythm/types";
import { suggestionForCanonical } from "@/lib/rhythm/suggest";
import {
  COACH_VOICE_IDS,
  COACH_VOICE_META,
  type CoachVoiceId,
} from "./types";

const RHYTHM_TO_VOICE: Record<Exclude<CoachStyleId, "off">, CoachVoiceId> = {
  calm: "courage_calm",
  mastery: "challenge_mastery",
  momentum: "momentum_action",
  balanced: "balanced_support",
};

export function isCoachVoiceId(value: unknown): value is CoachVoiceId {
  return typeof value === "string" && (COACH_VOICE_IDS as readonly string[]).includes(value);
}

export function voiceFromRhythmStyle(style?: CoachStyleId | string | null): CoachVoiceId {
  if (style === "off" || !style) return "balanced_support";
  if (isCoachVoiceId(style)) return style;
  if (style === "calm" || style === "mastery" || style === "momentum" || style === "balanced") {
    return RHYTHM_TO_VOICE[style];
  }
  return "balanced_support";
}

export function rhythmStyleFromVoice(voice: CoachVoiceId): Exclude<CoachStyleId, "off"> {
  return COACH_VOICE_META[voice].rhythmStyle;
}

/** Prakriti may suggest a starting voice. It never locks the picker. */
export function suggestedVoice(canonicalType?: string | null): CoachVoiceId {
  return voiceFromRhythmStyle(suggestionForCanonical(canonicalType).coachStyle);
}

export function voiceIsIndependentOfSuggestion(
  selected: CoachVoiceId,
  canonicalType?: string | null
): boolean {
  return selected !== suggestedVoice(canonicalType) || selected === "balanced_support";
}
