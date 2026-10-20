import { describe, expect, it } from "vitest";
import {
  beginFocus,
  catchUpSchedule,
  createIdleSchedule,
  resetSchedule,
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
});
