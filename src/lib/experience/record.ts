import { readAllQuizProgress } from "@/lib/reader/quiz-progress";
import { readMarginNotes, readTextMarks } from "@/lib/reader/marks";
import { listLocalPdfDocuments } from "@/lib/reader/storage";
import { readLocalRoadmap } from "@/lib/roadmap/persist";
import type { RoadmapRecord, RoadmapSession } from "@/lib/roadmap/types";
import { studiedMinutesOnDate } from "@/lib/sprint/plan";
import { readSprintStore } from "@/lib/sprint/persist";

export interface LearningBook {
  id: string;
  title: string;
  createdAt: string;
}

export interface LearningNote {
  id: string;
  quote: string;
  createdAt: string;
}

export interface LearningQuiz {
  id: string;
  title: string;
  updatedAt: string;
  weakCount: number;
  completed: boolean;
}

export interface CompletedStudySession {
  id: string;
  completedAt: string;
  kind: string;
  subjectName: string;
  chapterName: string;
}

export interface LearningSubject {
  id: string;
  name: string;
  chapters: { id: string; name: string; completed: boolean }[];
}

export interface LearningRecord {
  books: LearningBook[];
  notes: LearningNote[];
  highlightCount: number;
  roadmap: {
    examName: string;
    examDate: string;
    updatedAt: string;
    subjects: LearningSubject[];
    completedSessions: CompletedStudySession[];
    plannedStudyCount: number;
  } | null;
  sprintDays: { date: string; minutes: number }[];
  quizzes: LearningQuiz[];
}

export const EMPTY_LEARNING_RECORD: LearningRecord = {
  books: [],
  notes: [],
  highlightCount: 0,
  roadmap: null,
  sprintDays: [],
  quizzes: [],
};

function sessionLookup(record: RoadmapRecord): Map<string, RoadmapSession> {
  const sessions = new Map<string, RoadmapSession>();
  for (const day of record.plan?.days ?? []) {
    for (const session of day.sessions ?? []) sessions.set(session.id, session);
  }
  return sessions;
}

export function learningRecordFromParts(input: {
  books?: LearningBook[];
  notes?: LearningNote[];
  highlightCount?: number;
  roadmap?: RoadmapRecord | null;
  sprintSessions?: { date: string; elapsedMs: number }[];
  quizzes?: LearningQuiz[];
}): LearningRecord {
  const roadmap = input.roadmap ?? null;
  const lookup = roadmap ? sessionLookup(roadmap) : new Map<string, RoadmapSession>();
  const completedSessions: CompletedStudySession[] = [];
  if (roadmap) {
    for (const [id, completion] of Object.entries(roadmap.completions ?? {})) {
      const session = lookup.get(id);
      completedSessions.push({
        id,
        completedAt: completion.completedAt,
        kind: session?.kind ?? "study",
        subjectName: session?.subjectName ?? "",
        chapterName: session?.chapterName ?? "",
      });
    }
  }
  const plannedStudyCount = roadmap
    ? [...lookup.values()].filter((session) => session.kind === "study" || session.kind === "revision" || session.kind === "practice_test").length
    : 0;
  const byDate = new Map<string, number>();
  for (const session of input.sprintSessions ?? []) {
    if (!session.date) continue;
    const minutes = Math.floor(Math.max(0, session.elapsedMs) / 60_000);
    byDate.set(session.date, (byDate.get(session.date) ?? 0) + minutes);
  }
  return {
    books: input.books ?? [],
    notes: input.notes ?? [],
    highlightCount: input.highlightCount ?? 0,
    roadmap: roadmap
      ? {
          examName: roadmap.intake.examName,
          examDate: roadmap.intake.examDate,
          updatedAt: roadmap.updatedAt,
          subjects: (roadmap.intake.subjects ?? []).map((subject) => ({
            id: subject.id,
            name: subject.name,
            chapters: (subject.chapters ?? []).map((chapter) => ({
              id: chapter.id,
              name: chapter.name,
              completed: chapter.completed === true,
            })),
          })),
          completedSessions,
          plannedStudyCount,
        }
      : null,
    sprintDays: [...byDate.entries()].map(([date, minutes]) => ({ date, minutes })),
    quizzes: input.quizzes ?? [],
  };
}

export async function readLearningRecord(userId: string | null): Promise<LearningRecord> {
  const books = await listLocalPdfDocuments().catch(() => []);
  const notes = readMarginNotes(userId);
  const roadmap = readLocalRoadmap(userId);
  const sprint = readSprintStore(userId);
  const dates = [...new Set(sprint.sessions.map((session) => session.date).filter(Boolean))];
  return learningRecordFromParts({
    books: books.map((book) => ({ id: book.id, title: book.title, createdAt: book.createdAt })),
    notes: notes.map((note) => ({ id: note.id, quote: note.quote, createdAt: note.createdAt })),
    highlightCount: readTextMarks(userId).length,
    roadmap,
    sprintSessions: dates.map((date) => ({
      date,
      elapsedMs: studiedMinutesOnDate(sprint.sessions, date) * 60_000,
    })),
    quizzes: readAllQuizProgress(userId).map((quiz) => ({
      id: `${quiz.documentId}:${quiz.pageNumber}:${quiz.selectionKey}`,
      title: quiz.documentTitle || "Saved quiz",
      updatedAt: quiz.updatedAt,
      weakCount: quiz.weakConcepts.length,
      completed: quiz.completed,
    })),
  });
}
