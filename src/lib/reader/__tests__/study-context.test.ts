import { describe, expect, it } from "vitest";
import {
  acceptSelectionText,
  passageBelongsToPage,
  resolveStudySnapshot,
  studySnapshotIsCurrent,
  type StudyChunkRef,
} from "../study-context";
import { buildIsolatedAppCacheKey, type AppCacheAuthorization } from "@/lib/ai/cache-policy";
import { readPersistedReaderView, writePersistedReaderView } from "../fit";
import { clearSavedPassages, listSavedPassages, savePassageEntry } from "@/lib/ai/passage-store";
import { unlockTestVault } from "@/test/unlock-vault";

const NEWTON =
  "An object keeps a constant velocity unless a net force acts on it. That is Newton's first law.";
const RECTANGLE =
  "The area of a rectangle is length times width. If the length is 8 cm and the width is 5 cm, the area is 40 square centimetres.";
const RECTANGLE_PAGE_2 =
  "Cover the page and say it: area equals length times width. A width of 6 cm gives 48 square centimetres.";

const newtonChunk: StudyChunkRef = {
  chunk_id: "newton-p1-c1",
  document_id: "newton-doc",
  page_number: 1,
  text: NEWTON,
  section_heading: "Newton's first law",
};
const rectangleChunk: StudyChunkRef = {
  chunk_id: "rect-p1-c1",
  document_id: "rect-doc",
  page_number: 1,
  text: RECTANGLE,
  section_heading: "Area of a rectangle",
};
const rectanglePage2: StudyChunkRef = {
  chunk_id: "rect-p2-c1",
  document_id: "rect-doc",
  page_number: 2,
  text: RECTANGLE_PAGE_2,
  section_heading: "Check the formula",
};
const library = [newtonChunk, rectangleChunk, rectanglePage2];

function snapshotFor(
  documentId: string,
  pageNumber: number,
  override: string | null,
  chunk: StudyChunkRef | null,
  lens = "illustrative"
) {
  return resolveStudySnapshot({
    documentId,
    documentHash: documentId === "newton-doc" ? "hash-newton" : "hash-rect",
    pageNumber,
    chunks: library,
    chunk,
    overrideText: override,
    lens,
  });
}

