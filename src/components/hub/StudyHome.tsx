"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CompanionFigure } from "@/components/companion/CompanionFigure";
import {
  BooksScene,
  NotebookScene,
  PlannerScene,
  ProgressScene,
  RevisionScene,
  SprintScene,
  VideoScene,
} from "@/components/hub/HomeIllustrations";
import { ReadingSizeControl } from "@/components/reading/ReadingSizeControl";
import { readCompanionStore, STYLE_COPY, type CompanionStyle } from "@/lib/companion";
import { STARTER_COMPANIONS } from "@/lib/companion/types";

export interface HomeContinuation {
  bookTitle: string | null;
  sprintLabel: string | null;
  nextBlock: string | null;
  studiedMinutes: number | null;
  dailyGoal: number | null;
}

const CHARACTER_ORDER: CompanionStyle[] = ["buddy", "teacher", "coach", "guide"];

const CARDS = [
  {
    href: "/reader",
    title: "My E-Books",
    detail: "Read a PDF. Ask My Book and Transform stay inside the reader.",
    testId: "hub-reader-link",
    scene: BooksScene,
    tone: "bg-beige-2",
  },
  {
    href: "/video",
    title: "Video Lectures",
    detail: "Watch a lecture. Notes appear only when a caption track is available.",
    testId: "hub-video-link",
    scene: VideoScene,
    tone: "bg-surface",
  },
  {
    href: "/sprint",
    title: "Study Sprint",
    detail: "Focus with a timer and planned breaks.",
    testId: "hub-sprint-link",
    scene: SprintScene,
    tone: "bg-beige-2",
  },
  {
    href: "/roadmap",
    title: "Study Planner",
    detail: "Plan your subjects and replan a missed day.",
    testId: "hub-roadmap-link",
    scene: PlannerScene,
    tone: "bg-surface",
  },
  {
    href: "/progress",
    title: "Study Progress",
    detail: "Recorded study time, quizzes, notes, and plans.",
    testId: "hub-progress-link",
    scene: ProgressScene,
    tone: "bg-selected",
  },
  {
    href: "/reader?lens=test_me",
    title: "Test Me & Revision",
    detail: "Quiz a passage, then revise what you missed.",
    testId: "hub-test-link",
    scene: RevisionScene,
    tone: "bg-beige-2",
  },
  {
    href: "/notes",
    title: "My Notebook",
    detail: "Highlights, notes, and saved study material.",
    testId: "hub-notes-link",
    scene: NotebookScene,
    tone: "bg-surface",
  },
] as const;

export function StudyHome({
  continuation,
  userId = null,
  activeCompanionStyle = null,
}: {
  continuation: HomeContinuation;
  userId?: string | null;
  activeCompanionStyle?: CompanionStyle | null;
}) {
  const [activeStyle, setActiveStyle] = useState<CompanionStyle | null>(activeCompanionStyle);
  useEffect(() => {
    const store = readCompanionStore(userId);
    setActiveStyle(store.prefs.onboarded ? store.prefs.style : activeCompanionStyle);
  }, [userId, activeCompanionStyle]);
  const hasBook = Boolean(continuation.bookTitle);
  const studied = continuation.studiedMinutes;
  const goal = continuation.dailyGoal;
  const percent =
    studied != null && goal != null && goal > 0
      ? Math.min(100, Math.round((studied / goal) * 100))
      : null;
  const planLines = [
    continuation.nextBlock,
    continuation.bookTitle ? `Last book: ${continuation.bookTitle}` : null,
    continuation.sprintLabel,
  ].filter((line): line is string => Boolean(line));

  return (
    <div data-testid="study-home" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Oryzen Learn</p>
          <h1 className="font-reading mt-1 text-3xl text-heading sm:text-4xl">What will you explore today?</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
            Eight places to study. Companions stay text-only and private to this account.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/personalize" data-testid="hub-personalize" className="btn-secondary text-sm">
            Personalize
          </Link>
          <ReadingSizeControl />
        </div>
      </header>

      <section aria-label="Today" className="grid gap-3 md:grid-cols-2">
        <div className="rounded-3xl border border-line bg-surface p-5" data-testid="hub-today-plan">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Today&apos;s plan</p>
          {planLines.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-ink">
              {planLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Nothing is planned for today.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={hasBook ? "/reader" : "/reader?upload=1"}
              data-testid="hub-continue"
              className="btn-primary text-sm"
            >
              {hasBook ? "Open my book" : "Upload a book"}
            </Link>
            {hasBook ? (
              <Link href="/reader?upload=1" data-testid="hub-upload" className="btn-secondary text-sm">
                Add another
              </Link>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-selected p-5" data-testid="hub-today-progress">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Study progress</p>
          <h2 className="mt-2 font-reading text-2xl text-heading">
            {studied == null ? "Nothing recorded yet" : `${studied} min studied`}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {goal == null ? "No daily goal is saved yet." : `Daily goal: ${goal} minutes`}
          </p>
          {percent != null ? (
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-surface"
              role="progressbar"
              aria-label="Daily study goal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
            </div>
          ) : null}
          <Link href="/progress" className="mt-4 inline-flex text-sm font-medium text-heading underline decoration-accent underline-offset-4">
            Open Study Progress
          </Link>
        </div>
      </section>

      <section aria-labelledby="study-tools-heading">
        <h2 id="study-tools-heading" className="font-reading text-2xl text-heading">
          Your learning tools
        </h2>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <li className="sm:col-span-2">
            <article className="flex h-full flex-col rounded-3xl border border-line bg-selected p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-ui text-xl font-semibold text-heading">
                    <Link href="/companion" data-testid="hub-companion-link" className="underline-offset-4 hover:underline">
                      Take My Study
                    </Link>
                  </h3>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
                    Text only. Choose Buddy, Teacher, Coach, or Guide. No voice and no talking figure.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Companion style">
                {CHARACTER_ORDER.map((style) => {
                  const starter = STARTER_COMPANIONS.find((member) => member.style === style);
                  if (!starter) return null;
                  const selected = activeStyle === style;
                  return (
                    <Link
                      key={style}
                      href={`/companion?style=${style}`}
                      data-testid={`hub-companion-${style}`}
                      aria-current={selected ? "true" : undefined}
                      className={`flex min-h-24 flex-col items-center justify-center rounded-2xl border px-2 py-2 text-sm ${
                        selected ? "border-accent bg-surface text-heading" : "border-line bg-surface/70 text-ink"
                      }`}
                    >
                      <CompanionFigure character={starter.character} className="h-14 w-14" />
                      <span className="mt-1 font-medium">{STYLE_COPY[style].label}</span>
                    </Link>
                  );
                })}
              </div>
            </article>
          </li>
          {CARDS.map((card) => {
            const Scene = card.scene;
            return (
              <li key={card.testId}>
                <Link
                  href={card.href}
                  data-testid={card.testId}
                  className={`flex h-full min-h-52 flex-col rounded-3xl border border-line p-4 transition-colors hover:border-beige ${card.tone}`}
                >
                  <div className="h-20 overflow-hidden rounded-2xl">
                    <Scene />
                  </div>
                  <h3 className="mt-3 font-ui text-lg font-semibold text-heading">{card.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{card.detail}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
