import { describe, expect, it } from "vitest";
import {
  OWNER_DEMO_EMAIL,
  allowsLocalOwnerDemoBypass,
  isLocalDemoHost,
  isOwnerDemoEmail,
} from "../owner-demo";

describe("owner demo identification", () => {
  it("labels only the throwaway owner demo email", () => {
    expect(isOwnerDemoEmail(OWNER_DEMO_EMAIL)).toBe(true);
    expect(isOwnerDemoEmail("  oryzen.owner.demo@example.com  ")).toBe(true);
    expect(isOwnerDemoEmail("student@school.edu")).toBe(false);
    expect(isOwnerDemoEmail(null)).toBe(false);
  });

  it("never treats Production hosts or Vercel production as local demo", () => {
    expect(isLocalDemoHost("localhost")).toBe(true);
    expect(isLocalDemoHost("127.0.0.1:3000")).toBe(true);
    expect(
      allowsLocalOwnerDemoBypass({
        hostname: "localhost",
        vercelEnv: "development",
        cookieValue: "1",
      })
    ).toBe(true);
    expect(
      allowsLocalOwnerDemoBypass({
        hostname: "localhost",
        vercelEnv: "production",
        cookieValue: "1",
      })
    ).toBe(false);
    expect(
      allowsLocalOwnerDemoBypass({
        hostname: "oryzen-learn.vercel.app",
        vercelEnv: "preview",
        cookieValue: "1",
      })
    ).toBe(false);
    expect(
      allowsLocalOwnerDemoBypass({
        hostname: "localhost",
        vercelEnv: "development",
        cookieValue: "0",
      })
    ).toBe(false);
  });
});
