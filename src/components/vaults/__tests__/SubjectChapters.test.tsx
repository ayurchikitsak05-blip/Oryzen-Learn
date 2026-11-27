import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ ready: new Set<string>(), written: [] as string[][] }));

vi.mock("@/lib/supabase/session", () => ({ fetchSignedInUser: vi.fn(async () => ({ userId: "student-1" })) }));
vi.mock("@/lib/privacy/account-vault", () => ({
  whenAccountVaultOpen: vi.fn(async () => true),
  readPrivateString: vi.fn(() => null),
  writePrivateString: vi.fn(),
}));
vi.mock("@/lib/reader/storage", () => ({
  listLocalPdfDocuments: vi.fn(async () => [
    {
      id: "book-1",
      title: "Physics Part 1",
      fileName: "physics.pdf",
      pageCount: 120,
      lastReadPage: 30,
      updatedAt: "2026-11-27",
      chapters: [
        { title: "Units and Measurement", pageNumber: 1 },
        { title: "Motion in a Straight Line", pageNumber: 25 },
        { title: "Laws of Motion", pageNumber: 88 },
      ],
    },
    { id: "book-2", title: "Chemistry", fileName: "chem.pdf", pageCount: 50, lastReadPage: 1, updatedAt: "2026-11-27", chapters: [] },
  ]),
}));
vi.mock("@/lib/reader/fit", () => ({ readPersistedReaderView: vi.fn(() => null) }));
vi.mock("@/lib/reader/library", () => ({
  isSampleBook: () => false,
  readBookSubjects: () => ({ "book-1": "Physics", "book-2": "Chemistry" }),
}));
vi.mock("@/lib/subjects/chapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/subjects/chapters")>();
  return {
    ...actual,
    readChapterReady: () => new Set(store.ready),
    writeChapterReady: (_user: string | null, ready: Set<string>) => store.written.push([...ready]),
  };
});

import { SubjectChapters } from "../SubjectChapters";

describe("SubjectChapters", () => {
  it("lists only this subject's chapters with status, pages and a link to the page", async () => {
    render(<SubjectChapters subject="physics" />);
    const rows = await screen.findAllByTestId("subject-chapter-row");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/Units and Measurement/);
    expect(rows[0].textContent).toMatch(/Read/);
    expect(rows[1].textContent).toMatch(/Reading/);
    expect(rows[2].textContent).toMatch(/Not started/);
    expect(rows[1].textContent).toMatch(/p\. 25–87/);
    expect(screen.getAllByRole("link", { name: "Continue" })[0].getAttribute("href")).toBe("/reader?doc=book-1&page=25");
  });

  it("ticks a chapter exam-ready and saves it", async () => {
    render(<SubjectChapters subject="Physics" />);
    await screen.findAllByTestId("subject-chapter-row");
    fireEvent.click(screen.getAllByRole("button", { name: /Mark exam-ready/ })[0]);
    expect(store.written.at(-1)).toEqual(["book-1:1"]);
    expect(screen.getByText("1 / 3")).toBeTruthy();
  });

  it("explains what to do when the subject has no books", async () => {
    render(<SubjectChapters subject="Biology" />);
    expect(await screen.findByTestId("subject-chapters-empty")).toBeTruthy();
  });
});
