import { afterEach, describe, expect, it } from "vitest";
import {
  hasBookmark,
  listBookmarks,
  toggleBookmark,
} from "../bookmarks";

describe("reader bookmarks", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("stores a page bookmark for one student only", () => {
    toggleBookmark(
      { documentId: "doc-a", pageNumber: 3, label: "Circuits" },
      "user-a"
    );
    expect(hasBookmark("doc-a", 3, "user-a")).toBe(true);
    expect(hasBookmark("doc-a", 3, "user-b")).toBe(false);
    expect(listBookmarks("doc-a", "user-a")[0]?.label).toBe("Circuits");
  });

  it("toggles the same page off", () => {
    toggleBookmark({ documentId: "doc-a", pageNumber: 2, label: "Start" }, "user-a");
    toggleBookmark({ documentId: "doc-a", pageNumber: 2, label: "Start" }, "user-a");
    expect(listBookmarks("doc-a", "user-a")).toEqual([]);
  });
});
