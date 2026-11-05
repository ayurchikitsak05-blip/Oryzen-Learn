import { describe, expect, it } from "vitest";
import { addDaysIso, googleCalendarReminderUrl, gradeCard, pickTodayCards, revisionReminderIcs, type RevisionNote } from "../cards";

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

  it("spaces out remembered cards and brings back forgotten ones tomorrow", () => {
    let state = gradeCard({}, "a", true, "2026-11-05");
    expect(state.a).toMatchObject({ box: 1, due: "2026-11-06" });
    state = gradeCard(state, "a", true, "2026-11-06");
    expect(state.a).toMatchObject({ box: 2, due: "2026-11-09" });
    state = gradeCard(state, "a", false, "2026-11-09");
    expect(state.a).toMatchObject({ box: 0, due: "2026-11-10" });
    expect(addDaysIso("2026-12-30", 3)).toBe("2027-01-02");
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
});
