/** Local-only storage isolation. Does not apply live database RLS. */

export const ANONYMOUS_READER_SCOPE = "local-anonymous";

export function normalizeReaderScope(userId?: string | null): string {
  const trimmed = (userId ?? "").trim();
  return trimmed || ANONYMOUS_READER_SCOPE;
}

export function scopedReaderStorageKey(
  baseKey: string,
  userId?: string | null
): string {
  return `${baseKey}::${normalizeReaderScope(userId)}`;
}

export function isAnonymousScope(userId?: string | null): boolean {
  return normalizeReaderScope(userId) === ANONYMOUS_READER_SCOPE;
}

/** Older device-wide keys. Never copy these onto a signed-in student. */
export const UNCLAIMED_STUDENT_DATA_KEYS = [
  "oryzen_saved_passages_v1",
  "prakriti_study_ai_deep_linked_notebook_v1",
  "prakriti_study_ai_onboarding_profile_v1",
  "prakriti_study_ai_cognitive_dna_v1",
  "oryzen_reader_text_marks_v1",
  "oryzen_reader_margin_notes_v1",
] as const;
