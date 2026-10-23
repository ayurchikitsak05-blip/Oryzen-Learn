import { describe, expect, it } from "vitest";
import { mergeBookmarks, mergeQuizProgress } from "../account-sync";

describe("reader account sync merge", () => {
  it("unions bookmarks and never drops a local page when the server is empty", () => {
    const local = [
      { documentId: "doc-a", pageNumber: 2, label: "Local", createdAt: "2026-10-23T01:00:00.000Z" },
    ];
    expect(mergeBookmarks(local, [])).toEqual(local);
  });

  it("keeps the newer quiz copy without wiping the other key", () => {
    const local = {
      documentId: "doc-a",
      documentTitle: "Science",
      pageNumber: 1,
      selectionKey: "current",
      answers: { 0: 1 },
      weakConcepts: [],
      completed: false,
      updatedAt: "2026-10-23T02:00:00.000Z",
    };
    const remoteOlder = {
      ...local,
      answers: { 0: 2 },
      updatedAt: "2026-10-23T01:00:00.000Z",
    };
    const remoteOther = {
      ...local,
      pageNumber: 4,
      selectionKey: "energy",
      answers: { 1: 0 },
      updatedAt: "2026-10-23T01:30:00.000Z",
    };
    const merged = mergeQuizProgress([local], [remoteOlder, remoteOther]);
    expect(merged).toHaveLength(2);
    expect(merged.find((row) => row.pageNumber === 1)?.answers).toEqual({ 0: 1 });
    expect(merged.find((row) => row.pageNumber === 4)?.selectionKey).toBe("energy");
  });
});
