import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FocusGuard } from "../FocusGuard";
import { createSprintSession, readSprintStore, startSprint, upsertSprintSession } from "@/lib/sprint";
import { writeFocusGuardPrefs } from "@/lib/sprint/guard";
import { discardAccountVault } from "@/lib/privacy/account-vault";
import { unlockTestVault } from "@/test/unlock-vault";

vi.mock("@/lib/supabase/session", () => ({
  fetchSignedInUser: vi.fn(async () => ({ userId: "student-a" })),
}));

function setVisibility(value: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("FocusGuard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    discardAccountVault();
    window.localStorage.clear();
    window.sessionStorage.clear();
    setVisibility("visible");
  });

  async function startAndLeave(awayMs: number) {
    await unlockTestVault("student-a");
    const t0 = Date.now();
    const session = startSprint(createSprintSession({ goal: "Read ch 4", durationMinutes: 25 }), t0);
    upsertSprintSession(session, "student-a");
    render(<FocusGuard />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    vi.spyOn(Date, "now").mockReturnValue(t0 + 2 * 60_000);
    act(() => setVisibility("hidden"));
    vi.spyOn(Date, "now").mockReturnValue(t0 + 2 * 60_000 + awayMs);
    act(() => setVisibility("visible"));
    return session;
  }

  it("pauses a sprint after a minute away and welcomes the student back", async () => {
    const session = await startAndLeave(6 * 60_000);
    await waitFor(() => expect(screen.getByTestId("focus-guard")).toBeTruthy());
    expect(screen.getByText(/away for 6 minutes/)).toBeTruthy();
    expect(screen.getByTestId("focus-guard-count").textContent).toBe("1 time");
    expect(readSprintStore("student-a").sessions.find((s) => s.id === session.id)?.status).toBe("paused");

    fireEvent.click(screen.getByTestId("focus-guard-continue"));
    expect(screen.queryByTestId("focus-guard")).toBeNull();
    expect(readSprintStore("student-a").sessions.find((s) => s.id === session.id)?.status).toBe("running");
  });

  it("stays quiet for a short trip or when turned off", async () => {
    await startAndLeave(30_000);
    expect(screen.queryByTestId("focus-guard")).toBeNull();
  });

  it("does nothing when the student turned the guard off", async () => {
    writeFocusGuardPrefs({ enabled: false });
    await startAndLeave(10 * 60_000);
    expect(screen.queryByTestId("focus-guard")).toBeNull();
  });
});
