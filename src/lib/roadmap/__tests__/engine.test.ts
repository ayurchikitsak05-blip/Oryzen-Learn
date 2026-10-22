import { describe, expect, it } from "vitest";
import { canUseRoadmap, ROADMAP_ACCESS } from "../access";
import { defaultIntake, defaultSubjects } from "../defaults";
import { adjustSession, moveSession } from "../edit";
import {
  allowedIntervals,
  buildRoadmapPlan,
  chapterPriority,
  daysInRange,
  detectMissedDates,
  horizonSpanDays,
  planExclusiveEnd,
  planProgress,
  workSessions,
} from "../engine";
import { roadmapStudyLinks } from "../hooks";
import { applyReplan, proposeReplan } from "../replan";
import { overlapsSleep } from "../time";
import type { RoadmapIntake, RoadmapRecord } from "../types";

const TODAY = "2026-11-02";
const EXAM_60 = "2027-01-01";

function sixtyDayIntake(overrides: Partial<RoadmapIntake> = {}): RoadmapIntake {
  return {
    ...defaultIntake(EXAM_60),
    ...overrides,
    examDate: overrides.examDate ?? EXAM_60,
    subjects: overrides.subjects ?? defaultSubjects(),
    dailyHours: overrides.dailyHours ?? 3,
  };
}

function recordFrom(intake: RoadmapIntake, today = TODAY): RoadmapRecord {
  const plan = buildRoadmapPlan(intake, today);
  return {
    version: 1,
    id: "roadmap-test",
    userId: "user-test",
    intake,
    plan,
    completions: {},
    updatedAt: `${today}T00:00:00.000Z`,
  };
}

describe("roadmap access", () => {
  it("lets already-entitled students use the planner without a price lock", () => {
    expect(ROADMAP_ACCESS.enabled).toBe(true);
    expect(canUseRoadmap("free")).toBe(true);
    expect(canUseRoadmap("active_paid")).toBe(true);
    expect(canUseRoadmap("class_sponsored")).toBe(true);
    expect(canUseRoadmap("trial")).toBe(true);
    expect(canUseRoadmap("none")).toBe(false);
    expect(JSON.stringify(ROADMAP_ACCESS)).not.toMatch(/199/);
  });
});