describe("study context stays on the open textbook", () => {
  it("reads a saved textbook whose chunks still use the indexer slug", () => {
    const stored = {
      ...rectangleChunk,
      document_id: "mathematics-rectangle-area",
    };
    const resolved = resolveStudySnapshot({
      documentId: "saved-rect-id",
      documentHash: "hash-rect",
      pageNumber: 1,
      chunks: [stored],
      chunk: { ...newtonChunk, document_id: "newton-first-law" },
      overrideText: "length times width",
      lens: "illustrative",
    });
    if (!resolved.ok) throw new Error("missing passage");
    expect(resolved.snapshot.documentId).toBe("saved-rect-id");
    expect(resolved.snapshot.selectedText).toBe("length times width");
    expect(resolved.snapshot.selectedText).not.toMatch(/constant velocity/i);
    const foreign = resolveStudySnapshot({
      documentId: "saved-rect-id",
      documentHash: "hash-rect",
      pageNumber: 1,
      chunks: [stored],
      chunk: { ...newtonChunk, document_id: "newton-first-law" },
      overrideText: NEWTON,
      lens: "illustrative",
    });
    expect(foreign.ok).toBe(false);
  });

  it("does not replace a foreign highlight with the open page", () => {
    expect(snapshotFor("rect-doc", 1, NEWTON, rectangleChunk).ok).toBe(false);
    expect(snapshotFor("newton-doc", 1, RECTANGLE, newtonChunk).ok).toBe(false);
    const phrase = snapshotFor("rect-doc", 1, "40 square centimetres", rectangleChunk);
    expect(phrase.ok).toBe(true);
    if (!phrase.ok) return;
    expect(phrase.snapshot.selectedText).toBe("40 square centimetres");
    expect(phrase.snapshot.selectedText).not.toBe(RECTANGLE);
  });

  it("keeps the latest highlight and the latest study mode", () => {
    const first = snapshotFor("rect-doc", 1, "length times width", rectangleChunk, "illustrative");
    const next = snapshotFor("rect-doc", 1, "40 square centimetres", rectangleChunk, "explain");
    expect(first.ok && next.ok).toBe(true);
    if (!first.ok || !next.ok) return;
    expect(next.snapshot.selectedText).toBe("40 square centimetres");
    expect(next.snapshot.lens).toBe("explain");
    expect(
      studySnapshotIsCurrent(first.snapshot, {
        documentId: "rect-doc",
        pageNumber: 1,
        lens: "explain",
        selectedText: next.snapshot.selectedText,
      })
    ).toBe(false);
  });

  it("drops a response when the page or textbook changes while it is pending", () => {
    const pending = snapshotFor("rect-doc", 1, RECTANGLE, rectangleChunk);
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    expect(
      studySnapshotIsCurrent(pending.snapshot, {
        documentId: "rect-doc",
        pageNumber: 2,
        lens: "illustrative",
        selectedText: RECTANGLE,
      })
    ).toBe(false);
    expect(
      studySnapshotIsCurrent(pending.snapshot, {
        documentId: "newton-doc",
        pageNumber: 1,
        lens: "illustrative",
        selectedText: NEWTON,
      })
    ).toBe(false);
    expect(snapshotFor("rect-doc", 2, null, null, "illustrative").ok).toBe(false);
    const pageTwo = snapshotFor("rect-doc", 2, "48 square centimetres", rectanglePage2, "illustrative");
    expect(pageTwo.ok).toBe(true);
    if (!pageTwo.ok) return;
    expect(pageTwo.snapshot.selectedText).toBe("48 square centimetres");
  });

  it("accepts a highlight on the open page and ignores the other book", () => {
    expect(passageBelongsToPage("length times width", RECTANGLE)).toBe(true);
    expect(passageBelongsToPage(NEWTON, RECTANGLE)).toBe(false);
    expect(acceptSelectionText(NEWTON, rectangleChunk, library, "rect-doc", 1)).toBeNull();
    expect(acceptSelectionText("8 cm and the width is 5 cm", rectangleChunk, library, "rect-doc", 1)).toBe(
      "8 cm and the width is 5 cm"
    );
    expect(acceptSelectionText("net force", newtonChunk, library, "newton-doc", 1)).toBe("net force");
    expect(acceptSelectionText("", newtonChunk, library, "newton-doc", 1)).toBeNull();
    expect(acceptSelectionText(RECTANGLE, newtonChunk, library, "newton-doc", 1)).toBeNull();
  });

  it("does not apply a cached study result from another textbook or passage", async () => {
    const auth: AppCacheAuthorization = {
      documentClass: "private_upload",
      tenantId: "inst-north",
      syllabusHash: "syl",
      authorizedShare: false,
      revoked: false,
      revocationEpoch: "2026-10-01",
      individualized: false,
    };
    const newton = await buildIsolatedAppCacheKey({
      auth,
      userId: "student-a",
      documentId: "newton-doc",
      documentHash: "hash-newton",
      pageNumber: 1,
      selectionHash: "newton-selection",
      lensType: "illustrative",
    });
    const rectangle = await buildIsolatedAppCacheKey({
      auth,
      userId: "student-a",
      documentId: "rect-doc",
      documentHash: "hash-rect",
      pageNumber: 1,
      selectionHash: "rectangle-selection",
      lensType: "illustrative",
    });
    const sameBookOtherPassage = await buildIsolatedAppCacheKey({
      auth,
      userId: "student-a",
      documentId: "rect-doc",
      documentHash: "hash-rect",
      pageNumber: 1,
      selectionHash: "rectangle-width-only",
      lensType: "illustrative",
    });
    const sameHashOtherBook = await buildIsolatedAppCacheKey({
      auth,
      userId: "student-a",
      documentId: "rect-doc-copy",
      documentHash: "hash-rect",
      pageNumber: 1,
      selectionHash: "rectangle-selection",
      lensType: "illustrative",
    });
    const otherStudent = await buildIsolatedAppCacheKey({
      auth,
      userId: "student-b",
      documentId: "rect-doc",
      documentHash: "hash-rect",
      pageNumber: 1,
      selectionHash: "rectangle-selection",
      lensType: "illustrative",
    });
    const rectangleAgain = await buildIsolatedAppCacheKey({
      auth,
      userId: "student-a",
      documentId: "rect-doc",
      documentHash: "hash-rect",
      pageNumber: 1,
      selectionHash: "rectangle-selection",
      lensType: "illustrative",
    });
    expect(newton.cacheKey).not.toBe(rectangle.cacheKey);
    expect(rectangle.cacheKey).not.toBe(sameBookOtherPassage.cacheKey);
    expect(rectangle.cacheKey).not.toBe(sameHashOtherBook.cacheKey);
    expect(rectangle.cacheKey).not.toBe(otherStudent.cacheKey);
    expect(rectangle.cacheKey).toBe(rectangleAgain.cacheKey);
  });

  it("keeps only the last textbook after rapid switches", () => {
    const order = ["newton-doc", "rect-doc", "newton-doc"] as const;
    let live = {
      documentId: "",
      pageNumber: 0,
      lens: "",
      selectedText: "",
    };
    let requestId = 0;
    const issued = order.map((documentId) => {
      requestId += 1;
      const phrase = documentId === "newton-doc" ? "constant velocity" : "length times width";
      const resolved = resolveStudySnapshot({
        documentId,
        documentHash: documentId,
        pageNumber: 1,
        chunks: library,
        chunk: documentId === "newton-doc" ? rectangleChunk : newtonChunk,
        overrideText: phrase,
        lens: "illustrative",
        exactSelection: true,
      });
      if (!resolved.ok) throw new Error("missing passage");
      live = {
        documentId: resolved.snapshot.documentId,
        pageNumber: resolved.snapshot.pageNumber,
        lens: resolved.snapshot.lens,
        selectedText: resolved.snapshot.selectedText,
      };
      return { id: requestId, snapshot: resolved.snapshot };
    });
    const currentId = requestId;
    expect(issued[0].snapshot.selectedText).toBe("constant velocity");
    expect(issued[1].snapshot.selectedText).toBe("length times width");
    expect(issued[2].snapshot.selectedText).toBe("constant velocity");
    expect(issued[0].id).not.toBe(currentId);
    expect(issued[1].id).not.toBe(currentId);
    expect(studySnapshotIsCurrent(issued[1].snapshot, live)).toBe(false);
    expect(studySnapshotIsCurrent(issued[2].snapshot, live)).toBe(true);
    expect(live.selectedText).toBe("constant velocity");
  });

  it("keeps saved notes and reading progress when the study selection is dropped", async () => {
    window.localStorage.clear();
    clearSavedPassages();
    await unlockTestVault("student-a");
    savePassageEntry(
      {
        documentId: "newton-doc",
        documentTitle: "Newton's First Law",
        pageNumber: 1,
        sectionHeading: "Newton's first law",
        boundingBox: { x: 0, y: 0, width: 1, height: 1 },
        highlightedText: NEWTON,
        aiSynthesisMarkdown: "Velocity stays constant unless a net force acts.",
        citations: [],
      },
      "student-a"
    );
    writePersistedReaderView(
      "newton-doc",
      { page: 2, zoom: 1, fitMode: "width", progress: 0.4 },
      "student-a"
    );
    writePersistedReaderView(
      "rect-doc",
      { page: 1, zoom: 1, fitMode: "width", progress: 0.2 },
      "student-a"
    );
    const dropped = snapshotFor("rect-doc", 1, null, null);
    expect(dropped.ok).toBe(false);
    expect(listSavedPassages("newton-doc", "student-a")[0]?.highlightedText).toMatch(/constant velocity/i);
    expect(listSavedPassages("newton-doc", "student-b")).toHaveLength(0);
    expect(readPersistedReaderView("newton-doc", "student-a")?.page).toBe(2);
    expect(readPersistedReaderView("rect-doc", "student-a")?.page).toBe(1);
    expect(JSON.stringify(readPersistedReaderView("rect-doc", "student-a"))).not.toMatch(/constant velocity/);
    window.localStorage.clear();
  });
});
