import { afterEach, describe, expect, it } from "vitest";
import { unlockTestVault } from "@/test/unlock-vault";
import {
  formatQuizProgressNote,
  quizProgressId,
  readQuizProgress,
  selectionKeyFromText,
  writeQuizProgress,
} from "../quiz-progress";

describe("reader quiz progress", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("saves answers locally and resumes the same selection later", async () => {
    await unlockTestVault("quiz-student");
    const selected =
      "The area of a rectangle is length times width. If the length is 8 cm and the width is 5 cm, the area is 40 square centimetres.";
    writeQuizProgress({
      documentId: "doc-math",
      documentTitle: "Area of a Rectangle",
      pageNumber: 1,
      selectionKey: selectionKeyFromText(selected),
      answers: { 0: 1, 1: 0, 2: 3 },
      weakConcepts: ["area", "width"],
      completed: false,
      updatedAt: "2026-10-22T02:00:00.000Z",
    });

    const resumed = readQuizProgress("doc-math", 1, selected);
    expect(resumed?.answers).toEqual({ 0: 1, 1: 0, 2: 3 });
    expect(resumed?.weakConcepts).toEqual(["area", "width"]);
    expect(
      quizProgressId("doc-math", 1, selectionKeyFromText(selected))
    ).toContain("doc-math::1::");
    expect(readQuizProgress("doc-other", 1, selected)).toBeNull();
  });

  it("formats a notebook note without the full passage body", () => {
    const note = formatQuizProgressNote({
      documentId: "doc-math",
      documentTitle: "Area of a Rectangle",
      pageNumber: 1,
      selectionKey: "area of a rectangle",
      answers: { 0: 1 },
      weakConcepts: ["area"],
      completed: true,
      updatedAt: "2026-10-22T02:00:00.000Z",
    });
    expect(note).toMatch(/Answered: 1/);
    expect(note).toMatch(/Weak concepts: area/);
    expect(note).not.toMatch(/length times width|8 cm/);
  });
});
