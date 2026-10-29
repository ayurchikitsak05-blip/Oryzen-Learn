import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  APP_NAV_STACK_KEY,
  isSafeAppPath,
  normalizeAppPath,
  parentPathFor,
  previousAppPath,
  recordAppVisit,
  resetAppBackClientStateForTests,
  resolveAppBack,
} from "@/lib/navigation/app-back";

describe("app back navigation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetAppBackClientStateForTests();
  });

  afterEach(() => {
    sessionStorage.clear();
    resetAppBackClientStateForTests();
  });

  it("keeps auth and pricing out of the safe path list", () => {
    expect(isSafeAppPath("/hub")).toBe(true);
    expect(isSafeAppPath("/studio/room")).toBe(true);
    expect(isSafeAppPath("/auth")).toBe(false);
    expect(isSafeAppPath("/auth?next=%2Fhub")).toBe(false);
    expect(isSafeAppPath("/pricing")).toBe(false);
    expect(isSafeAppPath("/")).toBe(false);
  });

  it("maps studio and library pages to their parents", () => {
    expect(parentPathFor("/studio/room")).toBe("/studio");
    expect(parentPathFor("/studio")).toBe("/hub");
    expect(parentPathFor("/vaults/abc")).toBe("/vaults");
    expect(parentPathFor("/reader?lens=test_me")).toBe("/hub");
    expect(normalizeAppPath("/studio/room/")).toBe("/studio/room");
  });

  it("returns to the previous in-app page after normal navigation", () => {
    recordAppVisit("/hub");
    recordAppVisit("/studio");
    recordAppVisit("/studio/room");
    expect(previousAppPath("/studio/room")).toBe("/studio");
    const back = resolveAppBack("/studio/room");
    expect(back.visible).toBe(true);
    expect(back.href).toBe("/studio");
    expect(back.useHistory).toBe(true);
  });

  it("falls back to the parent after a direct open or refresh", () => {
    sessionStorage.setItem(APP_NAV_STACK_KEY, JSON.stringify(["/hub", "/personalize"]));
    resetAppBackClientStateForTests();
    recordAppVisit("/personalize");
    const back = resolveAppBack("/personalize");
    expect(back.visible).toBe(true);
    expect(back.href).toBe("/hub");
    expect(back.useHistory).toBe(false);
  });

  it("hides Back on Learning Space when there is no previous page", () => {
    recordAppVisit("/hub");
    expect(resolveAppBack("/hub")).toEqual({
      href: "/hub",
      useHistory: false,
      visible: false,
    });
  });

  it("skips auth if it somehow entered the stack", () => {
    sessionStorage.setItem(
      APP_NAV_STACK_KEY,
      JSON.stringify(["/hub", "/auth?next=%2Freader", "/reader"])
    );
    expect(previousAppPath("/reader")).toBe("/hub");
  });
});
