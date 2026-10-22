import { afterEach, describe, expect, it } from "vitest";
import {
  ANONYMOUS_READER_SCOPE,
  normalizeReaderScope,
  scopedReaderStorageKey,
} from "../local-scope";
import {
  readLastReaderDocumentId,
  readPersistedReaderView,
  writeLastReaderDocumentId,
  writePersistedReaderView,
} from "../fit";
import {
  readQuizProgress,
  selectionKeyFromText,
  writeQuizProgress,
} from "../quiz-progress";

const BASE = "oryzen_reader_view_v1";

describe("local reader scope (tests only, no live RLS)", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("namespaces storage keys by user and keeps an anonymous fallback", () => {
    expect(normalizeReaderScope(null)).toBe(ANONYMOUS_READER_SCOPE);
    expect(normalizeReaderScope("  user-a  ")).toBe("user-a");
    expect(scopedReaderStorageKey(BASE, "user-a")).toBe(`${BASE}::user-a`);
    expect(scopedReaderStorageKey(BASE, "user-b")).toBe(`${BASE}::user-b`);
    expect(scopedReaderStorageKey(BASE, "user-a")).not.toBe(
      scopedReaderStorageKey(BASE, "user-b")
    );
  });

  it("keeps reading position, last book, and quiz scores isolated between users", () => {
    writePersistedReaderView(
      "rect-doc",
      { page: 3, zoom: 1.4, fitMode: "width", progress: 0.5 },
      "user-a"
    );
    writeLastReaderDocumentId("rect-doc", "user-a");
    writeQuizProgress(
      {
        documentId: "rect-doc",
        documentTitle: "Area of a Rectangle",
        pageNumber: 1,
        selectionKey: selectionKeyFromText("length 8 cm width 5 cm"),
        answers: { 0: 1, 1: 0 },
        weakConcepts: ["area"],
        completed: true,
        updatedAt: "2026-10-22T03:00:00.000Z",
      },
      "user-a"
    );

    expect(readPersistedReaderView("rect-doc", "user-a")?.page).toBe(3);
    expect(readLastReaderDocumentId("user-a")).toBe("rect-doc");
    expect(
      readQuizProgress("rect-doc", 1, "length 8 cm width 5 cm", "user-a")
        ?.weakConcepts
    ).toEqual(["area"]);

    expect(readPersistedReaderView("rect-doc", "user-b")).toBeNull();
    expect(readLastReaderDocumentId("user-b")).toBeNull();
    expect(
      readQuizProgress("rect-doc", 1, "length 8 cm width 5 cm", "user-b")
    ).toBeNull();
  });
});
