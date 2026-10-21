export const ENTITLED_ACCESS_STATUSES = [
  "free",
  "active_paid",
  "class_sponsored",
  "trial",
] as const;

export type EntitledAccessStatus = (typeof ENTITLED_ACCESS_STATUSES)[number];

export type AccessStatus = EntitledAccessStatus | "none" | "revoked";

export type ProfileRole = "student" | "instructor" | "admin";

export const DIRECT_ACCESS_PRICE_INR = 199;

const PAGE_EXEMPT_PREFIXES = ["/auth", "/access", "/pricing", "/checkout"];

export function isEntitled(accessStatus: string | null | undefined): boolean {
  return ENTITLED_ACCESS_STATUSES.includes(
    accessStatus as EntitledAccessStatus
  );
}

export function canManageClasses(role: string | null | undefined): boolean {
  return role === "instructor" || role === "admin";
}

export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/auth")) return null;
  return value;
}

export function destinationAfterAuth(input: {
  accessStatus: string | null | undefined;
  role: string | null | undefined;
  /** Kept for callers; assessment is optional and does not gate the hub. */
  hasBodyType?: boolean;
}): "/instructor" | "/hub" | "/pricing" | "/body-type" {
  if (canManageClasses(input.role)) return "/instructor";
  if (!isEntitled(input.accessStatus)) return "/pricing";
  return "/hub";
}

export function decideAccessRedirect(input: {
  pathname: string;
  isAuthenticated: boolean;
  accessStatus: string | null | undefined;
  role: string | null | undefined;
}): string | null {
  const { pathname } = input;
  if (pathname.startsWith("/api")) return null;

  if (!input.isAuthenticated) {
    if (
      pathname === "/auth" ||
      pathname.startsWith("/auth/") ||
      pathname === "/pricing" ||
      pathname.startsWith("/pricing/") ||
      pathname === "/checkout" ||
      pathname.startsWith("/checkout/")
    ) {
      return null;
    }
    return "/auth";
  }

  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    if (canManageClasses(input.role)) return "/instructor";
    if (isEntitled(input.accessStatus)) return "/hub";
    return "/pricing";
  }

  if (pathname === "/instructor" || pathname.startsWith("/instructor/")) {
    return canManageClasses(input.role)
      ? null
      : isEntitled(input.accessStatus)
        ? "/hub"
        : "/pricing";
  }

  if (
    canManageClasses(input.role) ||
    isEntitled(input.accessStatus) ||
    PAGE_EXEMPT_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    return null;
  }

  return "/pricing";
}

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(
  randomIndex: () => number = () => Math.floor(Math.random() * INVITE_ALPHABET.length)
): string {
  let body = "";
  for (let index = 0; index < 8; index += 1) {
    const pick = INVITE_ALPHABET[Math.abs(randomIndex()) % INVITE_ALPHABET.length];
    body += pick;
  }
  return `ORYZEN${body}`;
}

export function canonicalInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatInviteCode(canonical: string): string {
  if (!canonical.startsWith("ORYZEN") || canonical.length < 14) return canonical;
  const body = canonical.slice(6, 14);
  return `ORYZEN-${body.slice(0, 4)}-${body.slice(4, 8)}`;
}

export function evaluateInviteRedemption(input: {
  revoked: boolean;
  expiresAt: string | null;
  seatsUsed: number;
  seatLimit: number | null;
  nowMs: number;
}): { ok: true } | { ok: false; reason: string } {
  if (input.revoked) {
    return { ok: false, reason: "This class code has been turned off." };
  }
  if (input.expiresAt && Date.parse(input.expiresAt) <= input.nowMs) {
    return { ok: false, reason: "This class code has expired." };
  }
  if (input.seatLimit != null && input.seatsUsed >= input.seatLimit) {
    return { ok: false, reason: "This class code has no seats left." };
  }
  return { ok: true };
}
