import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  cardStage,
  googleCalendarReminderUrl,
  dueForecast,
  gradeCard,
  memoriseNow,
  previewDays,
  rateCard,
  weakCards,
  pickTodayCards,
  revisionReminderIcs,
  strengthsAndWeakSpots,
  subjectProgress,
  type RevisionNote,
} from "../cards";

const note = (id: string, updatedAt: string, body = "answer"): RevisionNote => ({
  id, title: `Note ${id}`, body, subject: "Physics", updatedAt,
});

describe("morning revision cards", () => {
  it("shows due cards first (weakest first), then new notes, at most 5", () => {
    const notes = [
      note("a", "2026-11-01"), note("b", "2026-11-02"), note("c", "2026-11-03"),
      note("d", "2026-11-04"), note("e", "2026-11-04"), note("f", "2026-11-04"), note("g", "2026-11-04", " "),
    ];
    const state = {
      a: { box: 2, due: "2026-11-05", lastSeen: "2026-11-02" },
      b: { box: 0, due: "2026-11-04", lastSeen: "2026-11-03" },
      c: { box: 1, due: "2026-11-09", lastSeen: "2026-11-04" },
    };
    const picked = pickTodayCards(notes, state, "2026-11-05").map((n) => n.id);
    expect(picked.slice(0, 2)).toEqual(["b", "a"]);
    expect(picked).toHaveLength(5);
    expect(picked).not.toContain("c");
    expect(picked).not.toContain("g");
  });

  it("spaces out remembered cards with FSRS and brings back forgotten ones tomorrow", () => {
    let state = gradeCard({}, "a", true, "2026-11-05");
    expect(state.a).toMatchObject({ box: 1, due: "2026-11-09" }); // first "remembered": about 4 days
    state = gradeCard(state, "a", true, "2026-11-09");
    expect(state.a.box).toBe(2);
    expect(state.a.due > "2026-11-20").toBe(true); // the gap grows
    state = gradeCard(state, "a", false, "2026-12-01");
    expect(state.a).toMatchObject({ box: 0, due: "2026-12-02", lapses: 1 });
    expect(addDaysIso("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("shows how many days each answer gives, and Easy > Good > Hard > Again", () => {
    const days = previewDays({}, "n", "2026-11-27");
    expect(days[1]).toBe(1);
    expect(days[2]).toBeLessThan(days[3]);
    expect(days[3]).toBeLessThan(days[4]);
  });

  it("reads cards saved before FSRS from their old box", () => {
    const state = { a: { box: 3, due: "2026-11-20", lastSeen: "2026-11-06" } };
    const next = rateCard(state, "a", 3, "2026-11-20");
    expect(next.a.stability).toBeGreaterThan(7);
    expect(next.a.box).toBe(4);
  });

  it("forecasts cards due this week and finds weak cards", () => {
    const notes = [note("a", ""), note("b", ""), note("c", "")];
    const state = {
      a: { box: 1, due: "2026-11-26", lastSeen: "2026-11-20" },
      b: { box: 1, due: "2026-11-29", lastSeen: "2026-11-25" },
      c: { box: 0, due: "2026-11-28", lastSeen: "2026-11-27", lapses: 2 },
    };
    expect(dueForecast(notes, state, "2026-11-27")).toEqual([1, 1, 1, 0, 0, 0, 0]);
    expect(weakCards(notes, state).map((n) => n.id)).toEqual(["c"]);
  });

  it("makes a daily calendar reminder that opens Morning revision", () => {
    const ics = revisionReminderIcs({
      time: "07:00", startDay: "2026-11-06", url: "https://learn.example/revise", now: new Date("2026-11-05T00:00:00Z"),
    });
    expect(ics).toContain("DTSTART:20261106T070000");
    expect(ics).toContain("RRULE:FREQ=DAILY");
    expect(ics).toContain("URL:https://learn.example/revise");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
    expect(ics).toContain("UID:oryzen-morning-revision@oryzen-learn");
    const google = new URL(googleCalendarReminderUrl({ time: "23:58", startDay: "2026-11-06", url: "https://learn.example/revise" }));
    expect(google.searchParams.get("dates")).toBe("20261106T235800/20261107T000300");
    expect(google.searchParams.get("recur")).toBe("RRULE:FREQ=DAILY");
  });

  it("'Memorise this' brings a note to the front today; three remembers in a row = memorised", () => {
    let state = memoriseNow({}, "x", "2026-11-08");
    const picked = pickTodayCards([note("x", "2020-01-01"), note("y", "2026-11-07")], state, "2026-11-08");
    expect(picked[0].id).toBe("x");
    expect(cardStage(state, "x")).toBe("new");
    for (const day of ["2026-11-08", "2026-11-09", "2026-11-12"]) state = gradeCard(state, "x", true, day);
    expect(cardStage(state, "x")).toBe("memorised");
    state = gradeCard(state, "x", false, "2026-11-19");
    expect(cardStage(state, "x")).toBe("not_yet");
  });

  it("counts memorised notes by subject and finds strengths and weak spots", () => {
    const notes: RevisionNote[] = [
      { id: "p1", title: "a", body: "b", subject: "Physics", updatedAt: "" },
      { id: "p2", title: "a", body: "b", subject: "Physics", updatedAt: "" },
      { id: "c1", title: "a", body: "b", subject: "Chemistry", updatedAt: "" },
      { id: "c2", title: "a", body: "b", subject: "Chemistry", updatedAt: "" },
      { id: "b1", title: "a", body: "b", subject: "Biology", updatedAt: "" },
    ];
    const state = {
      p1: { box: 3, due: "2026-11-20", lastSeen: "2026-11-06" },
      p2: { box: 2, due: "2026-11-12", lastSeen: "2026-11-06" },
      c1: { box: 0, due: "2026-11-09", lastSeen: "2026-11-08" },
      c2: { box: 0, due: "2026-11-09", lastSeen: "2026-11-08" },
    };
    const rows = subjectProgress(notes, state);
    expect(rows.find((r) => r.subject === "Physics")).toMatchObject({ memorised: 1, learning: 1 });
    expect(rows.find((r) => r.subject === "Biology")).toMatchObject({ fresh: 1 });
    expect(strengthsAndWeakSpots(rows)).toEqual({ strong: ["Physics"], weak: ["Chemistry"] });
  });
});

describe("revision tracker counts only real cards", () => {
  it("leaves out voice notes and empty notes, and never calls a subject that's doing well weak", async () => {
    const { subjectProgress, strengthsAndWeakSpots } = await import("../cards");
    const rows = subjectProgress(
      [
        { id: "v", title: "My voice", body: "Your voice note", subject: "Voice notes", updatedAt: "", audioId: "v" },
        { id: "e", title: "Empty", body: "  ", subject: "Physics", updatedAt: "" },
        { id: "p", title: "Ohm", body: "V = IR", subject: "Physics", updatedAt: "" },
      ],
      {}
    );
    expect(rows.map((row) => [row.subject, row.total])).toEqual([["Physics", 1]]);
    const many = ["A", "B", "C", "D"].map((subject) => ({
      subject, total: 4, memorised: 3, learning: 0, notYet: 1, fresh: 0,
    }));
    expect(strengthsAndWeakSpots(many).weak).toEqual([]);
  });
});
