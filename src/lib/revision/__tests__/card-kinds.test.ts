import { describe, expect, it } from "vitest";
import { GAP, cardView, choiceFrom, clozeFrom, gapAnswerMatches, matchRound, shortAnswer } from "../card-kinds";
import type { RevisionNote } from "../cards";

const n = (id: string, title: string, body: string, subject = "Physics"): RevisionNote => ({ id, title, body, subject, updatedAt: "" });

const pool = [
  n("1", "Newton's first law", "An object stays at rest or in uniform motion unless a force acts on it."),
  n("2", "Inertia", "**Inertia** is the tendency of a body to resist a change in its motion."),
  n("3", "Momentum", "Momentum is mass times velocity."),
  n("4", "Impulse", "Impulse is the change in momentum, force times time."),
  n("5", "Cloze from Anki", "The SI unit of force is {{c1::newton}}."),
];

describe("card types from the student's notes (no AI)", () => {
  it("makes a gap from a bold word, an Anki cloze, or the title", () => {
    expect(clozeFrom(pool[1])).toEqual({ kind: "cloze", text: `${GAP} is the tendency of a body to resist a change in its motion.`, answer: "Inertia" });
    expect(clozeFrom(pool[4])?.answer).toBe("newton");
    expect(clozeFrom(pool[2])?.text).toBe(`${GAP} is mass times velocity.`);
    expect(clozeFrom(n("x", "Short", "too short"))).toBeNull();
  });

  it("makes multiple choice with three wrong answers from other notes", () => {
    const card = choiceFrom(pool[2], pool, "seed");
    expect(card?.options).toHaveLength(4);
    expect(card?.options[card.correct]).toBe("Momentum is mass times velocity.");
    expect(new Set(card?.options).size).toBe(4);
    expect(choiceFrom(pool[2], pool.slice(0, 3), "seed")).toBeNull(); // not enough other notes
  });

  it("varies the card type by day but keeps it the same all day", () => {
    const day1 = cardView(pool[1], pool, "2026-11-27").kind;
    expect(cardView(pool[1], pool, "2026-11-27").kind).toBe(day1);
    const kinds = new Set(["2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"].map((day) => cardView(pool[1], pool, day).kind));
    expect(kinds.size).toBeGreaterThan(1);
    expect(cardView({ ...pool[0], audioId: "v1" }, pool, "2026-11-27").kind).toBe("flip");
  });

  it("builds a matching round with the answers out of order", () => {
    const round = matchRound(pool, "s");
    expect(round?.pairs).toHaveLength(4);
    expect(round?.order.some((value, index) => value !== index)).toBe(true);
    expect(matchRound(pool.slice(0, 2), "s")).toBeNull();
  });

  it("accepts a typed gap answer regardless of case and punctuation", () => {
    expect(gapAnswerMatches(" newton. ", "Newton")).toBe(true);
    expect(gapAnswerMatches("", "Newton")).toBe(false);
    expect(shortAnswer("First sentence here. Second one.")).toBe("First sentence here.");
  });
});
