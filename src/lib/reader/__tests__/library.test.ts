import { beforeEach, describe, expect, it } from "vitest";
import {
  groupBooksBySubject,
  NO_SUBJECT,
  readBookSubjects,
  SAMPLE_GROUP,
  setBookSubject,
  subjectChoices,
  type LibraryBook,
} from "../library";
import { unlockTestVault } from "@/test/unlock-vault";

const book = (id: string, title: string, fileName = `${id}.pdf`, updatedAt = "2026-11-18T00:00:00Z"): LibraryBook => ({
  id,
  title,
  fileName,
  pageCount: 10,
  updatedAt,
});

describe("books by subject", () => {
  it("groups subjects A–Z, then books without a subject, then the sample books", () => {
    const groups = groupBooksBySubject(
      [
        book("a", "Waves notes"),
        book("b", "Organic chemistry"),
        book("c", "Untitled scan"),
        book("s", "Newton's First Law", "newton-first-law.pdf"),
      ],
      { a: "Physics", b: "Chemistry" }
    );
    expect(groups.map((group) => group.subject)).toEqual(["Chemistry", "Physics", NO_SUBJECT, SAMPLE_GROUP]);
  });

  it("offers the library's subjects plus any already used", () => {
    expect(subjectChoices(["Physics", " physics ", ""], { x: "Biology" })).toEqual(["Biology", "Physics", "physics"]);
  });
});

describe("saving a book's subject", () => {
  beforeEach(async () => {
    await unlockTestVault("student-a");
  });

  it("keeps it privately and can clear it", () => {
    expect(setBookSubject("student-a", "doc-1", "  Physics ")).toEqual({ "doc-1": "Physics" });
    expect(readBookSubjects("student-a")).toEqual({ "doc-1": "Physics" });
    expect(setBookSubject("student-a", "doc-1", null)).toEqual({});
  });
});
