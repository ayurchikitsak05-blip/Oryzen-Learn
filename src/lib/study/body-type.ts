import {
  DOSHA_STUDY_PRESETS,
  type Dosha,
} from "@/lib/prakriti/config";
import { LOCAL_PRAKRITI_STORAGE_KEY } from "@/lib/supabase/profile-sync";
import type { StoredPrakritiProfilePayload } from "@/lib/supabase/types";

export interface SavedBodyType {
  displayProfileTitle: string;
  primaryDosha: Dosha;
  cognitiveSummary: string;
  studySprintMinutes: number;
  breakMinutes: number;
}

const DOSHAS: readonly Dosha[] = ["Vata", "Pitta", "Kapha"];

function isDosha(value: unknown): value is Dosha {
  return typeof value === "string" && DOSHAS.includes(value as Dosha);
}

export function readSavedBodyType(userId: string | null): SavedBodyType | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_PRAKRITI_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPrakritiProfilePayload & {
      userId?: string;
    };
    if (parsed.userId !== userId) return null;
    const calculated = parsed.calculated;
    if (!calculated || !isDosha(calculated.primaryDosha)) return null;
    const preset = DOSHA_STUDY_PRESETS[calculated.primaryDosha];
    return {
      displayProfileTitle:
        calculated.displayProfileTitle || preset.modernProfileLabel,
      primaryDosha: calculated.primaryDosha,
      cognitiveSummary: preset.cognitiveSummary,
      studySprintMinutes:
        calculated.activeConfiguration?.pomodoro?.studySprintMinutes ??
        preset.pomodoro.studySprintMinutes,
      breakMinutes:
        calculated.activeConfiguration?.pomodoro?.breakMinutes ??
        preset.pomodoro.breakMinutes,
    };
  } catch {
    return null;
  }
}

export function recommendationBullets(dosha: Dosha): string[] {
  const preset = DOSHA_STUDY_PRESETS[dosha];
  const pacing = `Study in about ${preset.pomodoro.studySprintMinutes}-minute stretches, then rest for ${preset.pomodoro.breakMinutes} minutes.`;
  if (dosha === "Vata") {
    return [
      pacing,
      "Read one or two short passages, then recall them before you continue.",
      "Lean on stories, mind-maps, and a short spoken summary.",
      "Use spaced flashcards so a quick first grasp stays with you.",
    ];
  }
  if (dosha === "Pitta") {
    return [
      pacing,
      "Follow the chapter outline and mark what you have already mastered.",
      "Prefer comparison tables, flowcharts, and exact page citations.",
      "Step back from glare before heat and fatigue build up.",
    ];
  }
  return [
    pacing,
    preset.pomodoro.microInteractionIntervalMinutes
      ? `Pause for a short check-in about every ${preset.pomodoro.microInteractionIntervalMinutes} minutes.`
      : "Pause for a short check-in before the material turns passive.",
    "Open one section at a time and answer a question before the next.",
    "Start from a worked example, then stand and reset if attention gets heavy.",
  ];
}

export function wellnessSuggestions(dosha: Dosha | null): string[] {
  if (dosha === "Vata") {
    return [
      "Sip warm water.",
      "Soften your gaze and rest your eyes away from the screen.",
      "Breathe slowly, with a long easy exhale.",
      "Drop your shoulders and sit tall.",
    ];
  }
  if (dosha === "Pitta") {
    return [
      "Sip cool or room-temperature water.",
      "Palm your eyes, then look toward something far away.",
      "Take a cooling breath in through the mouth and out through the nose.",
      "Loosen your jaw and lengthen your spine.",
    ];
  }
  if (dosha === "Kapha") {
    return [
      "Sip warm water.",
      "Stand, twist gently, and walk for a minute.",
      "Take a few brisk breaths to wake your attention.",
      "Open your chest and reset your posture.",
    ];
  }
  return [
    "Sip some water.",
    "Palm your eyes and let them relax.",
    "Take three slow breaths.",
    "Adjust your posture and uncurl your shoulders.",
  ];
}
