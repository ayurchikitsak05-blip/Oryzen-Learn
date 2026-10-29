import {
  DEFAULT_COMPANION_PREFS,
  STARTER_COMPANIONS,
  writeCompanionStore,
  type CompanionStore,
} from "@/lib/companion";
import { writeExperiencePrefs } from "@/lib/experience/persist";
import { evaluateLearning } from "@/lib/experience/rewards";
import { EMPTY_LEARNING_RECORD } from "@/lib/experience/record";
import { writeLearningWorld, type LearningWorld } from "@/lib/experience/world";
import { DEFAULT_SPRINT_STORE, type SprintSession, type SprintStore } from "@/lib/sprint/types";
import { writeSprintStore } from "@/lib/sprint/persist";
import { PUBLIC_DEMO_DISPLAY_NAME } from "@/lib/demo/public-demo";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function demoSprint(input: {
  id: string;
  goal: string;
  subject: string;
  topic: string;
  title: string;
  date: string;
  elapsedMs: number;
}): SprintSession {
  return {
    id: input.id,
    goal: input.goal,
    subject: input.subject,
    topic: input.topic,
    documentId: "",
    documentTitle: input.title,
    chapter: input.topic,
    durationMinutes: 25,
    breakMinutes: 5,
    dailyTargetMinutes: 90,
    status: "completed",
    elapsedMs: input.elapsedMs,
    startedAt: `${input.date}T10:00:00.000Z`,
    completedAt: `${input.date}T10:25:00.000Z`,
    date: input.date,
    quizLinked: false,
    notesLinked: false,
    passageText: "",
    pageNumber: 1,
    sectionHeading: input.topic,
  };
}

export function buildDemoCompanionStore(): CompanionStore {
  return {
    version: 1,
    prefs: {
      ...DEFAULT_COMPANION_PREFS,
      name: "Aarav",
      style: "buddy",
      character: "leaf",
      onboarded: true,
    },
    activeId: "buddy",
    collection: STARTER_COMPANIONS.map((member) => ({ ...member })),
    turns: [
      {
        id: "turn-demo-open",
        role: "companion",
        mocked: true,
        text: `Aarav here — welcome, ${PUBLIC_DEMO_DISPLAY_NAME}. This is a fictional study space. Replies stay simulated.`,
        createdAt: `${todayKey()}T08:30:00.000Z`,
      },
    ],
  };
}

export function buildDemoSprintStore(): SprintStore {
  return {
    ...DEFAULT_SPRINT_STORE,
    sessions: [
      demoSprint({
        id: "sprint-demo-1",
        goal: "Review Work and Energy",
        subject: "Science",
        topic: "Work and Energy",
        title: "Science — Work and Energy (demo)",
        date: daysAgo(2),
        elapsedMs: 25 * 60_000,
      }),
      demoSprint({
        id: "sprint-demo-2",
        goal: "Triangle practice",
        subject: "Mathematics",
        topic: "Triangles",
        title: "Mathematics — Triangle (demo)",
        date: daysAgo(1),
        elapsedMs: 35 * 60_000,
      }),
      demoSprint({
        id: "sprint-demo-3",
        goal: "Short revision",
        subject: "Science",
        topic: "Work and Energy",
        title: "Science — Work and Energy (demo)",
        date: todayKey(),
        elapsedMs: 20 * 60_000,
      }),
    ],
  };
}

export function buildDemoWorld(userId: string): LearningWorld {
  const evaluation = evaluateLearning(EMPTY_LEARNING_RECORD, todayKey());
  return {
    version: 1,
    ownerId: userId,
    petName: "Pebble",
    petAccessory: "none",
    companionAccessory: "none",
    background: "paper",
    desk: "plain",
    wall: "clear",
    placedStickerIds: [],
    shownBadgeIds: [],
    selectedTitleId: null,
    favoriteStickerId: null,
    readiness: [{ date: todayKey(), feeling: "focused" }],
  };
}

/** Writes fictional study data into the already-unlocked visitor vault. */
export function seedDemoWorkspace(userId: string): void {
  writeCompanionStore(buildDemoCompanionStore(), userId);
  writeSprintStore(buildDemoSprintStore(), userId);
  const evaluation = evaluateLearning(EMPTY_LEARNING_RECORD, todayKey());
  writeLearningWorld(buildDemoWorld(userId), userId, evaluation);
  writeExperiencePrefs({
    version: 1,
    ownerId: userId,
    experience: "studio",
    usePrakritiAccent: false,
    decorations: true,
    animations: true,
    rewards: true,
  });
}
