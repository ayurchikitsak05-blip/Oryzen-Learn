import React from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
});
