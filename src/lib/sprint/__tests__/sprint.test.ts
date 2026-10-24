import { afterEach, describe, expect, it } from "vitest";
import {
  completeSprint,
  createSprintSession,
  liveElapsedMs,
  pauseSprint,
  remainingMs,
  resumeSprint,
  startSprint,
  tickSprint,
} from "../engine";
import {
  activeSession,
  nearestDuration,
  pendingSessions,
  quizHref,
  readerHref,
  rhythmFromDosha,
  splitDailyTarget,
  studiedMinutesOnDate,
  suggestSprintDefaults,
} from "../plan";
import { readSprintStore, sprintStorageKey, writeSprintStore } from "../persist";

describe("StudySprint planning", () => {
  it("suggests editable rhythm defaults without treating dosha as ability", () => {
    expect(rhythmFromDosha("Vata")).toBe("spark");
    expect(suggestSprintDefaults("Vata").duration).toBe(25);
    expect(suggestSprintDefaults("Pitta").duration).toBe(45);
    expect(nearestDuration(22)).toBe(25);
    expect(splitDailyTarget(90, 25).blocks).toEqual([25, 25, 25, 15]);
  });

  it("starts, pauses, resumes, and completes a session", () => {
    const planned = createSprintSession({
      goal: "Solve linear equations",
      subject: "Mathematics",
      topic: "Linear equations",
      durationMinutes: 25,
      breakMinutes: 5,
      date: "2026-10-24",
    });
    const started = startSprint(planned, 1_000);
    expect(started.status).toBe("running");
    expect(liveElapsedMs(started, 61_000)).toBe(60_000);
    const paused = pauseSprint(started, 61_000);
    expect(paused.status).toBe("paused");
    expect(paused.elapsedMs).toBe(60_000);
    const resumed = resumeSprint(paused, 80_000);
    expect(resumed.status).toBe("running");
    expect(remainingMs(resumed, 80_000)).toBe(24 * 60_000);
    const done = completeSprint(resumed, 90_000);
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBeTruthy();
  });

  it("opens a break when the focus block ends", () => {
    const started = startSprint(
      createSprintSession({ goal: "Revise current", durationMinutes: 15, date: "2026-10-24" }),
      0
    );
    const after = tickSprint(started, 15 * 60_000);
    expect(after.status).toBe("break");
    const finished = tickSprint(after, 15 * 60_000 + after.breakMinutes * 60_000);
    expect(finished.status).toBe("completed");
  });

  it("links the session back to the reader and quiz", () => {
    const session = createSprintSession({
      goal: "Circuits",
      subject: "Science",
      chapter: "Current",
      durationMinutes: 25,
    });
    expect(readerHref(session)).toContain("/reader?");
    expect(readerHref(session)).toContain("sprint=");
    expect(quizHref(session)).toContain("lens=test_me");
  });
});

describe("StudySprint persistence", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("keeps two students' sessions apart and restores unfinished work", () => {
    const open = startSprint(
      createSprintSession({ goal: "Page 2", durationMinutes: 25, date: "2026-10-24" }),
      1
    );
    writeSprintStore({ ...readSprintStore("user-a"), sessions: [open] }, "user-a");
    writeSprintStore(
      {
        ...readSprintStore("user-b"),
        sessions: [createSprintSession({ goal: "Other book", durationMinutes: 15, date: "2026-10-24" })],
      },
      "user-b"
    );
    expect(sprintStorageKey("user-a")).not.toBe(sprintStorageKey("user-b"));
    const a = readSprintStore("user-a");
    const b = readSprintStore("user-b");
    expect(activeSession(a.sessions)?.goal).toBe("Page 2");
    expect(pendingSessions(a.sessions, "2026-10-24")).toHaveLength(1);
    expect(b.sessions[0]?.goal).toBe("Other book");
    expect(studiedMinutesOnDate(a.sessions, "2026-10-24")).toBe(0);
  });
});
