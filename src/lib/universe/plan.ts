import { nearestDuration } from "@/lib/sprint/plan";
import { UNIVERSE_PRESETS } from "./presets";
import type { DayPlan, DayPlanBlock, DayPlanKind, UniversePrefs } from "./types";

function clampGoal(minutes: number): number {
  return Math.min(360, Math.max(15, Math.round(Number.isFinite(minutes) ? minutes : 90)));
}

function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function pushBlock(
  blocks: DayPlanBlock[],
  kind: DayPlanKind,
  label: string,
  minutes: number,
  offset: { value: number }
): void {
  const size = Math.max(1, Math.round(minutes));
  blocks.push({
    id: `${kind}-${blocks.length + 1}`,
    kind,
    label,
    minutes: size,
    startOffsetMinutes: offset.value,
  });
  offset.value += size;
}

/**
 * Daily goal is study time (focus + revision + quiz). Breaks and buffer sit around it
 * so the student does not have to pick every interval by hand.
 */
export function buildDayPlan(input: {
  prefs: UniversePrefs;
  date?: string;
  now?: Date;
  missedRescheduled?: boolean;
}): DayPlan {
  const dailyGoalMinutes = clampGoal(input.prefs.dailyGoalMinutes);
  const focusLen = nearestDuration(input.prefs.sessionMinutes);
  const breakLen = Math.min(15, Math.max(3, input.prefs.breakMinutes));
  const quizLen = dailyGoalMinutes >= 40 ? 5 : 0;
  const revisionLen = Math.min(20, Math.max(8, Math.round(focusLen * 0.4)));
  const studyForChecks = quizLen + (dailyGoalMinutes >= 30 ? revisionLen : 0);
  let focusBudget = Math.max(focusLen, dailyGoalMinutes - studyForChecks);

  const blocks: DayPlanBlock[] = [];
  const offset = { value: 0 };
  let focusIndex = 0;

  while (focusBudget > 0) {
    const nextFocus = Math.min(focusLen, focusBudget);
    focusIndex += 1;
    pushBlock(blocks, "focus", `Focus ${focusIndex}`, nextFocus, offset);
    focusBudget -= nextFocus;
    const remainingStudy = focusBudget + studyForChecks;
    if (focusBudget > 0) {
      pushBlock(blocks, "break", "Break", breakLen, offset);
    }
    if (quizLen && remainingStudy === studyForChecks) {
      pushBlock(blocks, "quiz", "Quiz checkpoint", quizLen, offset);
    }
  }

  if (dailyGoalMinutes >= 30) {
    if (blocks.at(-1)?.kind === "focus") {
      pushBlock(blocks, "break", "Break", breakLen, offset);
    }
    if (!blocks.some((block) => block.kind === "quiz") && quizLen) {
      pushBlock(blocks, "quiz", "Quiz checkpoint", quizLen, offset);
    }
    pushBlock(blocks, "revision", "Revision", revisionLen, offset);
  }

  const buffer = dailyGoalMinutes >= 90 ? 10 : 5;
  pushBlock(blocks, "buffer", "Buffer", buffer, offset);

  const nextSuggestedSession = input.missedRescheduled
    ? `Later today — remaining ${dailyGoalMinutes} minutes, with extra buffer.`
    : `Next suggested session: another ${focusLen}-minute focus after this plan.`;

  return {
    date: input.date ?? todayKey(input.now),
    dailyGoalMinutes,
    profileId: input.prefs.profileId,
    blocks,
    nextSuggestedSession,
    missedRescheduled: Boolean(input.missedRescheduled),
  };
}

export function rescheduleMissedPlan(input: {
  prefs: UniversePrefs;
  previous?: DayPlan | null;
  now?: Date;
}): DayPlan {
  const previous = input.previous;
  const remaining = previous
    ? previous.blocks
        .filter((block) => block.kind === "focus" || block.kind === "revision" || block.kind === "quiz")
        .reduce((sum, block) => sum + block.minutes, 0)
    : input.prefs.dailyGoalMinutes;
  return buildDayPlan({
    prefs: {
      ...input.prefs,
      dailyGoalMinutes: Math.max(15, remaining),
    },
    now: input.now,
    missedRescheduled: true,
  });
}

export function planStudyMinutes(plan: DayPlan): number {
  return plan.blocks
    .filter((block) => block.kind === "focus" || block.kind === "revision" || block.kind === "quiz")
    .reduce((sum, block) => sum + block.minutes, 0);
}

export function recommendedPresetLabel(profileId: UniversePrefs["profileId"]): string {
  return UNIVERSE_PRESETS[profileId].modernName;
}
