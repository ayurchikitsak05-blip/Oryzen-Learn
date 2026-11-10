import { describe, expect, it } from "vitest";
import {
  ageInYears,
  consentBlocksApi,
  consentGate,
  consentRedirect,
  indiaToday,
  isMinor,
  parseBirthMonth,
  plausibleBirthMonth,
} from "../age";
import { decideAccessRedirect } from "@/lib/access/gate";

describe("age", () => {
  it("reads month and year of birth", () => {
    expect(parseBirthMonth("2009-07")).toBe("2009-07-01");
    expect(parseBirthMonth("2009-07-01")).toBe("2009-07-01");
    expect(parseBirthMonth("2009-13")).toBeNull();
    expect(parseBirthMonth("2009-07-15")).toBeNull();
    expect(parseBirthMonth(42)).toBeNull();
  });

  it("only treats someone as 18 from the month after their 18th birthday month", () => {
    expect(ageInYears("2008-11-01", "2026-11-10")).toBe(17);
    expect(isMinor("2008-11-01", "2026-11-30")).toBe(true);
    expect(isMinor("2008-11-01", "2026-12-01")).toBe(false);
    expect(isMinor("2008-10-01", "2026-11-10")).toBe(false);
    expect(isMinor("2012-03-01", "2026-11-10")).toBe(true);
  });

  it("rejects dates in the future or impossible ages", () => {
    expect(plausibleBirthMonth("2030-01-01", "2026-11-10")).toBe(false);
    expect(plausibleBirthMonth("2024-01-01", "2026-11-10")).toBe(false);
    expect(plausibleBirthMonth("1900-01-01", "2026-11-10")).toBe(false);
    expect(plausibleBirthMonth("1985-06-01", "2026-11-10")).toBe(true);
  });

  it("uses India's date", () => {
    expect(indiaToday(new Date("2026-11-10T20:00:00Z"))).toBe("2026-11-11");
  });
});

describe("consent gate", () => {
  const today = "2026-11-10";
  it("asks for the date of birth, then a parent for under-18s, and lets adults through", () => {
    expect(consentGate({ role: "student", birthMonth: null, parentConsentAt: null, today })).toBe("age_check");
    expect(consentGate({ role: "student", birthMonth: "2010-05-01", parentConsentAt: null, today })).toBe("parent_consent");
    expect(consentGate({ role: "student", birthMonth: "2010-05-01", parentConsentAt: "2026-11-01T00:00:00Z", today })).toBeNull();
    expect(consentGate({ role: "student", birthMonth: "1999-05-01", parentConsentAt: null, today })).toBeNull();
    expect(consentGate({ role: "instructor", birthMonth: null, parentConsentAt: null, today })).toBeNull();
  });

  it("stays off until the database has the new columns", () => {
    expect(consentGate({ role: "student", birthMonth: undefined, parentConsentAt: undefined, today })).toBeNull();
  });

  it("sends students to the right page, leaving sign-in, consent and privacy pages open", () => {
    expect(consentRedirect("/hub", "age_check")).toBe("/age-check");
    expect(consentRedirect("/reader", "parent_consent")).toBe("/parent-consent");
    expect(consentRedirect("/parent-consent", "parent_consent")).toBeNull();
    expect(consentRedirect("/parent", "age_check")).toBeNull();
    expect(consentRedirect("/privacy", "age_check")).toBeNull();
    expect(consentRedirect("/auth", "age_check")).toBeNull();
    expect(consentRedirect("/hub", null)).toBeNull();
  });

  it("blocks study APIs but not sign-in or the consent API", () => {
    expect(consentBlocksApi("/api/ai/lens", "parent_consent")).toBe(true);
    expect(consentBlocksApi("/api/billing/checkout", "parent_consent")).toBe(true);
    expect(consentBlocksApi("/api/consent", "parent_consent")).toBe(false);
    expect(consentBlocksApi("/api/auth/otp", "age_check")).toBe(false);
    expect(consentBlocksApi("/api/ai/lens", null)).toBe(false);
  });

  it("doesn't send parents without a plan to the pricing page", () => {
    for (const pathname of ["/parent", "/age-check", "/parent-consent", "/privacy"]) {
      expect(decideAccessRedirect({ pathname, isAuthenticated: true, accessStatus: "none", role: "student" })).toBeNull();
    }
    expect(decideAccessRedirect({ pathname: "/privacy", isAuthenticated: false, accessStatus: null, role: null })).toBeNull();
  });
});
