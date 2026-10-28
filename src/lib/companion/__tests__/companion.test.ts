import { afterEach, describe, expect, it } from "vitest";
import { createSprintSession } from "@/lib/sprint/engine";
import { companionReply, COMPANION_MOCK_NOTICE, repliesDifferByStyle } from "../replies";
import {
  activateCompanionStyle,
  companionStorageKey,
  createCompanionMember,
  forgetCompanionTurns,
  readCompanionStore,
  retainCompanionTurns,
  writeCompanionPrefs,
  writeCompanionStore,
} from "../persist";
import { DEFAULT_COMPANION_PREFS } from "../types";
import { unlockTestVault } from "@/test/unlock-vault";

describe("AI Study Companion", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("keeps mocked replies honest and style-aware", () => {
    const unfinished = createSprintSession({
      goal: "Solve ax + b = 0",
      subject: "Mathematics",
      durationMinutes: 25,
    });
    const teacher = companionReply({
      question: "How do I explain this?",
      prefs: { ...DEFAULT_COMPANION_PREFS, name: "Ira", style: "teacher", onboarded: true },
      unfinished,
    });
    expect(teacher.mocked).toBe(true);
    expect(teacher.text).toMatch(/not a person|not a live model/i);
    expect(teacher.text).toMatch(COMPANION_MOCK_NOTICE);
    expect(teacher.text).not.toMatch(/\bI feel\b|\bI am human\b/i);

    const coach = companionReply({
      question: "Plan my session",
      prefs: { ...DEFAULT_COMPANION_PREFS, name: "Kai", style: "coach", onboarded: true },
      unfinished,
    });
    expect(coach.text).toMatch(/25 minutes|StudySprint|next step/i);

    const resume = companionReply({
      question: "What did I leave unfinished?",
      prefs: { ...DEFAULT_COMPANION_PREFS, name: "Nia", style: "buddy", onboarded: true },
      unfinished,
    });
    expect(resume.text).toMatch(/Solve ax \+ b = 0|Resume/i);
    const guide = companionReply({
      question: "How do I explain this?",
      prefs: { ...DEFAULT_COMPANION_PREFS, name: "Sora", style: "guide", onboarded: true },
      unfinished,
    });
    expect(guide.text).toMatch(/When you are ready|calm study companion/i);
    expect(repliesDifferByStyle("How do I explain this?", unfinished)).toBe(true);
    expect(teacher.text).toMatch(/in one sentence|First review/i);
    expect(coach.text).toMatch(/One clear next step/);
  });

  it("stores companion names per student", async () => {
    await unlockTestVault("user-a");
    writeCompanionPrefs({ ...DEFAULT_COMPANION_PREFS, name: "Mira", style: "buddy", onboarded: true }, "user-a");
    await unlockTestVault("user-b");
    writeCompanionPrefs({ ...DEFAULT_COMPANION_PREFS, name: "Dev", style: "teacher", onboarded: true }, "user-b");
    expect(companionStorageKey("user-a")).not.toBe(companionStorageKey("user-b"));
    expect(readCompanionStore("user-b").prefs.style).toBe("teacher");
    expect(readCompanionStore("user-b").collection.some((member) => member.name === "Luna")).toBe(false);
    await unlockTestVault("user-a");
    expect(readCompanionStore("user-a").prefs.name).toBe("Mira");
    expect(readCompanionStore("user-a").prefs.style).toBe("buddy");
    writeCompanionStore(readCompanionStore("user-a"), "user-a");
    expect(readCompanionStore("user-a").collection.length).toBeGreaterThanOrEqual(1);
    createCompanionMember({ name: "Luna", style: "guide", character: "kite" }, "user-a");
    expect(readCompanionStore("user-a").prefs.name).toBe("Luna");
    expect(readCompanionStore("user-a").collection.some((member) => member.name === "Luna")).toBe(true);
  });

  it("keeps a turn that arrived before the account id without copying it to someone else", async () => {
    await unlockTestVault("user-a");
    const saved = activateCompanionStyle("teacher", "user-a");
    const retained = retainCompanionTurns(
      saved,
      [
        {
          id: "student-early",
          role: "student",
          text: "Explain work and energy",
          mocked: false,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      "user-a"
    );
    expect(retained.turns.map((turn) => turn.text)).toContain("Explain work and energy");
    expect(retainCompanionTurns(retained, retained.turns, "user-a").turns).toEqual(retained.turns);
    await unlockTestVault("user-b");
    expect(readCompanionStore("user-b").turns.map((turn) => turn.text)).not.toContain("Explain work and energy");
    await unlockTestVault("user-a");
    expect(readCompanionStore("user-a").turns.map((turn) => turn.id)).toContain("student-early");
    forgetCompanionTurns(new Set(["student-early"]), "user-a");
    expect(readCompanionStore("user-a").turns.map((turn) => turn.id)).not.toContain("student-early");
  });

  it("selects an existing starter style without a second companion store", async () => {
    await unlockTestVault("user-a");
    const selected = activateCompanionStyle("teacher", "user-a");
    expect(selected.prefs.style).toBe("teacher");
    expect(selected.prefs.name).toBe("Ira");
    expect(readCompanionStore("user-a").activeId).toBe("teacher");
    const again = activateCompanionStyle("teacher", "user-a");
    expect(again.turns).toEqual(selected.turns);
  });
});
