import React from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bytesToBase64,
  deriveAccountVaultKey,
  discardAccountVault,
  flushAccountVault,
} from "@/lib/privacy/account-vault";
import { defaultIntake } from "@/lib/roadmap/defaults";
import { createRoadmapRecord, writeLocalRoadmap } from "@/lib/roadmap/persist";
import { unlockTestVault } from "@/test/unlock-vault";
import RoadmapApp from "../RoadmapApp";

vi.mock("next/navigation", () => ({
  usePathname: () => "/roadmap",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function vaultKeyResponse(userId: string) {
  const key = await deriveAccountVaultKey("vitest-reader-vault", userId);
  return jsonResponse({ key: bytesToBase64(key) });
}

function savedPlan(userId: string, examName: string) {
  return createRoadmapRecord({
    userId,
    intake: { ...defaultIntake("2026-12-31"), examName },
    today: "2026-11-02",
  });
}

describe("Study Roadmap loading", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("leaves the loader after a failed account copy and offers a retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/auth/session")) return jsonResponse({ userId: "student-a", email: null });
        if (String(url).includes("/api/roadmap")) return jsonResponse({ error: "unavailable" }, 500);
        return jsonResponse({}, 404);
      })
    );
    const view = render(<RoadmapApp />);
    expect(view.getByText("Opening your roadmap...")).toBeTruthy();
    await view.findByTestId("roadmap-sync-error");
    expect(view.queryByText("Opening your roadmap...")).toBeNull();
    expect(view.getByTestId("roadmap-sync-retry")).toBeTruthy();
    expect(view.getByTestId("roadmap-onboarding")).toBeTruthy();
  });

  it("restores the device plan after a refresh when the account copy fails", async () => {
    await unlockTestVault("student-a");
    const record = createRoadmapRecord({
      userId: "student-a",
      intake: { ...defaultIntake("2026-12-31"), examName: "Board exam" },
      today: "2026-11-02",
    });
    writeLocalRoadmap(record, "student-a");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/auth/session")) return jsonResponse({ userId: "student-a", email: null });
        if (String(url).includes("/api/roadmap")) return jsonResponse({ error: "unavailable" }, 500);
        return jsonResponse({}, 404);
      })
    );
    const view = render(<RoadmapApp />);
    await view.findByTestId("roadmap-today");
    expect(view.getByText(/Board exam/)).toBeTruthy();
    expect(view.queryByText("Opening your roadmap...")).toBeNull();
  });

  it("waits through a slow account copy and then opens onboarding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("/api/auth/session")) return Promise.resolve(jsonResponse({ userId: "student-a", email: null }));
        if (String(url).includes("/api/roadmap")) {
          return new Promise((resolve) => {
            setTimeout(() => resolve(jsonResponse({ record: null, persist: "server" })), 40);
          });
        }
        return Promise.resolve(jsonResponse({}, 404));
      })
    );
    const view = render(<RoadmapApp />);
    expect(view.getByText("Opening your roadmap...")).toBeTruthy();
    await waitFor(() => {
      expect(view.queryByText("Opening your roadmap...")).toBeNull();
    });
    expect(view.getByTestId("roadmap-onboarding")).toBeTruthy();
  });

  it("waits for the vault before a timed-out account request and keeps the saved plan", async () => {
    await unlockTestVault("student-a");
    writeLocalRoadmap(savedPlan("student-a", "Board exam"), "student-a");
    await flushAccountVault();
    discardAccountVault();
    let releaseVault: () => void = () => undefined;
    const vaultGate = new Promise<void>((resolve) => {
      releaseVault = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const target = String(url);
        if (target.includes("/api/auth/session")) return jsonResponse({ userId: "student-a", email: null });
        if (target.includes("/api/auth/reader-vault")) {
          await vaultGate;
          return vaultKeyResponse("student-a");
        }
        if (target.includes("/api/roadmap")) return jsonResponse({ error: "unavailable" }, 500);
        return jsonResponse({}, 404);
      })
    );
    const view = render(<RoadmapApp />);
    expect(view.getByText("Opening your roadmap...")).toBeTruthy();
    expect(view.queryByTestId("roadmap-onboarding")).toBeNull();
    releaseVault();
    await view.findByTestId("roadmap-today");
    expect(view.getByText(/Board exam/)).toBeTruthy();
    expect(view.queryByTestId("roadmap-onboarding")).toBeNull();
    expect(view.getByTestId("roadmap-sync-retry")).toBeTruthy();
  });

  it("keeps the saved plan through a slow failed account request", async () => {
    await unlockTestVault("student-a");
    writeLocalRoadmap(savedPlan("student-a", "Board exam"), "student-a");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const target = String(url);
        if (target.includes("/api/auth/session")) return Promise.resolve(jsonResponse({ userId: "student-a", email: null }));
        if (target.includes("/api/roadmap")) {
          return new Promise((resolve) => {
            setTimeout(() => resolve(jsonResponse({ error: "unavailable" }, 500)), 40);
          });
        }
        return Promise.resolve(jsonResponse({}, 404));
      })
    );
    const view = render(<RoadmapApp />);
    expect(view.getByText("Opening your roadmap...")).toBeTruthy();
    expect(view.queryByTestId("roadmap-onboarding")).toBeNull();
    await view.findByTestId("roadmap-today");
    expect(view.getByText(/Board exam/)).toBeTruthy();
    expect(view.queryByTestId("roadmap-onboarding")).toBeNull();
    expect(view.getByTestId("roadmap-sync-error")).toBeTruthy();
  });

  it("does not restore another student's roadmap after an account switch", async () => {
    await unlockTestVault("student-a");
    writeLocalRoadmap(savedPlan("student-a", "Board exam"), "student-a");
    await flushAccountVault();
    await unlockTestVault("student-b");
    writeLocalRoadmap(savedPlan("student-b", "Chemistry exam"), "student-b");
    await flushAccountVault();
    discardAccountVault();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const target = String(url);
        if (target.includes("/api/auth/session")) return jsonResponse({ userId: "student-b", email: null });
        if (target.includes("/api/auth/reader-vault")) return vaultKeyResponse("student-b");
        if (target.includes("/api/roadmap")) return jsonResponse({ error: "unavailable" }, 500);
        return jsonResponse({}, 404);
      })
    );
    const view = render(<RoadmapApp />);
    await view.findByTestId("roadmap-today");
    expect(view.getByText(/Chemistry exam/)).toBeTruthy();
    expect(view.queryByText(/Board exam/)).toBeNull();
    expect(view.queryByTestId("roadmap-onboarding")).toBeNull();
  });
});
