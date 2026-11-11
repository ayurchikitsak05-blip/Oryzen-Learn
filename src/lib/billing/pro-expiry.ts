/** Pro has run out (no payment came through): back to Free. Safe for the middleware (no Node APIs). */
export function proHasExpired(row: { access_status?: unknown; pro_until?: unknown }, now: Date = new Date()): boolean {
  return (
    row.access_status === "active_paid" &&
    typeof row.pro_until === "string" &&
    Number.isFinite(Date.parse(row.pro_until)) &&
    Date.parse(row.pro_until) < now.getTime()
  );
}
