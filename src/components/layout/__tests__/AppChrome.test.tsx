import React from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppChrome from "@/components/layout/AppChrome";
import { resetAppBackClientStateForTests } from "@/lib/navigation/app-back";

const nav = vi.hoisted(() => ({
  path: "/hub",
  push: vi.fn(),
  back: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: nav.back }),
}));

vi.mock("@/lib/privacy/account-vault", () => ({
  ensureAccountVault: vi.fn(async () => true),
  lockAccountVault: vi.fn(async () => undefined),
  registerVaultLockHook: vi.fn(),
  SEALED_PRIVATE_KEY: "oryzen_sealed_private_v1",
}));

vi.mock("@/lib/supabase/session", () => ({
  fetchSignedInUser: vi.fn(async () => null),
}));

describe("signed-in header", () => {
  beforeEach(() => {
    nav.path = "/hub";
    nav.push.mockReset();
    nav.back.mockReset();
    sessionStorage.clear();
    resetAppBackClientStateForTests();
  });

  it("keeps Plan time, Personalize, and Sign out in a wrapping header", () => {
    render(
      <AppChrome
        subtitle="My Learning Space"
        actions={
          <div className="flex max-w-full flex-wrap items-center justify-end gap-1">
            <a href="/personalize">Personalize</a>
            <button type="button">Sign out</button>
            <button type="button" aria-label="Plan your study time">
              Plan time
            </button>
          </div>
        }
      >
        <main>Learning Space</main>
      </AppChrome>
    );

    const header = screen.getByRole("banner");
    const row = header.firstElementChild as HTMLElement;
    expect(row.className).toContain("flex-wrap");
    expect(row.className).toContain("min-w-0");
    expect(row.className).toContain("md:flex-nowrap");
    const actions = screen.getByRole("button", { name: "Plan your study time" }).parentElement
      ?.parentElement as HTMLElement;
    expect(actions.className).toContain("flex-wrap");
    expect(actions.className).toContain("max-w-full");
    expect(actions.className).not.toContain("shrink-0");
    expect(screen.getByRole("link", { name: /Personalize/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Oryzen Learn/ })).toBeTruthy();
  });

  it("shows Back on learning tools and returns to Learning Space", () => {
    nav.path = "/studio/room";
    render(
      <AppChrome subtitle="Studio">
        <main>Study Room</main>
      </AppChrome>
    );
    const back = screen.getByTestId("app-back");
    expect(back.textContent).toMatch(/Back/);
    expect(back.className).toContain("min-h-11");
    fireEvent.click(back);
    expect(nav.push).toHaveBeenCalledWith("/studio");
  });

  it("hides Back on Learning Space when there is nowhere safe to return", () => {
    render(
      <AppChrome subtitle="My Learning Space">
        <main>Learning Space</main>
      </AppChrome>
    );
    expect(screen.queryByTestId("app-back")).toBeNull();
  });

  it("hydrates the mobile navigation without a markup mismatch", async () => {
    const element = (
      <AppChrome subtitle="Studio">
        <main>Studio</main>
      </AppChrome>
    );
    const host = document.createElement("div");
    host.innerHTML = renderToString(element);
    document.body.appendChild(host);
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((item) => String(item)).join(" "));
    };
    await act(async () => {
      hydrateRoot(host, element);
    });
    console.error = original;
    host.remove();
    const hydration = errors.filter((line) => /hydrat|did not match|server rendered/i.test(line));
    expect(hydration).toEqual([]);
    expect(host.innerHTML).not.toContain("data-cursor-ref");
  });
});
