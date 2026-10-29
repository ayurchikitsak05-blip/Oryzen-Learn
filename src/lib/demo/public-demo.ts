/**
 * Public shareable demo — only for a dedicated demo deployment.
 * Never activates on Production (`oryzen-learn.vercel.app`) or the
 * protected Preview project unless ORYZEN_PUBLIC_DEMO is unset there
 * (it must stay unset on those projects).
 */

export const PUBLIC_DEMO_COOKIE = "oryzen_public_demo";
export const PUBLIC_DEMO_VISITOR_COOKIE = "oryzen_demo_visitor";
export const PUBLIC_DEMO_EMAIL = "demo.visitor@oryzen.local";
export const PUBLIC_DEMO_DISPLAY_NAME = "Demo Student";
/** Public salt for visitor-scoped browser vault keys. Not a server secret. */
export const PUBLIC_DEMO_VAULT_SALT = "oryzen-public-demo-vault-v1";

const BLOCKED_HOSTS = new Set([
  "oryzen-learn.vercel.app",
  "www.oryzen-learn.vercel.app",
]);

/** Hosts allowed when ORYZEN_PUBLIC_DEMO=1 (dedicated demo project + local). */
const ALLOWED_HOST_SUFFIXES = [
  "oryzen-learn-demo.vercel.app",
  "oryzen-learn-demo-ayurchikitsak05-8316s-projects.vercel.app",
] as const;

export function isBlockedProductionHost(hostname: string | null | undefined): boolean {
  const host = (hostname ?? "").split(":")[0]?.toLowerCase() ?? "";
  return BLOCKED_HOSTS.has(host);
}

export function isAllowedPublicDemoHost(hostname: string | null | undefined): boolean {
  const host = (hostname ?? "").split(":")[0]?.toLowerCase() ?? "";
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  if (BLOCKED_HOSTS.has(host)) return false;
  if (ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    return true;
  }
  // Dedicated demo project deployment URLs: oryzen-learn-demo-*.vercel.app
  return /^oryzen-learn-demo(?:-[a-z0-9]+)?(?:-ayurchikitsak05-8316s-projects)?\.vercel\.app$/.test(
    host
  );
}

/**
 * Server/runtime gate. Requires the demo flag and a host that is either
 * local or the dedicated demo project. Ordinary Preview and Production
 * hosts stay blocked even if the flag is set by mistake.
 */
export function isPublicDemoEnabled(input?: {
  hostname?: string | null;
  vercelEnv?: string | null;
  flag?: string | null;
}): boolean {
  const flag = (input?.flag ?? process.env.ORYZEN_PUBLIC_DEMO ?? "").trim();
  if (flag !== "1") return false;
  const hostname = (input?.hostname ?? "").split(":")[0]?.toLowerCase() ?? "";
  if (!hostname) return false;
  if (isBlockedProductionHost(hostname)) return false;
  return isAllowedPublicDemoHost(hostname);
}

export function isPublicDemoSession(input: {
  hostname: string | null | undefined;
  cookieValue?: string | null;
  visitorId?: string | null;
  vercelEnv?: string | null;
  flag?: string | null;
}): boolean {
  if (
    !isPublicDemoEnabled({
      hostname: input.hostname,
      vercelEnv: input.vercelEnv,
      flag: input.flag,
    })
  ) {
    return false;
  }
  if ((input.cookieValue ?? "").trim() !== "1") return false;
  const visitor = (input.visitorId ?? "").trim();
  return /^demo-visitor-[a-z0-9-]{8,64}$/i.test(visitor);
}

export function createDemoVisitorId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  return `demo-visitor-${rand}`;
}

export function normalizeDemoVisitorId(value: string | null | undefined): string | null {
  const visitor = (value ?? "").trim();
  return /^demo-visitor-[a-z0-9-]{8,64}$/i.test(visitor) ? visitor : null;
}
