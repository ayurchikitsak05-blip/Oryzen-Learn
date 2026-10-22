import { createId } from "./defaults";
import { buildRoadmapPlan, detectMissedDates, workSessions } from "./engine";
import { formatHours } from "./time";
import type {
  ReplanProposal,
  ReplanRequest,
  RoadmapChapter,
  RoadmapIntake,
  RoadmapRecord,
} from "./types";

function cloneIntake(intake: RoadmapIntake): RoadmapIntake {
  return structuredClone(intake);
}

function remainingFromPlan(
  record: RoadmapRecord,
  missedDates: Set<string>,
  unfinishedChapterIds?: string[]
): Map<string, number> {
  const leftover = new Map<string, number>();
  const unfinished = unfinishedChapterIds ? new Set(unfinishedChapterIds) : null;

  for (const subject of record.intake.subjects) {
    for (const chapter of subject.chapters) {
      leftover.set(chapter.id, 0);
    }
  }

  for (const day of record.plan.days) {
    for (const session of workSessions(day.sessions)) {
      if (session.kind !== "study" || !session.chapterId) continue;
      if (unfinished && !unfinished.has(session.chapterId)) continue;
      const done = Boolean(record.completions[session.id]);
      const missed = missedDates.has(session.date);
      if (!done || missed) {
        leftover.set(session.chapterId, (leftover.get(session.chapterId) ?? 0) + session.minutes);
      }
    }
  }

  return leftover;
}

function applyRemaining(intake: RoadmapIntake, leftover: Map<string, number>): RoadmapIntake {
  const next = cloneIntake(intake);
  next.subjects = next.subjects.map((subject) => ({
    ...subject,
    chapters: subject.chapters.map((chapter): RoadmapChapter => {
      const remaining = leftover.get(chapter.id);
      if (remaining == null) return chapter;
      return {
        ...chapter,
        remainingMinutes: remaining,
        completed: remaining <= 0,
      };
    }),
  }));
  return next;
}

export function proposeReplan(record: RoadmapRecord, request: ReplanRequest): ReplanProposal {
  const autoMissed = detectMissedDates(record.plan, record.completions, request.today);
  const missedDates = [...new Set([...autoMissed, ...request.missedDates])].sort();
  const leftover = remainingFromPlan(record, new Set(missedDates), request.unfinishedChapterIds);
  const recoveredMinutes = [...leftover.values()].reduce((sum, value) => sum + value, 0);

  const intake = applyRemaining(
    {
      ...cloneIntake(record.intake),
      ...request.intakeOverrides,
    },
    leftover
  );

  const plan = buildRoadmapPlan(intake, request.today);
  const proposed: RoadmapRecord = {
    version: 1,
    id: record.id || createId("roadmap"),
    userId: record.userId,
    intake,
    plan,
    completions: {},
    updatedAt: `${request.today}T00:00:00.000Z`,
  };

  const sessionCountBefore = workSessions(record.plan.days.flatMap((day) => day.sessions)).length;
  const sessionCountAfter = workSessions(plan.days.flatMap((day) => day.sessions)).length;
  const missedLabel =
    missedDates.length === 0
      ? "No missed days were carried forward."
      : `${missedDates.length} missed day${missedDates.length === 1 ? "" : "s"} will be rebuilt.`;

  return {
    proposed,
    missedDates,
    recoveredMinutes,
    sessionCountBefore,
    sessionCountAfter,
    overflow: plan.overflow,
    summary: [
      missedLabel,
      `${formatHours(recoveredMinutes)} of unfinished work is being placed again.`,
      plan.overflow.fits ? "The rebuilt plan still fits before the exam." : plan.overflow.message,
    ].join(" "),
  };
}

export function applyReplan(record: RoadmapRecord, proposal: ReplanProposal): RoadmapRecord {
  return {
    ...proposal.proposed,
    id: record.id,
    userId: record.userId,
    updatedAt: proposal.proposed.updatedAt,
  };
}
