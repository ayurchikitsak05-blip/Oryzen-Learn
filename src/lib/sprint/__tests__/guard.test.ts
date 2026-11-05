import { describe, expect, it } from "vitest";
import { createSprintSession, startSprint } from "../engine";
import { applyAway, AWAY_THRESHOLD_MS, creditAwayTime, effectiveLeftAt, minutesLabel } from "../guard";

const T0 = Date.parse("2026-11-05T10:00:00Z");

function running() {
  return startSprint(createSprintSession({ goal: "Read ch 4", durationMinutes: 25 }), T0);
}

describe("distraction guard", () => {
  it("pauses the sprint from the moment the student left, when away a minute or more", () => {
    const leftAt = T0 + 7 * 60_000;
    const outcome = applyAway(running(), leftAt, leftAt + 6 * 60_000);
    expect(outcome?.paused.status).toBe("paused");
    expect(outcome?.paused.elapsedMs).toBe(7 * 60_000);
    expect(outcome?.awayMs).toBe(6 * 60_000);
    expect(outcome?.remainingMs).toBe(18 * 60_000);
    expect(minutesLabel(outcome!.awayMs)).toBe("6 minutes");
  });

  it("ignores short trips, paused sprints, and sprints that ran out while away", () => {
    expect(applyAway(running(), T0 + 60_000, T0 + 60_000 + AWAY_THRESHOLD_MS - 1)).toBeNull();
    expect(applyAway({ ...running(), status: "paused", startedAt: null }, T0, T0 + 10 * 60_000)).toBeNull();
    expect(applyAway(running(), T0 + 26 * 60_000, T0 + 40 * 60_000)).toBeNull();
    expect(applyAway(null, T0, T0 + 10 * 60_000)).toBeNull();
  });

  it("'I was studying' gives the away time back, never past the end", () => {
    const outcome = applyAway(running(), T0 + 5 * 60_000, T0 + 11 * 60_000)!;
    expect(creditAwayTime(outcome.paused, outcome.awayMs).elapsedMs).toBe(11 * 60_000);
    expect(creditAwayTime(outcome.paused, 60 * 60_000).elapsedMs).toBe(25 * 60_000 - 1_000);
  });

  it("time spent in another ORYZEN tab isn't counted as away", () => {
    const hidden = T0 + 60_000;
    expect(effectiveLeftAt(hidden, hidden + 9 * 60_000, hidden + 10 * 60_000)).toBe(hidden + 9 * 60_000);
    expect(effectiveLeftAt(hidden, hidden - 3_000, hidden + 10 * 60_000)).toBe(hidden);
    expect(effectiveLeftAt(hidden, hidden + 99 * 60_000, hidden + 10 * 60_000)).toBe(hidden);
  });
});
