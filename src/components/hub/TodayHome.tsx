"use client";

import { formatHours } from "@/lib/roadmap/time";
import { DailyThought } from "@/components/hub/DailyThought";
import { PinnedNotes } from "@/components/notes/StickyNotes";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, MessageCircle, Play, RotateCcw, Sparkles, Video } from "lucide-react";
import type { HomeContinuation } from "@/lib/hub/continuation";
import { readFirstRunDraft } from "@/lib/onboarding/first-run";

/**
 * The Today screen: one main action (today's study), then revision, help to start,
 * a small progress strip, and the last book. Replaces the eight-tile Learning Space.
 */
export function TodayHome({
  continuation,
  record = "ready",
  onRetry,
  draftOwner,
}: {
  continuation: HomeContinuation;
  /** Who is signed in ("local-anonymous" when nobody); first-run answers are shown only to them. */
  draftOwner?: string | null;
  record?: "loading" | "opening" | "locked" | "ready";
  onRetry?: () => void;
}) {
  const ready = record === "ready";
  // Answers from the first-run screen that haven't become a plan yet.
  const [hasDraft, setHasDraft] = useState(false);
  useEffect(() => {
    if (!draftOwner) return;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setHasDraft(Boolean(readFirstRunDraft(draftOwner, today)));
  }, [draftOwner]);
  const hasPlan = ready && Boolean(continuation.nextBlock);
  const hasBook = ready && Boolean(continuation.bookTitle);
  const studied = continuation.studiedMinutes;
  const goal = continuation.dailyGoal;
  const percent =
    ready && studied != null && goal != null && goal > 0
      ? Math.min(100, Math.round((studied / goal) * 100))
      : null;

  return (
    <div data-testid="today-home" className="mx-auto w-full max-w-xl space-y-4">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Today</p>
        <h1 className="font-display mt-1 text-3xl text-heading">What to study now</h1>
      </header>

      <section
        aria-label="Today's study"
        data-testid="today-plan"
        className="rounded-3xl bg-heading p-5 text-canvas"
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-beige">Today&apos;s study</p>
        {record === "loading" ? (
          <p className="mt-3 text-base">Opening your study plan…</p>
        ) : record === "opening" || record === "locked" ? (
          <div className="mt-3 space-y-3">
            <p className="text-base">
              Your private study record is still locked on this device, so your plan is hidden for now.
            </p>
            {record === "locked" && onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 items-center rounded-xl bg-canvas px-4 text-sm font-semibold text-heading"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : hasPlan ? (
          <>
            <p className="mt-2 text-xl font-semibold leading-snug">{continuation.nextBlock}</p>
            {continuation.sprintLabel ? (
              <p className="mt-1 text-sm text-beige-2">{continuation.sprintLabel}</p>
            ) : null}
            <Link
              href="/sprint"
              data-testid="today-start"
              className="mt-4 flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-canvas text-base font-semibold text-heading"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Start
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-xl font-semibold leading-snug">
              {hasDraft ? "Your exam plan is ready to open" : "No plan yet"}
            </p>
            <p className="mt-1 text-sm text-beige-2">
              {hasDraft
                ? "We'll split your subjects into about 2 hours a day."
                : "Tell us your class and exam month. It takes a minute."}
            </p>
            <Link
              href={hasDraft ? "/roadmap" : "/welcome"}
              data-testid="today-make-plan"
              className="mt-4 flex min-h-[52px] items-center justify-center rounded-2xl bg-canvas text-base font-semibold text-heading"
            >
              {hasDraft ? "Show my plan" : "Make my exam plan"}
            </Link>
          </>
        )}
      </section>

      <DailyThought />
      <PinnedNotes />

      <section aria-labelledby="today-highlights" className="space-y-2" data-testid="today-highlights">
        <h2 id="today-highlights" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          Highlights
        </h2>
        <Link
          href="/video"
          data-testid="today-lecture-notes"
          className="block rounded-2xl border-2 border-accent/40 bg-surface p-4"
        >
          <span className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-beige-2">
              <Video className="h-6 w-6 text-accent" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-heading">YouTube lecture notes</span>
              <span className="block text-sm text-muted">
                Paste a lecture link. Get timed notes you can revise from, and share them free with friends.
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          </span>
        </Link>
        <Link
          href="/body-type"
          data-testid="today-study-style"
          className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
        >
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-beige-2">
            <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-heading">My study style</span>
            <span className="block text-sm text-muted">How long you focus best, and settings that suit you</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
        </Link>
      </section>

      <h2 className="pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Every day</h2>

      {continuation.backlog ? (
        <Link
          href="/roadmap#backlog"
          data-testid="today-backlog"
          className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
        >
          <span>
            <span className="block font-semibold text-heading">
              Backlog: {continuation.backlog.topics} topic{continuation.backlog.topics === 1 ? "" : "s"}
            </span>
            <span className="block text-sm text-muted">
              About {formatHours(continuation.backlog.minutes)} to catch up. Tick or replan.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
        </Link>
      ) : null}

      <Link
        href="/revise"
        data-testid="today-revise"
        className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
      >
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-beige-2">
          <RotateCcw className="h-5 w-5 text-accent" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-heading">Morning revision</span>
          <span className="block text-sm text-muted">5 quick cards from your notes, 3 minutes</span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
      </Link>

      <Link
        href="/companion"
        data-testid="today-take-my-study"
        className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
      >
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-beige-2">
          <MessageCircle className="h-5 w-5 text-accent" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-heading">Can&apos;t get started?</span>
          <span className="block text-sm text-muted">Take My Study helps you begin</span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
      </Link>

      <section aria-label="Study progress" data-testid="today-progress" className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold text-heading">
            {!ready ? "Progress" : studied == null ? "Nothing recorded today" : `${studied} min studied today`}
          </p>
          <Link href="/progress" className="text-sm font-medium text-accent underline-offset-4 hover:underline">
            Progress
          </Link>
        </div>
        {percent != null ? (
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-beige-2"
            role="progressbar"
            aria-label="Daily study goal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
        ) : null}
        {ready && goal != null ? <p className="mt-2 text-sm text-muted">Daily goal: {goal} minutes</p> : null}
      </section>

      <Link
        href={hasBook ? "/reader" : "/reader?upload=1"}
        data-testid="today-book"
        className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
      >
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-beige-2">
          <BookOpen className="h-5 w-5 text-accent" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-heading">{hasBook ? "Continue reading" : "Add your first book"}</span>
          <span className="block truncate text-sm text-muted">
            {hasBook ? continuation.bookTitle : "Upload a PDF of your textbook"}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
      </Link>
    </div>
  );
}
