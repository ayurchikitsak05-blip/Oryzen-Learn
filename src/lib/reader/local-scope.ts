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
