import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MorningRevision } from "../MorningRevision";
import { readRevisionState } from "@/lib/revision/cards";
import { discardAccountVault } from "@/lib/privacy/account-vault";
import { unlockTestVault } from "@/test/unlock-vault";

vi.mock("@/lib/supabase/session", () => ({
  fetchSignedInUser: vi.fn(async () => ({ userId: "student-a" })),
}));
vi.mock("@/lib/privacy/account-vault", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/privacy/account-vault")>();
  return { ...actual, ensureAccountVault: vi.fn(async () => true) };
});

describe("MorningRevision", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    discardAccountVault();
    window.localStorage.clear();
  });

  it("turns notes into cards, records answers, and finishes", async () => {
    await unlockTestVault("student-a");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            subjects: [{ id: "s1", title: "Physics" }],
            notes: [
              { id: "n1", subject_id: "s1", title: "What is a projectile?", body: "An object moving only under gravity.", updated_at: "2026-11-04T10:00:00Z" },
              { id: "n2", subject_id: "s1", title: "Empty", body: "", updated_at: "2026-11-04T10:00:00Z" },
            ],
          }),
          { status: 200 }
        )
      )
    );
    render(<MorningRevision />);
    expect(await screen.findByText("What is a projectile?")).toBeTruthy();
    expect(screen.getByText(/Card 1 of 1 · Physics/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("revision-show"));
    expect(screen.getByTestId("revision-answer").textContent).toMatch(/gravity/);
    fireEvent.click(screen.getByTestId("revision-yes"));
    expect(screen.getByTestId("revision-done").textContent).toMatch(/remembered 1 of 1/);
    expect(readRevisionState("student-a").n1.box).toBe(1);
    expect(screen.getByTestId("revision-reminder")).toBeTruthy();
  });

  it("explains how to get cards when there are no notes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ subjects: [], notes: [] }), { status: 200 })));
    render(<MorningRevision />);
    expect(await screen.findByTestId("revision-empty")).toBeTruthy();
  });
});
