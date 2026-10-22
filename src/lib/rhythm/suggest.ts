import type { CanonicalPrakritiKey } from "@/lib/prakriti/config";
import { LOCAL_PRAKRITI_STORAGE_KEY } from "@/lib/supabase/profile-sync";
import type { StoredPrakritiProfilePayload } from "@/lib/supabase/types";
import type { CoachStyleId, ThemeId } from "./types";

export interface RhythmSuggestion {
  themeId: ThemeId;
  coachStyle: CoachStyleId;
  label: string;
  hasProfile: boolean;
}

const SUGGESTION_MAP: Record<
  CanonicalPrakritiKey,
  { themeId: ThemeId; coachStyle: CoachStyleId }
> = {
  Vata: { themeId: "warm-grounded", coachStyle: "calm" },
  Pitta: { themeId: "cool-clear", coachStyle: "mastery" },
  Kapha: { themeId: "fresh-energizing", coachStyle: "momentum" },
  "Vata-Pitta": { themeId: "grounded-clarity", coachStyle: "balanced" },
  "Pitta-Kapha": { themeId: "clear-energy", coachStyle: "mastery" },
  "Vata-Kapha": { themeId: "warm-lift", coachStyle: "momentum" },
};

export function suggestionForCanonical(
  canonicalType?: CanonicalPrakritiKey | string | null
): RhythmSuggestion {
  const mapped =
    canonicalType && canonicalType in SUGGESTION_MAP
      ? SUGGESTION_MAP[canonicalType as CanonicalPrakritiKey]
      : null;
  if (!mapped) {
    return {
      themeId: "classic",
      coachStyle: "balanced",
      label: "Classic Soft Beige",
      hasProfile: false,
    };
  }
  return { ...mapped, label: canonicalType as string, hasProfile: true };
}

export function readCanonicalType(userId?: string | null): CanonicalPrakritiKey | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_PRAKRITI_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPrakritiProfilePayload & { userId?: string };
    if (userId && parsed.userId && parsed.userId !== userId) return null;
    const canonical = parsed.calculated?.canonicalType;
    if (canonical && canonical in SUGGESTION_MAP) return canonical;
    return null;
  } catch {
    return null;
  }
}

export function suggestRhythm(userId?: string | null): RhythmSuggestion {
  return suggestionForCanonical(readCanonicalType(userId));
}
