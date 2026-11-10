/**
 * Age check and parental consent (DPDP Act 2023 s.9, DPDP Rules 2025 r.10).
 * A child is anyone under 18. Before ORYZEN uses a child's data, a parent who is an
 * identifiable adult must agree. Owner decision, 10 Nov 2026: build it now (the duty
 * applies from 14 May 2027).
 */

export const ADULT_AGE = 18;
export const CONSENT_NOTICE_VERSION = "2026-11-11";
export const CONSENT_LINK_DAYS = 7;
export const CONSENT_RELATIONSHIPS = ["mother", "father", "guardian"] as const;
export type ConsentRelationship = (typeof CONSENT_RELATIONSHIPS)[number];

/** Pages a student can open before the age check and parent consent are done. */
const CONSENT_FREE_PREFIXES = ["/auth", "/age-check", "/parent-consent", "/parent", "/privacy"];
/** APIs that must keep working during the check (sign-in, the check itself). */
const CONSENT_FREE_APIS = ["/api/auth", "/api/consent", "/api/health"];

function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`));
}

/** "2009-07" or "2009-07-01" → "2009-07-01"; anything else → null. */
export function parseBirthMonth(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})(?:-01)?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 1900) return null;
  return `${match[1]}-${match[2]}-01`;
}

/** Today's date in India, as YYYY-MM-DD. */
export function indiaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/**
 * Whole years of age. Only the month is known, so the student counts as turning 18 at the
 * start of the month after their birth month: never treated as an adult too early.
 */
export function ageInYears(birthMonth: string, today: string): number {
  const [by, bm] = birthMonth.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  let age = ty - by;
  if (tm <= bm) age -= 1;
  return age;
}

export function isMinor(birthMonth: string, today: string): boolean {
  return ageInYears(birthMonth, today) < ADULT_AGE;
}

/** A birth month in the future, or one making someone over 100, is a typing mistake. */
export function plausibleBirthMonth(birthMonth: string, today: string): boolean {
  if (birthMonth > today) return false;
  const age = ageInYears(birthMonth, today);
  return age >= 5 && age <= 100;
}

export interface ConsentState {
  /** undefined when the database doesn't have the columns yet (migration not applied). */
  birthMonth: string | null | undefined;
  parentConsentAt: string | null | undefined;
}

export type ConsentGate = "age_check" | "parent_consent" | null;

/** What a signed-in student still needs: their date of birth, or a parent's consent. */
export function consentGate(input: ConsentState & { role: string | null | undefined; today: string }): ConsentGate {
  if (input.birthMonth === undefined) return null;
  if (input.role === "instructor" || input.role === "admin") return null;
  if (!input.birthMonth) return "age_check";
  if (isMinor(input.birthMonth, input.today) && !input.parentConsentAt) return "parent_consent";
  return null;
}

/** Where the middleware sends a student who still needs the check, or null to let them through. */
export function consentRedirect(pathname: string, gate: ConsentGate): string | null {
  if (!gate || pathname.startsWith("/api")) return null;
  if (matches(pathname, CONSENT_FREE_PREFIXES)) return null;
  return gate === "age_check" ? "/age-check" : "/parent-consent";
}

export function consentBlocksApi(pathname: string, gate: ConsentGate): boolean {
  return Boolean(gate) && pathname.startsWith("/api") && !matches(pathname, CONSENT_FREE_APIS);
}

export function isRelationship(value: unknown): value is ConsentRelationship {
  return typeof value === "string" && (CONSENT_RELATIONSHIPS as readonly string[]).includes(value);
}

/** Link the student sends to a parent. */
export function consentLink(origin: string, token: string): string {
  return `${origin}/parent?c=${encodeURIComponent(token)}`;
}

/** Contact shown in the notice; set NEXT_PUBLIC_GRIEVANCE_EMAIL and NEXT_PUBLIC_COMPANY_NAME in Vercel. */
export function grievanceEmail(): string | null {
  const value = process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL?.trim();
  return value && value.includes("@") ? value : null;
}

export function companyName(): string {
  return process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || "ORYZEN";
}
