import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppChrome from "@/components/layout/AppChrome";

vi.mock("next/navigation", () => ({
  usePathname: () => "/hub",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/privacy/account-vault", () => ({
  ensureAccountVault: vi.fn(async () => true),
}));

describe("signed-in header", () => {
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
});
