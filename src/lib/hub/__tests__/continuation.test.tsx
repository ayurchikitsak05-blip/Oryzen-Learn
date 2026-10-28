import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudyHome } from "@/components/hub/StudyHome";
import { readHomeContinuation } from "@/lib/hub/continuation";
import { discardAccountVault, flushAccountVault, isAccountVaultUnlocked, lockAccountVault } from "@/lib/privacy/account-vault";
import { defaultIntake } from "@/lib/roadmap/defaults";
import { createRoadmapRecord, writeLocalRoadmap } from "@/lib/roadmap/persist";
import { createSprintSession } from "@/lib/sprint/engine";
import { readSprintStore, writeSprintStore } from "@/lib/sprint/persist";
import { unlockTestVault } from "@/test/unlock-vault";

const TODAY = "2026-11-02";
const ACCOUNT_A = "home-a";
const ACCOUNT_B = "home-b";

const empty = {
  bookTitle: null,
  sprintLabel: null,
  nextBlock: null,
  studiedMinutes: null,
  dailyGoal: null,
};

describe("Learning Space summary", () => {
  afterEach(() => {
    window.localStorage.clear();
    discardAccountVault();
  });

  it("keeps the empty summary when nothing is saved", () => {
    render(<StudyHome continuation={empty} record="ready" />);
    expect(screen.getByTestId("hub-today-plan").textContent).toMatch(/Nothing is planned for today/);
    expect(screen.getByTestId("hub-today-progress").textContent).toMatch(/Nothing recorded yet/);
    expect(screen.getByTestId("hub-today-progress").textContent).toMatch(/No daily goal is saved yet/);
  });

  it("does not call a locked or unread record empty", () => {
    const { rerender } = render(<StudyHome continuation={empty} record="loading" />);
    expect(screen.getByTestId("hub-today-plan").textContent).toMatch(/Reading this account's study record/);
    expect(screen.getByTestId("hub-today-plan").textContent).not.toMatch(/Nothing is planned for today/);
    expect(screen.getByTestId("hub-today-progress").textContent).not.toMatch(/Nothing recorded yet/);

    rerender(<StudyHome continuation={empty} record="locked" />);
    expect(screen.getByTestId("hub-today-plan").textContent).toMatch(/locked on this device/);
    expect(screen.getByTestId("hub-today-progress").textContent).not.toMatch(/Nothing recorded yet/);
  });

  it("shows a saved plan and sprint, hides them from another account, and restores them", async () => {
    await unlockTestVault(ACCOUNT_A);
    const roadmap = createRoadmapRecord({
      userId: ACCOUNT_A,
      intake: { ...defaultIntake("2026-12-31"), examName: "Preview physics check" },
      today: TODAY,
    });
    writeLocalRoadmap(roadmap, ACCOUNT_A);
    const session = {
      ...createSprintSession({
        goal: "Revise work and energy",
        subject: "Physics",
        durationMinutes: 15,
        date: TODAY,
      }),
      status: "paused" as const,
      elapsedMs: 0,
    };
    writeSprintStore({ ...readSprintStore(ACCOUNT_A), sessions: [session], dailyTargetMinutes: 15 }, ACCOUNT_A);

    const saved = readHomeContinuation(ACCOUNT_A, TODAY, "Work and Energy");
    expect(saved.nextBlock).toBeTruthy();
    expect(saved.sprintLabel).toMatch(/Revise work and energy/);
    expect(saved.studiedMinutes).toBe(0);
    expect(saved.dailyGoal).toBe(15);
    expect(saved.bookTitle).toBe("Work and Energy");
    expect(`${saved.nextBlock} ${saved.sprintLabel}`).toMatch(/Preview physics check|Physics|Revise work and energy/);

    render(<StudyHome continuation={saved} record="ready" />);
    expect(screen.getByTestId("hub-today-plan").textContent).toMatch(/Revise work and energy/);
    expect(screen.getByTestId("hub-today-plan").textContent).not.toMatch(/Nothing is planned for today/);
    expect(screen.getByTestId("hub-today-progress").textContent).toMatch(/0 min studied/);
    expect(screen.getByTestId("hub-today-progress").textContent).toMatch(/Daily goal: 15 minutes/);

    await flushAccountVault();
    await lockAccountVault();
    expect(isAccountVaultUnlocked()).toBe(false);
    const beforeUnlock = readHomeContinuation(ACCOUNT_A, TODAY, null);
    expect(beforeUnlock.sprintLabel).toBeNull();
    expect(beforeUnlock.nextBlock).toBeNull();
    expect(beforeUnlock.studiedMinutes).toBeNull();

    await unlockTestVault(ACCOUNT_B);
    const other = readHomeContinuation(ACCOUNT_B, TODAY, null);
    expect(other.nextBlock).toBeNull();
    expect(other.sprintLabel).toBeNull();
    expect(other.studiedMinutes).toBeNull();
    expect(other.dailyGoal).toBeNull();

    await unlockTestVault(ACCOUNT_A);
    const restored = readHomeContinuation(ACCOUNT_A, TODAY, "Work and Energy");
    expect(restored.sprintLabel).toMatch(/Revise work and energy/);
    expect(restored.studiedMinutes).toBe(0);
    expect(restored.dailyGoal).toBe(15);
    expect(restored.nextBlock).toBe(saved.nextBlock);
  });

  it("shows a completed sprint's recorded minutes and keeps an empty account empty", async () => {
    await unlockTestVault(ACCOUNT_A);
    const session = {
      ...createSprintSession({
        goal: "Finish the energy review",
        subject: "Physics",
        durationMinutes: 15,
        dailyTargetMinutes: 30,
        date: TODAY,
      }),
      status: "completed" as const,
      elapsedMs: 15 * 60_000,
    };
    writeSprintStore({ ...readSprintStore(ACCOUNT_A), sessions: [session], dailyTargetMinutes: 30 }, ACCOUNT_A);
    const saved = readHomeContinuation(ACCOUNT_A, TODAY, null);
    expect(saved.sprintLabel).toBe("Study Sprint complete: Finish the energy review");
    expect(saved.studiedMinutes).toBe(15);
    expect(saved.dailyGoal).toBe(30);
    expect(saved.nextBlock).toMatch(/Next recommended block/);

    session.elapsedMs = 20 * 60_000;
    writeSprintStore({ ...readSprintStore(ACCOUNT_A), sessions: [session], dailyTargetMinutes: 30 }, ACCOUNT_A);
    expect(readHomeContinuation(ACCOUNT_A, TODAY, null).studiedMinutes).toBe(20);

    await flushAccountVault();
    await lockAccountVault();
    await unlockTestVault(ACCOUNT_A);
    expect(readHomeContinuation(ACCOUNT_A, TODAY, null).studiedMinutes).toBe(20);
    expect(readHomeContinuation(ACCOUNT_B, TODAY, null).sprintLabel).toBeNull();
  });
});
