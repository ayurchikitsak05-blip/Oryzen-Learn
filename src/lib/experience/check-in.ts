export const READINESS_FEELINGS = [
  { id: "focused", label: "Focused", suggestion: "A deeper reading block fits this session." },
  { id: "energetic", label: "Energetic", suggestion: "A timed Study Sprint can use this energy." },
  { id: "tired", label: "Tired", suggestion: "A short revision pass is enough for now." },
  { id: "stressed", label: "Stressed", suggestion: "Start with one page and a quiet sound." },
] as const;

export type ReadinessFeeling = (typeof READINESS_FEELINGS)[number]["id"];

export const READINESS_NOTE =
  "This is a study suggestion from how you feel right now. It is not a health, psychological, or diagnostic measure.";

export function readinessSuggestion(feeling: ReadinessFeeling | null): string | null {
  if (!feeling) return null;
  return READINESS_FEELINGS.find((item) => item.id === feeling)?.suggestion ?? null;
}
