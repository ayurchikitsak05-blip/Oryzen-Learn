import { describe, expect, it } from "vitest";
import { APP_LINKS } from "@/lib/navigation/tabs";
import { decideAccessRedirect, isHiddenRoute } from "@/lib/access/gate";
import { ME_HIGHLIGHTS,
  ME_ITEMS, PRACTICE_ITEMS, SETTINGS_ITEMS } from "@/lib/navigation/tabs";

describe("four-tab navigation", () => {
  it("has exactly Today, Books, Practice and Tools", () => {
    expect(APP_LINKS.map((link) => link.label)).toEqual(["Today", "Books", "Practice", "Tools"]);
    expect(APP_LINKS.map((link) => link.href)).toEqual(["/hub", "/reader", "/practice", "/me"]);
  });

  it("reaches the kept features from Practice and Tools", () => {
    const hrefs = [...PRACTICE_ITEMS, ...ME_HIGHLIGHTS, ...ME_ITEMS, ...SETTINGS_ITEMS].map((item) => item.href);
    for (const href of ["/revise", "/reader?lens=test_me", "/sprint", "/progress", "/notes", "/roadmap", "/companion", "/video", "/synthesis", "/body-type", "/personalize", "/pricing"]) {
      expect(hrefs).toContain(href);
    }
    for (const href of hrefs) {
      expect(isHiddenRoute(href.split("?")[0])).toBe(false);
    }
  });

  it("sends hidden screens to Today, or to sign in when signed out", () => {
    for (const path of ["/studio", "/studio/garden", "/universe", "/institute/dashboard"]) {
      expect(isHiddenRoute(path)).toBe(true);
      expect(
        decideAccessRedirect({ pathname: path, isAuthenticated: true, accessStatus: "free", role: "student" })
      ).toBe("/hub");
      expect(
        decideAccessRedirect({ pathname: path, isAuthenticated: false, accessStatus: null, role: null })
      ).toBe("/auth");
    }
    expect(isHiddenRoute("/studious")).toBe(false);
    expect(
      decideAccessRedirect({ pathname: "/practice", isAuthenticated: true, accessStatus: "free", role: "student" })
    ).toBeNull();
  });
});
