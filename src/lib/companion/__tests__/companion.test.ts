import { afterEach, describe, expect, it } from "vitest";
import { createSprintSession } from "@/lib/sprint/engine";
import { companionReply, COMPANION_MOCK_NOTICE, repliesDifferByStyle } from "../replies";
import {
  companionStorageKey,
  readCompanionStore,
  writeCompanionPrefs,
  writeCompanionStore,
} from "../persist";
import { DEFAULT_COMPANION_PREFS } from "../types";

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
    expect(repliesDifferByStyle("How do I explain this?", unfinished)).toBe(true);
    expect(teacher.text).toMatch(/in one sentence|First review/i);
    expect(coach.text).toMatch(/One clear next step/);
  });

  it("stores companion names per student", () => {
    writeCompanionPrefs({ ...DEFAULT_COMPANION_PREFS, name: "Mira", style: "buddy", onboarded: true }, "user-a");
    writeCompanionPrefs({ ...DEFAULT_COMPANION_PREFS, name: "Dev", style: "teacher", onboarded: true }, "user-b");
    expect(companionStorageKey("user-a")).not.toBe(companionStorageKey("user-b"));
    expect(readCompanionStore("user-a").prefs.name).toBe("Mira");
    expect(readCompanionStore("user-b").prefs.style).toBe("teacher");
    expect(readCompanionStore("user-a").prefs.style).toBe("buddy");
    writeCompanionStore(readCompanionStore("user-a"), "user-a");
  });
});
