export interface SignedInUser {
  userId: string;
  email: string | null;
  demo?: boolean;
}

export interface SessionReply {
  ok: boolean;
  body: { userId?: string; email?: string | null; demo?: boolean };
}

let inFlight: Promise<SessionReply> | null = null;
let recent: { reply: SessionReply; at: number } | null = null;
/** How long one answer is reused. Each request took ~3 s, and a page asked again a few seconds later. */
export const SESSION_REUSE_MS = 15_000;

/** Forget the last answer. Called on sign-in and sign-out, which change who is signed in. */
export function clearSessionReply(): void {
  recent = null;
  inFlight = null;
}

/**
 * One "who is signed in?" request shared by every part of the page that asks at the same time.
 * A page used to send about 12 at once on load; each took ~3.5 s and they queued, so the study
 * plan took ~20 s to appear (manual test, 17 Nov 2026). The answer is reused for a few seconds,
 * and forgotten on sign-in and sign-out.
 */
export function fetchSessionReply(): Promise<SessionReply> {
  if (recent && Date.now() - recent.at < SESSION_REUSE_MS) return Promise.resolve(recent.reply);
  if (!inFlight) {
    const request = (async (): Promise<SessionReply> => {
      const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) return { ok: false, body: {} };
      const body = ((await response.json().catch(() => ({}))) ?? {}) as SessionReply["body"];
      return { ok: true, body };
    })()
      .then((reply) => {
        if (inFlight === request) recent = { reply, at: Date.now() };
        return reply;
      })
      .finally(() => {
        if (inFlight === request) inFlight = null;
      });
    inFlight = request;
  }
  return inFlight;
}

export async function fetchSignedInUser(): Promise<SignedInUser | null> {
  const reply = await fetchSessionReply();
  if (!reply.ok || !reply.body.userId) return null;
  return { userId: reply.body.userId, email: reply.body.email ?? null, demo: reply.body.demo === true };
}
