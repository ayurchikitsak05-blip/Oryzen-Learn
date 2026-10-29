import { describe, expect, it } from "vitest";
import {
  createDemoVisitorId,
  isAllowedPublicDemoHost,
  isBlockedProductionHost,
  isPublicDemoEnabled,
  isPublicDemoSession,
  normalizeDemoVisitorId,
} from "@/lib/demo/public-demo";
import { STARTER_COMPANIONS } from "@/lib/companion";

describe("public demo gates", () => {
  it("never treats Production as an allowed demo host", () => {
    expect(isBlockedProductionHost("oryzen-learn.vercel.app")).toBe(true);
    expect(isAllowedPublicDemoHost("oryzen-learn.vercel.app")).toBe(false);
    expect(
      isPublicDemoEnabled({
        flag: "1",
        hostname: "oryzen-learn.vercel.app",
        vercelEnv: "production",
      })
    ).toBe(false);
  });

  it("allows the dedicated demo project hosts and localhost when flagged", () => {
    expect(isAllowedPublicDemoHost("localhost")).toBe(true);
    expect(isAllowedPublicDemoHost("oryzen-learn-demo.vercel.app")).toBe(true);
    expect(
      isPublicDemoEnabled({
        flag: "1",
        hostname: "oryzen-learn-demo.vercel.app",
        vercelEnv: "preview",
      })
    ).toBe(true);
    expect(
      isPublicDemoEnabled({
        flag: "1",
        hostname: "localhost",
        vercelEnv: "development",
      })
    ).toBe(true);
    expect(
      isPublicDemoEnabled({
        flag: "",
        hostname: "oryzen-learn-demo.vercel.app",
      })
    ).toBe(false);
  });

  it("rejects ordinary protected Preview hosts even with the flag", () => {
    expect(
      isPublicDemoEnabled({
        flag: "1",
        hostname: "oryzen-learn-jivladiwn-ayurchikitsak05-8316s-projects.vercel.app",
        vercelEnv: "preview",
      })
    ).toBe(false);
  });

  it("requires a visitor-scoped demo cookie pair", () => {
    const visitor = createDemoVisitorId();
    expect(normalizeDemoVisitorId(visitor)).toBe(visitor);
    expect(
      isPublicDemoSession({
        hostname: "oryzen-learn-demo.vercel.app",
        cookieValue: "1",
        visitorId: visitor,
        vercelEnv: "preview",
        flag: "1",
      })
    ).toBe(true);
    expect(
      isPublicDemoSession({
        hostname: "oryzen-learn-demo.vercel.app",
        cookieValue: "1",
        visitorId: "student-real-id",
        vercelEnv: "preview",
        flag: "1",
      })
    ).toBe(false);
  });

  it("keeps the four companion display names for the demo workspace", () => {
    expect(STARTER_COMPANIONS.map((member) => member.name)).toEqual([
      "Aarav",
      "Meera",
      "Kabir",
      "Tara",
    ]);
  });
});
