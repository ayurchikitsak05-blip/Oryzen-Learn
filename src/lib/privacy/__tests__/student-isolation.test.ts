import { afterEach, describe, expect, it } from "vitest";
import {
  clearSavedPassages,
  listSavedPassages,
  listUnclaimedLegacyPassages,
  savePassageEntry,
  SAVED_PASSAGE_STORAGE_KEY,
  savedPassagesStorageKey,
  unclaimedLegacyPassagesExist,
} from "@/lib/ai/passage-store";
import {
  LOCAL_PRAKRITI_STORAGE_KEY,
  readLocalPrakritiProfile,
  unclaimedLegacyPrakritiExists,
  writeLocalPrakritiProfile,
} from "@/lib/supabase/profile-sync";
import { createSprintSession, startSprint } from "@/lib/sprint/engine";
import { saveSprintNote, listSprintNotes } from "@/lib/sprint/notes";
import { writeCompanionPrefs, readCompanionStore } from "@/lib/companion";
import { DEFAULT_COMPANION_PREFS } from "@/lib/companion/types";
import { writeQuizProgress, readQuizProgress } from "@/lib/reader/quiz-progress";
import { readSprintStore, writeSprintStore } from "@/lib/sprint/persist";
import { UNCLAIMED_STUDENT_DATA_KEYS } from "@/lib/reader/local-scope";

const passage = {
  documentId: "doc-1",
  documentTitle: "Circuits",
  pageNumber: 2,
  sectionHeading: "Current",
  boundingBox: { x: 1, y: 2, width: 3, height: 4 },
  highlightedText: "Only student A highlighted this sentence.",
  aiSynthesisMarkdown: "A private note",
  citations: [],
};

describe("student data isolation", () => {
  afterEach(() => {
    clearSavedPassages();
    window.localStorage.clear();
  });

  it("does not assign unclaimed legacy highlights to a later student", () => {
    window.localStorage.setItem(
      SAVED_PASSAGE_STORAGE_KEY,
      JSON.stringify([
        {
          ...passage,
          id: "legacy-note",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ])
    );

    expect(unclaimedLegacyPassagesExist()).toBe(true);
    expect(listUnclaimedLegacyPassages()[0]?.id).toBe("legacy-note");
    expect(listSavedPassages(undefined, "user-a")).toEqual([]);
    expect(listSavedPassages(undefined, "user-b")).toEqual([]);
    expect(window.localStorage.getItem(SAVED_PASSAGE_STORAGE_KEY)).toContain("legacy-note");
  });

  it("keeps new highlights, notes, sprints, companion prefs, quizzes, and profiles apart", () => {
    savePassageEntry(passage, "user-a");
    writeLocalPrakritiProfile(
      {
        version: 1,
        completedAt: "2026-10-25T00:00:00.000Z",
        userId: "user-a",
        basicScores: { Vata: 1, Pitta: 0, Kapha: 0 },
        readingScores: { Vata: 1, Pitta: 0, Kapha: 0 },
        calculated: {
          primaryDosha: "Vata",
          secondaryDosha: null,
          displayProfileTitle: "Spark",
        } as never,
        themePreference: "--theme-vata",
      },
      "user-a"
    );
    writeCompanionPrefs(
      { ...DEFAULT_COMPANION_PREFS, name: "Mira", style: "teacher", onboarded: true },
      "user-a"
    );
    const sprint = startSprint(
      createSprintSession({ goal: "A private sprint", durationMinutes: 25, date: "2026-10-25" }),
      1
    );
    writeSprintStore({ ...readSprintStore("user-a"), sessions: [sprint] }, "user-a");
    saveSprintNote(
      { session: sprint, kind: "session", title: "A note", body: "Only for A" },
      "user-a"
    );
    writeQuizProgress(
      {
        documentId: "doc-1",
        documentTitle: "Circuits",
        pageNumber: 2,
        selectionKey: "current",
        answers: { 0: 1 },
        weakConcepts: ["current"],
        completed: true,
        updatedAt: "2026-10-25T00:00:00.000Z",
      },
      "user-a"
    );

    expect(listSavedPassages(undefined, "user-a")[0]?.highlightedText).toMatch(/student A/);
    expect(listSavedPassages(undefined, "user-b")).toEqual([]);
    expect(readLocalPrakritiProfile("user-b")).toBeNull();
    expect(readCompanionStore("user-b").prefs.name).not.toBe("Mira");
    expect(readSprintStore("user-b").sessions).toEqual([]);
    expect(listSprintNotes("user-b")).toEqual([]);
    expect(readQuizProgress("doc-1", 2, "current", "user-b")).toBeNull();
    expect(savedPassagesStorageKey("user-a")).not.toBe(savedPassagesStorageKey("user-b"));
    expect(UNCLAIMED_STUDENT_DATA_KEYS).toContain(SAVED_PASSAGE_STORAGE_KEY);
    expect(UNCLAIMED_STUDENT_DATA_KEYS).toContain(LOCAL_PRAKRITI_STORAGE_KEY);
  });

  it("does not adopt an unclaimed learning profile after another student signs in", () => {
    window.localStorage.setItem(
      LOCAL_PRAKRITI_STORAGE_KEY,
      JSON.stringify({ userId: "someone-else", calculated: { primaryDosha: "Pitta" } })
    );
    expect(unclaimedLegacyPrakritiExists()).toBe(true);
    expect(readLocalPrakritiProfile("user-a")).toBeNull();
    expect(readLocalPrakritiProfile("user-b")).toBeNull();
    expect(window.localStorage.getItem(LOCAL_PRAKRITI_STORAGE_KEY)).toContain("someone-else");
  });
});
