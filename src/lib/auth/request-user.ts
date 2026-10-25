import { ANONYMOUS_READER_SCOPE } from "@/lib/reader/local-scope";

/**
 * Server identity for student-owned reads and writes.
 * A signed-in session always wins. Callers cannot pick another student's id.
 */
export function resolveAuthorizedUserId(
  sessionUserId?: string | null,
  _requestedUserId?: string | null
): string {
  const session = (sessionUserId ?? "").trim();
  if (session) return session;
  return ANONYMOUS_READER_SCOPE;
}
