export const OWNER_DEMO_EMAIL = "oryzen.owner.demo@example.com";
export const OWNER_DEMO_FULL_NAME = "ORYZEN Owner Demo (throwaway)";
export const OWNER_DEMO_COOKIE = "oryzen_owner_demo";

export function isOwnerDemoEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === OWNER_DEMO_EMAIL;
}

export function isLocalDemoHost(hostname: string | null | undefined): boolean {
  const host = (hostname ?? "").split(":")[0]?.toLowerCase() ?? "";
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/**
 * Local-only labeled demo fallback. Never true on a Production host
 * or when Vercel reports a production environment.
 */
export function allowsLocalOwnerDemoBypass(input: {
  hostname: string | null | undefined;
  vercelEnv?: string | null;
  cookieValue?: string | null;
}): boolean {
  if ((input.vercelEnv ?? "").trim().toLowerCase() === "production") {
    return false;
  }
  if (!isLocalDemoHost(input.hostname)) return false;
  return (input.cookieValue ?? "").trim() === "1";
}
