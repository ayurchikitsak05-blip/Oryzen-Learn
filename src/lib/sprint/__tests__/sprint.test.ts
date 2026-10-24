import { afterEach, describe, expect, it } from "vitest";
import {
  attachSprintMaterial,
  completeSprint,
  createSprintSession,
  liveElapsedMs,
  pauseSprint,
  remainingMs,
  resumeSprint,
  startSprint,
  tickSprint,
} from "../engine";
import { listSprintNotes, saveSprintNote, sprintNotesKey } from "../notes";
import {
  activeSession,
  nearestDuration,
  nextRecommendedBlock,
  pendingSessions,
  quizHref,
  readerHref,
  resolveSprintPassage,
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

  it("uses an accelerated clock for focus, break, refresh, and navigation", () => {
    const started = startSprint(
      createSprintSession({ goal: "Page 1", durationMinutes: 15, breakMinutes: 5, date: "2026-10-24" }),
      0
    );
    const atFocusEnd = tickSprint(started, 15 * 60_000);
    expect(atFocusEnd.status).toBe("break");
    writeSprintStore({ ...readSprintStore("nav-user"), sessions: [atFocusEnd] }, "nav-user");
    const restored = readSprintStore("nav-user").sessions[0];
    expect(restored?.status).toBe("break");
    const afterNav = tickSprint(restored!, 15 * 60_000 + 5 * 60_000);
    expect(afterNav.status).toBe("completed");
    writeSprintStore({ ...readSprintStore("nav-user"), sessions: [afterNav] }, "nav-user");
    expect(readSprintStore("nav-user").sessions[0]?.status).toBe("completed");
    expect(nextRecommendedBlock([afterNav], 90, 25, "2026-10-24").minutes).toBe(25);
  });

  it("picks a quiz passage from the open sprint without a new highlight", () => {
    const session = attachSprintMaterial(
      createSprintSession({ goal: "Linear equations", subject: "Mathematics", durationMinutes: 25 }),
      { passageText: "ax + b = 0, where a is not zero.", pageNumber: 2, sectionHeading: "Linear equations" }
    );
    const chunk = resolveSprintPassage(session, [
      { text: "Other page", page_number: 1, section_heading: "Intro" },
      { text: "A linear equation has the form ax + b = 0, where a is not zero.", page_number: 2, section_heading: "Linear equations" },
    ]);
    expect(chunk?.page_number).toBe(2);
    expect(chunk?.text).toMatch(/ax \+ b = 0/);
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

  it("keeps sprint notes isolated per student", () => {
    const session = createSprintSession({ goal: "Notes check", durationMinutes: 25, date: "2026-10-24" });
    saveSprintNote({ session, kind: "session", title: "A note", body: "Only for A" }, "user-a");
    expect(listSprintNotes("user-a")[0]?.body).toMatch(/Only for A/);
    expect(listSprintNotes("user-b")).toHaveLength(0);
    expect(sprintNotesKey("user-a")).not.toBe(sprintNotesKey("user-b"));
  });
});
