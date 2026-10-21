import { describe, expect, it } from "vitest";
import {
  canManageClasses,
  canonicalInviteCode,
  decideAccessRedirect,
  destinationAfterAuth,
  evaluateInviteRedemption,
  formatInviteCode,
  generateInviteCode,
  isEntitled,
} from "../gate";

describe("access gate", () => {
  it("treats free, paid, sponsored, and trial profiles as entitled", () => {
    expect(isEntitled("free")).toBe(true);
    expect(isEntitled("active_paid")).toBe(true);
    expect(isEntitled("class_sponsored")).toBe(true);
    expect(isEntitled("trial")).toBe(true);
    expect(isEntitled("none")).toBe(false);
    expect(isEntitled("revoked")).toBe(false);
    expect(isEntitled(null)).toBe(false);
  });

  it("sends a new sign-in to pricing, the body-type guide, the hub, or the instructor desk", () => {
    expect(destinationAfterAuth({ accessStatus: "none", role: "student" })).toBe(
      "/pricing"
    );
    expect(destinationAfterAuth({ accessStatus: "free", role: "student" })).toBe(
      "/body-type"
    );
    expect(
      destinationAfterAuth({
        accessStatus: "active_paid",
        role: "student",
        hasBodyType: true,
      })
    ).toBe("/hub");
    expect(
      destinationAfterAuth({ accessStatus: "none", role: "instructor" })
    ).toBe("/instructor");
    expect(canManageClasses("admin")).toBe(true);
    expect(canManageClasses("student")).toBe(false);
  });

  it("redirects anonymous visitors to sign in and blocks unpaid study routes", () => {
    expect(
      decideAccessRedirect({
        pathname: "/hub",
        isAuthenticated: false,
        accessStatus: null,
        role: null,
      })
    ).toBe("/auth");
    expect(
      decideAccessRedirect({
        pathname: "/auth",
        isAuthenticated: false,
        accessStatus: null,
        role: null,
      })
    ).toBeNull();
    expect(
      decideAccessRedirect({
        pathname: "/auth",
        isAuthenticated: true,
        accessStatus: "free",
        role: "student",
      })
    ).toBe("/hub");
    expect(
      decideAccessRedirect({
        pathname: "/auth",
        isAuthenticated: true,
        accessStatus: "none",
        role: "student",
      })
    ).toBe("/pricing");
    expect(
      decideAccessRedirect({
        pathname: "/pricing",
        isAuthenticated: false,
        accessStatus: null,
        role: null,
      })
    ).toBeNull();
    expect(
      decideAccessRedirect({
        pathname: "/reader",
        isAuthenticated: true,
        accessStatus: "none",
        role: "student",
      })
    ).toBe("/pricing");
    expect(
      decideAccessRedirect({
        pathname: "/pricing",
        isAuthenticated: true,
        accessStatus: "none",
        role: "student",
      })
    ).toBeNull();
    expect(
      decideAccessRedirect({
        pathname: "/hub",
        isAuthenticated: true,
        accessStatus: "class_sponsored",
        role: "student",
      })
    ).toBeNull();
  });

  it("keeps the instructor desk limited to instructor and admin roles", () => {
    expect(
      decideAccessRedirect({
        pathname: "/instructor",
        isAuthenticated: true,
        accessStatus: "none",
        role: "student",
      })
    ).toBe("/pricing");
    expect(
      decideAccessRedirect({
        pathname: "/instructor",
        isAuthenticated: true,
        accessStatus: "active_paid",
        role: "student",
      })
    ).toBe("/hub");
    expect(
      decideAccessRedirect({
        pathname: "/instructor",
        isAuthenticated: true,
        accessStatus: "none",
        role: "instructor",
      })
    ).toBeNull();
  });

  it("accepts a class code only while it is open and has seats", () => {
    expect(
      evaluateInviteRedemption({
        revoked: false,
        expiresAt: null,
        seatsUsed: 2,
        seatLimit: 30,
        nowMs: 1,
      }).ok
    ).toBe(true);
    expect(
      evaluateInviteRedemption({
        revoked: true,
        expiresAt: null,
        seatsUsed: 0,
        seatLimit: 10,
        nowMs: 1,
      })
    ).toEqual({ ok: false, reason: "This class code has been turned off." });
    expect(
      evaluateInviteRedemption({
        revoked: false,
        expiresAt: null,
        seatsUsed: 10,
        seatLimit: 10,
        nowMs: 1,
      }).ok
    ).toBe(false);
  });

  it("formats invite codes for sharing", () => {
    let cursor = 0;
    const code = generateInviteCode(() => {
      cursor += 1;
      return cursor;
    });
    expect(code.startsWith("ORYZEN")).toBe(true);
    expect(code).toHaveLength(14);
    expect(formatInviteCode(code)).toBe(
      `ORYZEN-${code.slice(6, 10)}-${code.slice(10, 14)}`
    );
    expect(canonicalInviteCode("oryzen-abcd-efgh")).toBe("ORYZENABCDEFGH");
  });
});
