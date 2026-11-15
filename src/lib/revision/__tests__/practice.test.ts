import { describe, expect, it } from "vitest";
import { practiceCards, shuffleCards } from "../cards";

const note = (id: string, subject: string, extra: Partial<{ body: string; audioId: string }> = {}) => ({
  id,
  title: `Card ${id}`,
  body: extra.body ?? "answer",
  subject,
  updatedAt: "2026-11-01",
  ...(extra.audioId ? { audioId: extra.audioId } : {}),
});

describe("practise any time", () => {
  it("offers every card, weakest first, by subject, without a daily limit of 5", () => {
    const notes = Array.from({ length: 12 }, (_, i) => note(`n${i}`, i % 2 ? "Physics" : "Biology"));
    const state = { n0: { box: 3, due: "2026-12-01", lastSeen: "2026-11-10" }, n2: { box: 1, due: "2026-11-20", lastSeen: "2026-11-10" } };
    const all = practiceCards(notes, state);
    expect(all).toHaveLength(12);
    expect(all[all.length - 1].id).toBe("n0");
    expect(practiceCards(notes, state, { subject: "Physics" }).every((card) => card.subject === "Physics")).toBe(true);
    expect(practiceCards(notes, state, { max: 3 })).toHaveLength(3);
    expect(practiceCards([note("x", "A", { body: " " }), note("v", "A", { body: "", audioId: "v" })], {})).toHaveLength(1);
  });

  it("shuffles without losing or repeating cards", () => {
    const cards = ["a", "b", "c", "d"];
    const shuffled = shuffleCards(cards, () => 0);
    expect(shuffled.slice().sort()).toEqual(cards);
    expect(shuffled).not.toEqual(cards);
    expect(cards).toEqual(["a", "b", "c", "d"]);
  });
});
