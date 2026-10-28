"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Compass } from "lucide-react";
import AppChrome from "@/components/layout/AppChrome";
import AccountMenu from "@/components/auth/AccountMenu";
import { ExperienceHomeStrip } from "@/components/experience/ExperienceHomeStrip";
import { StudyHome, type HomeContinuation } from "@/components/hub/StudyHome";
import SchedulerDialog from "@/components/study/SchedulerDialog";
import StudyRhythmButton from "@/components/rhythm/StudyRhythmButton";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { modernProfileHeadline, readSavedBodyType, type SavedBodyType } from "@/lib/study/body-type";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { getLocalPdfDocument } from "@/lib/reader/storage";
import { readMarginNotes } from "@/lib/reader/marks";
import { readLastReaderDocumentId } from "@/lib/reader/fit";
import { readLocalRoadmap } from "@/lib/roadmap/persist";
import { daysBetween, localIsoDate } from "@/lib/roadmap/time";
import { readSprintStore } from "@/lib/sprint/persist";
import { activeSession, nextRecommendedBlock, studiedMinutesOnDate, todayKey } from "@/lib/sprint/plan";
import { readDayPlan } from "@/lib/universe/persist";
import { ui } from "@/components/ui/classes";

const EMPTY_CONTINUATION: HomeContinuation = {
  bookTitle: null,
  sprintLabel: null,
  nextBlock: null,
  studiedMinutes: null,
  dailyGoal: null,
};

export default function StudyHubPage() {
  const [saved, setSaved] = useState<SavedBodyType | null>(null);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [continuation, setContinuation] = useState<HomeContinuation>(EMPTY_CONTINUATION);
  const [examDaysLeft, setExamDaysLeft] = useState<number | null>(null);
  const [hasNote, setHasNote] = useState(false);
  const coachScope = useSignedInScope();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const user = await fetchSignedInUser();
          const userId = user?.userId ?? null;
          setSaved(readSavedBodyType(userId));
          const store = readSprintStore(userId);
          const date = todayKey();
          const plan = readDayPlan(userId);
          const goal = plan?.dailyGoalMinutes ?? store.dailyTargetMinutes;
          const next = nextRecommendedBlock(store.sessions, goal, store.preferredDuration, date);
          const active = activeSession(store.sessions);
          const documentId = readLastReaderDocumentId(userId);
          const document = documentId ? await getLocalPdfDocument(documentId) : null;
          const roadmap = readLocalRoadmap(userId);
          const examDaysLeft = roadmap ? daysBetween(localIsoDate(), roadmap.intake.examDate) : null;
          setExamDaysLeft(examDaysLeft);
          setHasNote(readMarginNotes(userId).length > 0);
          setContinuation({
            bookTitle: document?.title ?? null,
            sprintLabel: active
              ? `StudySprint: ${active.status === "running" ? "in progress" : active.status}`
              : null,
            nextBlock: store.sessions.length > 0 || plan ? next.hint : null,
            studiedMinutes: store.sessions.length > 0 ? studiedMinutesOnDate(store.sessions, date) : null,
            dailyGoal: store.sessions.length > 0 || plan ? goal : null,
          });
        } catch {
          setSaved(null);
          setExamDaysLeft(null);
          setHasNote(false);
          setContinuation(EMPTY_CONTINUATION);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [coachScope]);

  return (
    <AppChrome
      subtitle="My Learning Space"
      actions={
        <div className="flex items-center gap-1">
          <AccountMenu />
          <button
            type="button"
            aria-label="Plan your study time"
            aria-expanded={schedulerOpen}
            onClick={() => setSchedulerOpen((open) => !open)}
            className={`${ui.secondary} inline-flex whitespace-nowrap`}
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Plan time
          </button>
        </div>
      }
    >
      <main className={ui.main}>
        <StudyHome continuation={continuation} />
        <div className="mt-4">
          <ExperienceHomeStrip
            signals={{
              hasBook: Boolean(continuation.bookTitle),
              hasNote,
              hasSprint: Boolean(continuation.sprintLabel),
              hasRoadmap: continuation.dailyGoal != null || examDaysLeft != null,
              studiedMinutes: continuation.studiedMinutes,
            }}
            examDaysLeft={examDaysLeft}
          />
        </div>

        {saved ? (
          <section
            data-testid="hub-constitution"
            className={`${ui.card} flex flex-col gap-4 md:flex-row md:items-center md:justify-between`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className={ui.chip}>
                <Compass className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-ui text-lg text-heading">Your Learning Insights</h2>
                <p className="mt-1 text-sm font-medium text-heading">
                  {modernProfileHeadline(saved.displayProfileTitle)}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {saved.cognitiveSummary} These are optional strategies to try—not a measure of ability.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <StudyRhythmButton />
              <Link href="/body-type" className={`${ui.secondary} shrink-0`}>
                Explore My Learning Profile
              </Link>
            </div>
          </section>
        ) : (
          <section
            data-testid="hub-general"
            className={`${ui.card} flex flex-col gap-4 md:flex-row md:items-center md:justify-between`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className={ui.chip}>
                <Compass className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-ui text-lg text-heading">Make learning more personal</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Optional preferences for theme, session length, and explanation style. Not a measure of ability.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <StudyRhythmButton />
              <Link href="/universe" className={`${ui.secondary} shrink-0`}>
                Open My Study Universe
              </Link>
            </div>
          </section>
        )}
      </main>
      <SchedulerDialog open={schedulerOpen} onClose={() => setSchedulerOpen(false)} />
    </AppChrome>
  );
}
