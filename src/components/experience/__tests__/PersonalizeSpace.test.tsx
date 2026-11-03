import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonalizeSpace } from "../PersonalizeSpace";
import { readCompanionStore } from "@/lib/companion";
import { readRhythmPrefs } from "@/lib/rhythm/persist";
import { discardAccountVault } from "@/lib/privacy/account-vault";
import { unlockTestVault } from "@/test/unlock-vault";

vi.mock("@/lib/supabase/session", () => ({
  fetchSignedInUser: vi.fn(async () => ({ userId: "student-a" })),
}));

vi.mock("@/lib/privacy/account-vault", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/privacy/account-vault")>();
  return { ...actual, ensureAccountVault: vi.fn(async () => true) };
});

describe("Personalize my space", () => {
  afterEach(() => {
    discardAccountVault();
    window.localStorage.clear();
  });

  it("changes colours and the Take My Study helper", async () => {
    await unlockTestVault("student-a");
    render(<PersonalizeSpace />);
    await waitFor(() => expect((screen.getByTestId("colour-clay") as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(screen.getByTestId("colour-clay"));
    expect(screen.getByTestId("colour-clay").getAttribute("aria-checked")).toBe("true");
    expect(readRhythmPrefs().themeId).toBe("warm-grounded");

    fireEvent.click(screen.getByTestId("helper-coach"));
    expect(screen.getByTestId("helper-coach").getAttribute("aria-checked")).toBe("true");
    expect(readCompanionStore("student-a").prefs.style).toBe("coach");

    expect(screen.getByTestId("focus-sound-panel")).toBeTruthy();
    expect(screen.queryByText(/Sticker Studio|Garden|Badges/)).toBeNull();
  });
});
