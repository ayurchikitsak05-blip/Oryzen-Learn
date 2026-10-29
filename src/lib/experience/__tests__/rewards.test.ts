import { describe, expect, it } from "vitest";
import { EMPTY_LEARNING_RECORD, learningRecordFromParts, type LearningRecord } from "../record";
import { evaluateLearning, quizComparison } from "../rewards";
import type { RoadmapRecord } from "@/lib/roadmap/types";

function record(patch: Partial<LearningRecord>): LearningRecord {
  return { ...EMPTY_LEARNING_RECORD, ...patch };
}

describe("learning rewards", () => {
  it("earns nothing from an empty record and does not invent a quiz comparison", () => {
    const view = evaluateLearning(EMPTY_LEARNING_RECORD, "2026-10-29");
    expect(view.badges.every((badge) => !badge.earned)).toBe(true);
    expect(view.stickers.every((sticker) => !sticker.earned)).toBe(true);
    expect(view.titles.every((title) => !title.earned)).toBe(true);
    expect(view.garden).toEqual([]);
    expect(view.quizComparison).toBeNull();
    expect(quizComparison([])).toBeNull();
  });

  it("dates a saved note and keeps a garden when later days are missing", () => {
    const first = record({
      notes: [{ id: "n1", quote: "Work changes energy.", createdAt: "2026-10-01T08:00:00.000Z" }],
      sprintDays: [
        { date: "2026-10-01", minutes: 20 },
        { date: "2026-10-03", minutes: 10 },
        { date: "2026-10-09", minutes: 15 },
      ],
    });
    const earned = evaluateLearning(first, "2026-10-29");
    expect(earned.badges.find((badge) => badge.id === "badge-note")).toMatchObject({
      earned: true,
      earnedAt: "2026-10-01T08:00:00.000Z",
    });
    expect(earned.badges.find((badge) => badge.id === "badge-consistent")?.earned).toBe(true);
    const withAGap = evaluateLearning(
      record({
        notes: first.notes,
        sprintDays: [
          { date: "2026-10-01", minutes: 20 },
          { date: "2026-10-20", minutes: 10 },
          { date: "2026-10-28", minutes: 15 },
        ],
      }),
      "2026-10-29"
    );
    expect(withAGap.garden.filter((item) => item.kind === "plant")).toHaveLength(
      earned.garden.filter((item) => item.kind === "plant").length
    );
    expect(withAGap.badges.find((badge) => badge.id === "badge-consistent")?.earned).toBe(true);
  });

  it("compares quizzes only from saved review lists", () => {
    const shorter = quizComparison([
      { id: "a", title: "Forces", updatedAt: "2026-10-01T00:00:00.000Z", weakCount: 3, completed: true },
      { id: "b", title: "Forces again", updatedAt: "2026-10-20T00:00:00.000Z", weakCount: 1, completed: true },
    ]);
    expect(shorter?.reviewListShorter).toBe(true);
    expect(shorter?.earlier.weakCount).toBe(3);
    expect(quizComparison([shorter!.earlier])).toBeNull();
    const longer = evaluateLearning(
      record({
        quizzes: [
          { id: "a", title: "Forces", updatedAt: "2026-10-01T00:00:00.000Z", weakCount: 1, completed: true },
          { id: "b", title: "Forces again", updatedAt: "2026-10-20T00:00:00.000Z", weakCount: 2, completed: true },
        ],
      }),
      "2026-10-29"
    );
    expect(longer.badges.find((badge) => badge.id === "badge-quiz")?.earned).toBe(false);
    expect(longer.quizComparison?.reviewListLonger).toBe(true);
  });

  it("awards Science Explorer only when a science subject has saved progress", () => {
    const namedOnly = evaluateLearning(
      record({
        roadmap: {
          examName: "NEET",
          examDate: "2026-12-01",
          updatedAt: "2026-10-02T00:00:00.000Z",
          subjects: [{ id: "bio", name: "Biology", chapters: [{ id: "c", name: "Cell", completed: false }] }],
          completedSessions: [],
          plannedStudyCount: 1,
        },
      }),
      "2026-10-29"
    );
    expect(namedOnly.titles.find((title) => title.id === "title-science")?.earned).toBe(false);
    const progressed = evaluateLearning(
      record({
        roadmap: {
          examName: "NEET",
          examDate: "2026-12-01",
          updatedAt: "2026-10-02T00:00:00.000Z",
          subjects: [{ id: "bio", name: "Biology", chapters: [{ id: "c", name: "Cell", completed: true }] }],
          completedSessions: [
            { id: "s", completedAt: "2026-10-02T00:00:00.000Z", kind: "study", subjectName: "Biology", chapterName: "Cell" },
          ],
          plannedStudyCount: 1,
        },
      }),
      "2026-10-29"
    );
    expect(progressed.titles.find((title) => title.id === "title-science")?.earned).toBe(true);
    expect(progressed.garden.some((item) => item.kind === "stone")).toBe(true);
  });

  it("keeps chapter completion when the roadmap record is flattened", () => {
    const roadmap = {
      intake: {
        examName: "JEE",
        examDate: "2026-12-01",
        subjects: [{ id: "phy", name: "Physics", chapters: [{ id: "motion", name: "Motion", completed: false }] }],
      },
      plan: {
        days: [
          {
            sessions: [
              { id: "block-1", kind: "revision", subjectName: "Physics", chapterName: "Motion" },
            ],
          },
        ],
      },
      completions: { "block-1": { completedAt: "2026-10-04T00:00:00.000Z" } },
      updatedAt: "2026-10-04T00:00:00.000Z",
    } as unknown as RoadmapRecord;
    const view = evaluateLearning(
      learningRecordFromParts({ roadmap, books: [{ id: "doc", title: "Motion", createdAt: "2026-10-03T00:00:00.000Z" }] }),
      "2026-10-29"
    );
    expect(view.badges.find((badge) => badge.id === "badge-revision")?.earned).toBe(true);
    expect(view.badges.find((badge) => badge.id === "badge-chapter")?.earnedAt).toBe("2026-10-04T00:00:00.000Z");
    expect(view.titles.find((title) => title.id === "title-explorer")?.earned).toBe(true);
    expect(view.backgrounds).toContain("meadow");
    expect(view.desks).toContain("books");
  });
});
