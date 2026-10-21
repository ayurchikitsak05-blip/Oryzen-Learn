import { describe, expect, it } from "vitest";
import {
  beginFocus,
  catchUpSchedule,
  createIdleSchedule,
  extendPhase,
  pauseSchedule,
  resetSchedule,
  resumeSchedule,
  skipPhase,
} from "../scheduler";

describe("study scheduler", () => {
  it("opens a break alert when a focus block ends", () => {
    const started = beginFocus(
      createIdleSchedule({ goalMinutes: 60, focusMinutes: 20, breakMinutes: 10 }),
      0
    );
    const result = catchUpSchedule(started, 20 * 60_000);
    expect(result.alert).toBe("break");
    expect(result.schedule.phase).toBe("break");
    expect(result.schedule.focusedMs).toBe(20 * 60_000);
    expect(result.schedule.phaseEndsAt).toBe(30 * 60_000);
  });

  it("alerts to resume when the break ends", () => {
    const onBreak = catchUpSchedule(
      beginFocus(
        createIdleSchedule({ goalMinutes: 60, focusMinutes: 20, breakMinutes: 10 }),
        0
      ),
      20 * 60_000
    ).schedule;
    const result = catchUpSchedule(onBreak, 30 * 60_000);
    expect(result.alert).toBe("resume");
    expect(result.schedule.phase).toBe("focus");
    expect(result.schedule.phaseEndsAt).toBe(50 * 60_000);
  });

  it("completes the session when focused time reaches the goal", () => {
    const started = beginFocus(
      createIdleSchedule({ goalMinutes: 30, focusMinutes: 30, breakMinutes: 5 }),
      0
    );
    const result = catchUpSchedule(started, 30 * 60_000);
    expect(result.alert).toBe("goal");
    expect(result.schedule.phase).toBe("complete");
  });

  it("catches up across a missed break into the next focus block", () => {
    const started = beginFocus(
      createIdleSchedule({ goalMinutes: 120, focusMinutes: 20, breakMinutes: 10 }),
      0
    );
    const result = catchUpSchedule(started, 30 * 60_000);
    expect(result.alert).toBe("resume");
    expect(result.schedule.phase).toBe("focus");
    expect(result.schedule.focusedMs).toBe(20 * 60_000);
  });

  it("clears a running session back to idle", () => {
    const started = beginFocus(createIdleSchedule(), 1_000);
    const reset = resetSchedule(started);
    expect(reset.phase).toBe("idle");
    expect(reset.focusedMs).toBe(0);
    expect(reset.phaseEndsAt).toBeNull();
  });

  it("pauses the local timer and can resume, skip, or extend", () => {
    const started = beginFocus(
      createIdleSchedule({ goalMinutes: 60, focusMinutes: 20, breakMinutes: 10 }),
      0
    );
    const paused = pauseSchedule(started, 5 * 60_000);
    expect(paused.pausedRemainingMs).toBe(15 * 60_000);
    expect(catchUpSchedule(paused, 40 * 60_000).alert).toBeNull();
    const resumed = resumeSchedule(paused, 8 * 60_000);
    expect(resumed.phaseEndsAt).toBe(23 * 60_000);
    const skipped = skipPhase(started, 4 * 60_000);
    expect(skipped.phase).toBe("break");
    const extended = extendPhase(started, 5, 0);
    expect(extended.phaseEndsAt).toBe(25 * 60_000);
  });
});
