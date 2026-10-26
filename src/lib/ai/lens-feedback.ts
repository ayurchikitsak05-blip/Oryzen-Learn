import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";
import type { HighlightLensType } from "@/lib/prakriti/config";
import type { CognitiveTelemetryEventType } from "@/lib/ai/adaptive-memory";

export const LENS_FEEDBACK_STORAGE_KEY = "oryzen_lens_feedback_v1";

export type LensFeedbackKind =
  | "helpful"
  | "too_difficult"
  | "explain_more_simply"
  | "show_visually"
  | "another_example";

export interface LensFeedbackEntry {
  lens: HighlightLensType;
  kind: LensFeedbackKind;
  createdAt: string;
}

export const LENS_FEEDBACK_ACTIONS: readonly {
  id: LensFeedbackKind;
  label: string;
}[] = [
  { id: "helpful", label: "Helpful" },
  { id: "too_difficult", label: "Too difficult" },
  { id: "explain_more_simply", label: "Explain more simply" },
  { id: "show_visually", label: "Show visually" },
  { id: "another_example", label: "Give another example" },
];

export function mapFeedbackToMemoryEvent(
  kind: LensFeedbackKind
): CognitiveTelemetryEventType | null {
  if (kind === "too_difficult" || kind === "explain_more_simply") {
    return "subtract_detail";
  }
  if (kind === "show_visually" || kind === "another_example") {
    return "illustrative_example";
  }
  return null;
}

export function readLensFeedback(): LensFeedbackEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = readPrivateString(LENS_FEEDBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LensFeedbackEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordLensFeedback(
  lens: HighlightLensType,
  kind: LensFeedbackKind
): LensFeedbackEntry {
  const entry: LensFeedbackEntry = {
    lens,
    kind,
    createdAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      const next = [...readLensFeedback(), entry].slice(-40);
      writePrivateString(LENS_FEEDBACK_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode still lets the in-session UI acknowledge the tap.
    }
  }
  return entry;
}
