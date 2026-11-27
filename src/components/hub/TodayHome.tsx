"use client";

import { CountdownCard } from "@/components/countdown/CountdownCard";
import { formatHours } from "@/lib/roadmap/time";
import { DailyThought } from "@/components/hub/DailyThought";
import { PinnedNotes } from "@/components/notes/StickyNotes";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, MessageCircle, Play } from "lucide-react";
import type { HomeContinuation } from "@/lib/hub/continuation";
import { readFirstRunDraft } from "@/lib/onboarding/first-run";
import { checkInToday, comebackMessage } from "@/lib/hub/comeback";
import { PageTitle } from "@/components/layout/PageTitle";
import { StudyIcon, StudyIconTile, type StudyIconName } from "@/components/icons/StudyIcons";
import { WeekStampsCard } from "@/components/hub/WeekStampsCard";
import { SubjectsStrip } from "@/components/hub/SubjectsStrip";
import { useTodayExtras } from "@/components/hub/useTodayExtras";
import { InstallApp } from "@/components/pwa/InstallApp";
import type { MixItem } from "@/lib/hub/today-mix";

/** Good morning / afternoon / evening, from the device clock. */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const MIX_ICON: Record<MixItem["kind"], StudyIconName> = { revision: "revision", lecture: "lectures", note: "style" };