describe("roadmap scheduling engine", () => {
  it("plans a 60-day exam for Mathematics, Science, and English at 3h/day", () => {
    const plan = buildRoadmapPlan(sixtyDayIntake(), TODAY);
    const work = workSessions(plan.days.flatMap((day) => day.sessions));
    const subjects = new Set(work.map((session) => session.subjectName));

    expect(plan.days).toHaveLength(60);
    expect(plan.weeks.length).toBeGreaterThan(7);
    expect(plan.months.map((month) => month.yearMonth)).toEqual(["2026-11", "2026-12"]);
    expect(plan.days[0].date).toBe(TODAY);
    expect(plan.days[0].kind).toBe("study");
    expect(subjects.has("Mathematics")).toBe(true);
    expect(subjects.has("Science")).toBe(true);
    expect(subjects.has("English")).toBe(true);
    expect(work.some((session) => session.kind === "study")).toBe(true);
    expect(work.some((session) => session.kind === "revision")).toBe(true);
    expect(work.some((session) => session.kind === "practice_test")).toBe(true);
    expect(plan.days.some((day) => day.kind === "buffer")).toBe(true);
    expect(plan.overflow.fits).toBe(true);
    expect(plan.overflow.unscheduledMinutes).toBe(0);

    const firstDayStudy = workSessions(plan.days[0].sessions).reduce(
      (sum, session) => sum + session.minutes,
      0
    );
    expect(firstDayStudy).toBeGreaterThan(0);
    expect(firstDayStudy).toBeLessThanOrEqual(180);
  });

  it("prioritizes harder, heavier, more important leftover work first", () => {
    const urgent = chapterPriority({
      remainingMinutes: 180,
      difficulty: 5,
      examImportance: 5,
      daysUntilExam: 10,
    });
    const easy = chapterPriority({
      remainingMinutes: 60,
      difficulty: 1,
      examImportance: 2,
      daysUntilExam: 10,
    });
    expect(urgent).toBeGreaterThan(easy);

    const plan = buildRoadmapPlan(sixtyDayIntake(), TODAY);
    const firstStudy = workSessions(plan.days[0].sessions).find((session) => session.kind === "study");
    expect(firstStudy?.subjectName === "Mathematics" || firstStudy?.subjectName === "Science").toBe(
      true
    );
  });

  it("never places sessions inside the configured sleep window", () => {
    const intake = sixtyDayIntake({
      preferredStudyHours: { startMinutes: 20 * 60, endMinutes: 23 * 60 + 30 },
      sleepWindow: { startMinutes: 22 * 60, endMinutes: 6 * 60 },
    });
    const plan = buildRoadmapPlan(intake, TODAY);
    const sessions = plan.days.flatMap((day) => day.sessions);
    expect(sessions.length).toBeGreaterThan(0);
    for (const session of sessions) {
      expect(
        overlapsSleep(session.startMinutes, session.endMinutes, intake.sleepWindow)
      ).toBe(false);
      expect(session.endMinutes).toBeLessThanOrEqual(22 * 60);
    }
    const allowed = allowedIntervals(TODAY, intake);
    expect(allowed[0]?.end).toBe(22 * 60);
  });

  it("warns honestly when the syllabus cannot fit before the exam", () => {
    const intake = sixtyDayIntake({
      examDate: "2026-11-04",
      dailyHours: 1,
    });
    const plan = buildRoadmapPlan(intake, TODAY);
    expect(plan.days).toHaveLength(2);
    expect(plan.overflow.fits).toBe(false);
    expect(plan.overflow.unscheduledMinutes).toBeGreaterThan(0);
    expect(plan.overflow.unscheduledChapters.length).toBeGreaterThan(0);
    expect(plan.overflow.message).toMatch(/more than your calendar allows/i);
    expect(plan.overflow.neededStudyMinutes).toBeGreaterThan(plan.overflow.availableStudyMinutes);
  });

  it("rebuilds unfinished work after missed days without using a model", () => {
    const intake = sixtyDayIntake();
    const current = recordFrom(intake);
    const missed = current.plan.days[0].date;
    const missedMinutes = workSessions(current.plan.days[0].sessions)
      .filter((session) => session.kind === "study")
      .reduce((sum, session) => sum + session.minutes, 0);
    expect(missedMinutes).toBeGreaterThan(0);

    const proposal = proposeReplan(current, {
      today: "2026-11-03",
      missedDates: [missed],
    });
    expect(proposal.missedDates).toContain(missed);
    expect(proposal.recoveredMinutes).toBeGreaterThanOrEqual(missedMinutes);
    expect(proposal.proposed.plan.days[0].date).toBe("2026-11-03");
    expect(proposal.proposed.plan.overflow.fits).toBe(true);

    const applied = applyReplan(current, proposal);
    expect(applied.plan.days.some((day) => day.date === missed)).toBe(false);
    const remainingStudy = workSessions(applied.plan.days.flatMap((day) => day.sessions))
      .filter((session) => session.kind === "study")
      .reduce((sum, session) => sum + session.minutes, 0);
    expect(remainingStudy).toBeGreaterThanOrEqual(missedMinutes);
  });

  it("keeps a student confirmation step separate from applying the replan", () => {
    const current = recordFrom(sixtyDayIntake());
    const proposal = proposeReplan(current, {
      today: TODAY,
      missedDates: [TODAY],
      intakeOverrides: { dailyHours: 2 },
    });
    expect(proposal.proposed.intake.dailyHours).toBe(2);
    expect(current.intake.dailyHours).toBe(3);
    expect(current.plan.days).toHaveLength(60);
  });

  it("moves and resizes sessions, but refuses a sleep-window slot", () => {
    const current = recordFrom(sixtyDayIntake());
    const first = workSessions(current.plan.days[0].sessions)[0];
    expect(first).toBeTruthy();
    const laterDate = current.plan.days[2].date;
    const moved = moveSession(current, first.id, laterDate, 17 * 60);
    expect(moved.warning).toBeNull();
    expect(
      moved.record.plan.days
        .find((day) => day.date === laterDate)
        ?.sessions.some((session) => session.id === first.id)
    ).toBe(true);

    const sleepMove = moveSession(current, first.id, laterDate, 23 * 60);
    expect(sleepMove.warning).toMatch(/sleep window/i);
    expect(sleepMove.record).toBe(current);

    const resized = adjustSession(moved.record, first.id, 35);
    expect(resized.warning).toBeNull();
    const updated = resized.record.plan.days
      .flatMap((day) => day.sessions)
      .find((session) => session.id === first.id);
    expect(updated?.minutes).toBe(35);
    expect(updated?.endMinutes).toBe((updated?.startMinutes ?? 0) + 35);
  });

  it("tracks daily completion progress and missed days", () => {
    const current = recordFrom(sixtyDayIntake());
    const first = workSessions(current.plan.days[0].sessions)[0];
    current.completions[first.id] = { completedAt: `${TODAY}T10:00:00.000Z` };
    const progress = planProgress(current.plan, current.completions);
    expect(progress.completedWork).toBe(1);
    expect(progress.percent).toBeGreaterThan(0);
    expect(detectMissedDates(current.plan, current.completions, "2026-11-03")).toEqual([TODAY]);
  });

  it("exposes reader, notes, Test Me, and weak-concept hooks", () => {
    const links = roadmapStudyLinks({ subjectName: "Mathematics", chapterName: "Algebra" });
    expect(links.reader).toBe("/reader?subject=Mathematics&chapter=Algebra");
    expect(links.notes).toBe("/notes?subject=Mathematics&chapter=Algebra");
    expect(links.testMe).toContain("lens=test_me");
    expect(links.weakConcepts).toContain("view=weak");
  });

  it("clamps custom, monthly, and weekly horizons to the exam date", () => {
    expect(horizonSpanDays({ kind: "until_exam" })).toBeNull();
    expect(horizonSpanDays({ kind: "days_30" })).toBe(30);
    expect(horizonSpanDays({ kind: "days_60" })).toBe(60);
    expect(horizonSpanDays({ kind: "days_90" })).toBe(90);
    expect(horizonSpanDays({ kind: "weekly_rolling" })).toBe(7);
    expect(horizonSpanDays({ kind: "custom", customDays: 14 })).toBe(14);
    expect(planExclusiveEnd(TODAY, EXAM_60, { kind: "custom", customDays: 14 })).toBe(
      "2026-11-16"
    );
    expect(planExclusiveEnd(TODAY, "2026-11-10", { kind: "days_30" })).toBe("2026-11-10");

    const custom = buildRoadmapPlan(
      sixtyDayIntake({ examName: "Board exam", horizon: { kind: "custom", customDays: 14 } }),
      TODAY
    );
    expect(custom.days).toHaveLength(14);
    expect(custom.examDate).toBe(EXAM_60);
    expect(daysInRange(custom.days, TODAY, "2026-11-08")).toHaveLength(7);

    const week = buildRoadmapPlan(sixtyDayIntake({ horizon: { kind: "weekly_rolling" } }), TODAY);
    expect(week.days).toHaveLength(7);

    const tight = buildRoadmapPlan(
      sixtyDayIntake({ horizon: { kind: "custom", customDays: 7 }, dailyHours: 3 }),
      TODAY
    );
    expect(tight.days).toHaveLength(7);
    expect(tight.overflow.fits).toBe(false);
    expect(tight.overflow.unscheduledMinutes).toBeGreaterThan(0);
  });
});
