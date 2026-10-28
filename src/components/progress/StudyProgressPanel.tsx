"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { listSavedPassages } from "@/lib/ai/passage-store";
import { planProgress } from "@/lib/roadmap/engine";
import { readLocalRoadmap } from "@/lib/roadmap/persist";
import { readMarginNotes, readTextMarks } from "@/lib/reader/marks";
import { readAllQuizProgress } from "@/lib/reader/quiz-progress";
import { listLocalPdfDocuments } from "@/lib/reader/storage";
import { activeSession, studiedMinutesOnDate, todayKey } from "@/lib/sprint/plan";
import { readSprintStore } from "@/lib/sprint/persist";
import { readVideoCaptionNotes } from "@/lib/video/caption-notes-store";
import { readDayPlan } from "@/lib/universe/persist";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { isAccountVaultUnlocked } from "@/lib/privacy/account-vault";
import {
  EMPTY_STUDY_PROGRESS,
  studyProgressIsEmpty,
  studyProgressLines,
  type StudyProgressFacts,
} from "@/lib/progress/snapshot";
import { ui } from "@/components/ui/classes";

type ProgressStatus = "loading" | "signed-out" | "locked" | "ready";

function uniqueMisses(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const misses: string[] = [];
  for (const value of values) {
    const text = value.replace(/\s+/g, " ").trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    misses.push(text);
    if (misses.length === 8) break;
  }
  return misses;
}

export function StudyProgressPanel({ userId }: { userId: string }) {
  const [status, setStatus] = useState<ProgressStatus>("loading");
  const [facts, setFacts] = useState<StudyProgressFacts>(EMPTY_STUDY_PROGRESS);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const user = await fetchSignedInUser();
          const unlocked = isAccountVaultUnlocked();
          if (!user && !unlocked) {
            if (!cancelled) setStatus("signed-out");
            return;
          }
          if (user && !unlocked) {
            if (!cancelled) setStatus("locked");
            return;
          }
          const scope = user?.userId ?? userId;
          const date = todayKey();
          const sprint = readSprintStore(scope);
          const dayPlan = readDayPlan(scope);
          const roadmap = readLocalRoadmap(scope);
          const plan = roadmap ? planProgress(roadmap.plan, roadmap.completions) : null;
          const quizzes = readAllQuizProgress(scope);
          const active = activeSession(sprint.sessions);
          const books = await listLocalPdfDocuments();
          if (cancelled) return;
          setFacts({
            books: books.map((book) => book.title).filter(Boolean),
            todayMinutes: studiedMinutesOnDate(sprint.sessions, date),
            dailyGoalMinutes:
              dayPlan?.dailyGoalMinutes ??
              (sprint.sessions.length > 0 ? sprint.dailyTargetMinutes : null),
            sprintCount: sprint.sessions.length,
            completedSprints: sprint.sessions.filter((session) => session.status === "completed").length,
            openSprintLabel: active?.goal?.trim() || null,
            highlightCount: readTextMarks(scope).length,
            marginNoteCount: readMarginNotes(scope).length,
            savedPassageCount: listSavedPassages(undefined, scope).length,
            quizzesCompleted: quizzes.filter((quiz) => quiz.completed).length,
            quizzesStarted: quizzes.length,
            weakConcepts: uniqueMisses(quizzes.flatMap((quiz) => quiz.weakConcepts ?? [])),
            captionLectureCount: user?.userId ? readVideoCaptionNotes(user.userId).length : 0,
            planCompleted: plan ? plan.completedWork : null,
            planTotal: plan ? plan.totalWork : null,
            savedDailyGoal: dayPlan?.dailyGoalMinutes ?? null,
            examDate: roadmap?.intake.examDate ?? null,
          });
          setStatus("ready");
        } catch {
          if (!cancelled) {
            setFacts(EMPTY_STUDY_PROGRESS);
            setStatus("ready");
          }
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId]);

  const lines = studyProgressLines(facts);

  return (
    <div data-testid="study-progress" className="space-y-5">
      <header className="space-y-2">
        <p className={ui.eyebrow}>Study Progress</p>
        <h1 className="font-reading text-3xl text-heading sm:text-4xl">What this account has recorded</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink">
          These lines come from books, sprints, quizzes, notes, and plans already saved. Nothing here is a score, streak, or rank.
        </p>
      </header>

      {status === "loading" ? <p className={ui.loading}>Reading this account&apos;s study record...</p> : null}

      {status === "signed-out" ? (
        <p data-testid="study-progress-empty" className={ui.empty}>
          Sign in to see study recorded for this account.
        </p>
      ) : null}

      {status === "locked" ? (
        <p data-testid="study-progress-empty" className={ui.empty}>
          This account&apos;s study record is locked on this device. Sign in again to unlock it.
        </p>
      ) : null}

      {status === "ready" && studyProgressIsEmpty(facts) ? (
        <div data-testid="study-progress-empty" className={ui.empty}>
          <p>No study activity is recorded for this account yet.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/reader" className="btn-secondary text-sm">
              Open My E-Books
            </Link>
            <Link href="/sprint" className="btn-secondary text-sm">
              Start a Study Sprint
            </Link>
          </div>
        </div>
      ) : null}

      {status === "ready" && lines.length > 0 ? (
        <ul data-testid="study-progress-lines" className="space-y-2">
          {lines.map((line) => (
            <li key={line} className="rounded-2xl border border-line bg-surface px-3 py-3 text-sm text-ink">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