/**
 * Today (owner, 27 Nov 2026, after VaidyaGenie): one "continue" card with today's goal and
 * revision, Today's mix from the student's own material, the week's stamps and the exam
 * countdown. Everything here is built without AI.
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
  const extras = useTodayExtras();
  const [hasDraft, setHasDraft] = useState(false);
  const [missedDays, setMissedDays] = useState(0);
  const [comebackHidden, setComebackHidden] = useState(false);
  const [hello, setHello] = useState("Today");
  useEffect(() => {
    setHello(greeting());
    if (!draftOwner) return;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setHasDraft(Boolean(readFirstRunDraft(draftOwner, today)));
    if (draftOwner !== "local-anonymous") {
      const missed = checkInToday(draftOwner, today);
      setMissedDays((current) => Math.max(current, missed));
    }
  }, [draftOwner]);
  const comeback = comebackHidden ? null : comebackMessage(missedDays);
  const hasPlan = ready && Boolean(continuation.nextBlock);
  const hasBook = ready && Boolean(continuation.bookTitle);
  // While the account opens (a few seconds after a reload), don't say "Add your first book".
  const bookLoading = record === "loading" || record === "opening";
  const studied = continuation.studiedMinutes;
  const goal = continuation.dailyGoal;
  const shownMinutes = ready ? Math.max(studied ?? 0, extras.todayMinutes) : null;
  const percent =
    ready && goal != null && goal > 0 && (studied != null || extras.todayMinutes > 0)
      ? Math.min(100, Math.round(((shownMinutes ?? 0) / goal) * 100))
      : null;
  const bookPercent =
    hasBook && continuation.bookPage && continuation.bookPages
      ? Math.min(100, Math.round((continuation.bookPage / continuation.bookPages) * 100))
      : null;

  return (
    <div data-testid="today-home" className="mx-auto w-full max-w-6xl space-y-6">
      <PageTitle
        kicker="Today"
        title={hello}
        subtitle="What to study now. One focused session today is enough."
        aside={
          <span className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(150deg,#f6f1e6,#ebe2cc)] sm:inline-flex">
            <StudyIcon name="sun" size={34} delay={0.1} />
          </span>
        }
      />
      <h2 className="sr-only">What to study now</h2>

      {comeback ? (
        <section className="card-soft space-y-2 p-4" data-testid="today-comeback" role="status">
          <p className="font-semibold text-heading">{comeback.title}</p>
          <p className="text-sm text-muted">{comeback.body}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/revise" className="inline-flex min-h-11 items-center rounded-xl bg-heading px-4 text-sm font-medium text-canvas">
              5 quick cards
            </Link>
            <Link href="/revise#reminder" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium text-ink">
              Set a daily reminder
            </Link>
            <button type="button" className="min-h-11 px-2 text-sm text-muted underline-offset-4 hover:underline" onClick={() => setComebackHidden(true)}>
              Not now
            </button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 space-y-6">
          {/* Continue card: the last book and today's plan, with the goal and revision beside it. */}
          <section
            aria-label="Today's study"
            data-testid="today-plan"
            className="card-soft rise overflow-hidden border-t-[3px] border-t-[#b08a68]"
          >
            <div className="grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div className="space-y-4 p-5">
                {record === "loading" ? (
                  <p className="text-base text-ink">Opening your study plan…</p>
                ) : record === "opening" || record === "locked" ? (
                  <div className="space-y-3">
                    <p className="text-base text-ink">
                      Your private study record is still locked on this device, so your plan is hidden for now.
                    </p>
                    {record === "locked" && onRetry ? (
                      <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center rounded-xl bg-heading px-4 text-sm font-semibold text-canvas">
                        Try again
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <StudyIconTile name="books" box={48} delay={0.15} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-accent">
                          {hasBook ? "Continue where you left off" : hasPlan ? "Today's study" : "Get started"}
                        </p>
                        <p className="font-display truncate text-xl text-heading">
                          {hasBook ? continuation.bookTitle : hasPlan ? continuation.nextBlock : hasDraft ? "Your exam plan is ready to open" : "No plan yet"}
                        </p>
                      </div>
                    </div>
                    {bookPercent != null ? (
                      <div className="space-y-1.5">
                        <div className="h-1.5 max-w-md overflow-hidden rounded-full bg-beige-2" aria-hidden="true">
                          <div className="grow-bar h-full rounded-full bg-[linear-gradient(90deg,#b08a68,var(--accent))]" style={{ width: `${bookPercent}%` }} />
                        </div>
                        <p className="text-xs text-muted">
                          Page {continuation.bookPage} of {continuation.bookPages}
                        </p>
                      </div>
                    ) : null}
                    {hasBook && hasPlan ? (
                      <p className="text-sm text-muted">
                        Plan for today: <span className="font-medium text-ink">{continuation.nextBlock}</span>
                        {continuation.sprintLabel ? ` · ${continuation.sprintLabel}` : ""}
                      </p>
                    ) : !hasBook && hasPlan && continuation.sprintLabel ? (
                      <p className="text-sm text-muted">{continuation.sprintLabel}</p>
                    ) : !hasPlan ? (
                      <p className="text-sm text-muted">
                        {hasDraft ? "We'll split your subjects into about 2 hours a day." : "Tell us your class and exam month. It takes a minute."}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {hasBook ? (
                        <Link
                          href="/reader"
                          data-testid="today-continue-reading"
                          className="lift inline-flex min-h-11 items-center gap-2 rounded-xl bg-heading px-4 text-sm font-semibold text-canvas"
                        >
                          Continue reading <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      ) : null}
                      {hasPlan ? (
                        <Link
                          href="/sprint"
                          data-testid="today-start"
                          className={`lift inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold ${
                            hasBook ? "border border-line bg-surface text-heading" : "bg-heading text-canvas"
                          }`}
                        >
                          <Play className="h-4 w-4" aria-hidden="true" />
                          Start
                        </Link>
                      ) : (
                        <Link
                          href={hasDraft ? "/roadmap" : "/welcome"}
                          data-testid="today-make-plan"
                          className={`lift inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold ${
                            hasBook ? "border border-line bg-surface text-heading" : "bg-heading text-canvas"
                          }`}
                        >
                          {hasDraft ? "Show my plan" : "Make my exam plan"}
                        </Link>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="grid border-t border-line md:border-l md:border-t-0">
                <div data-testid="today-progress" aria-label="Study progress" className="flex items-center gap-3 border-b border-line px-5 py-4">
                  {percent != null ? (
                    <div
                      role="progressbar"
                      aria-label="Daily study goal"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      className="relative h-14 w-14 shrink-0"
                    >
                      <svg viewBox="0 0 44 44" className="h-14 w-14 -rotate-90" aria-hidden="true">
                        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--beige-primary)" strokeWidth="4" />
                        <circle
                          cx="22"
                          cy="22"
                          r="18"
                          fill="none"
                          stroke="#b08a68"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray="113"
                          strokeDashoffset={113 - (113 * percent) / 100}
                          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)" }}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-heading">{percent}%</span>
                    </div>
                  ) : (
                    <StudyIconTile name="timer" box={48} delay={0.25} />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-muted">Today&apos;s goal</p>
                    <p className="font-semibold text-heading">
                      {!ready ? "Progress" : shownMinutes ? `${shownMinutes} min studied today` : "Nothing recorded today"}
                    </p>
                    {ready && goal != null ? <p className="text-xs text-muted">Daily goal: {goal} minutes</p> : null}
                  </div>
                </div>
                <Link href="/revise" data-testid="today-revise" className="lift flex items-center gap-3 px-5 py-4 hover:bg-beige-2/40">
                  <StudyIconTile name="revision" box={48} delay={0.35} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">Morning revision</p>
                    <p className="font-semibold text-heading">
                      {extras.revisionDue != null && extras.revisionDue > 0
                        ? `${extras.revisionDue} card${extras.revisionDue === 1 ? "" : "s"} due`
                        : "5 quick cards from your notes"}
                    </p>
                    <p className="text-xs text-muted">About 3 minutes</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>

          {/* Phones: the week's stamps right under the Continue card (the side column comes last there). */}
          <div className="lg:hidden">
            <WeekStampsCard stamps={extras.stamps} streak={extras.streak} todayMinutes={extras.todayMinutes} />
          </div>

          <section aria-labelledby="today-mix-title" data-testid="today-mix" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="today-mix-title" className="text-lg font-semibold text-heading">Today&apos;s mix</h2>
              <span className="text-xs text-muted">New every day, from your own books, notes and lectures</span>
            </div>
            <ul className="space-y-2.5">
              {extras.mix.map((item, index) => (
                <li key={item.kind} className="rise" style={{ animationDelay: `${0.1 + index * 0.06}s` }}>
                  <Link href={item.href} data-testid={`today-mix-${item.kind}`} className="card-soft lift flex items-center gap-3.5 p-4">
                    <StudyIconTile name={MIX_ICON[item.kind]} box={44} delay={0.2 + index * 0.08} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{item.kicker}</span>
                      <span className="block truncate font-semibold text-heading">{item.title}</span>
                      <span className="block truncate text-sm text-muted">{item.detail}</span>
                    </span>
                    <span className="hidden shrink-0 text-sm font-semibold text-accent sm:inline">{item.cta} →</span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted sm:hidden" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {continuation.backlog || (ready && continuation.readiness) ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {ready && continuation.readiness ? (
                <Link href="/roadmap" data-testid="today-readiness" className="card-soft lift flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block font-semibold text-heading">{continuation.readiness.percent}% exam ready</span>
                    <span className="block truncate text-sm text-muted">
                      {continuation.readiness.doNext ? `Do next: ${continuation.readiness.doNext}` : "Every chapter is exam ready"}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                </Link>
              ) : null}
              {continuation.backlog ? (
                <Link href="/roadmap#backlog" data-testid="today-backlog" className="card-soft lift flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="block font-semibold text-heading">
                      Backlog: {continuation.backlog.topics} topic{continuation.backlog.topics === 1 ? "" : "s"}
                    </span>
                    <span className="block text-sm text-muted">About {formatHours(continuation.backlog.minutes)} to catch up. Tick or replan.</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          ) : null}

          <SubjectsStrip />

          <InstallApp dismissible />

          <section aria-labelledby="today-highlights" data-testid="today-highlights" className="space-y-3">
            <h2 id="today-highlights" className="text-lg font-semibold text-heading">Highlights</h2>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <ToolCard href="/video" testId="today-lecture-notes" icon="lectures" title="YouTube lecture topics" detail="Paste a link. Jump to each topic. Free" />
              <ToolCard href="/body-type" testId="today-study-style" icon="sprout" title="My study style" detail="How long you focus best" />
              <ToolCard href="/focus" testId="today-focus-timer" icon="timer" title="Focus timer" detail="Study and break blocks, minutes saved" />
              <ToolCard
                href={hasBook || bookLoading ? "/reader" : "/reader?upload=1"}
                testId="today-book"
                icon="books"
                title={hasBook ? "Continue reading" : bookLoading ? "Your books" : "Add your first book"}
                detail={hasBook ? (continuation.bookTitle ?? "") : bookLoading ? "Opening…" : "Upload a PDF of your textbook"}
              />
            </div>
          </section>
        </div>

        <aside className="space-y-4" aria-label="Your week and exam">
          <div className="hidden lg:block">
            <WeekStampsCard testId="today-week-side" stamps={extras.stamps} streak={extras.streak} todayMinutes={extras.todayMinutes} />
          </div>
          {continuation.exam ? (
            <CountdownCard examName={continuation.exam.name} examDate={continuation.exam.date} examMonth={continuation.exam.month} />
          ) : (
            <Link href="/roadmap" data-testid="today-exam-plan" className="card-soft lift block space-y-1 p-4">
              <span className="block font-semibold text-heading">Exam plan</span>
              <span className="block text-sm text-muted">Add your exam date to see a countdown and a weekly plan.</span>
            </Link>
          )}
          <Link href="/companion" data-testid="today-take-my-study" className="card-soft lift flex items-start gap-3 p-4">
            <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-semibold text-heading">Can&apos;t get started?</span>
              <span className="block text-sm text-muted">Take My Study helps you begin</span>
            </span>
          </Link>
          <DailyThought />
          <PinnedNotes />
        </aside>
      </div>
    </div>
  );
}

function ToolCard({ href, testId, icon, title, detail }: { href: string; testId: string; icon: StudyIconName; title: string; detail: string }) {
  return (
    <Link href={href} data-testid={testId} className="card-soft lift flex min-h-16 items-center gap-3 px-4 py-3">
      <StudyIconTile name={icon} box={44} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-heading">{title}</span>
        <span className="block truncate text-sm text-muted">{detail}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
    </Link>
  );
}
