"use client";

import React from "react";
import Link from "next/link";
import {
  BookOpen,
  Clapperboard,
  MessageCircle,
  PenLine,
  Sparkles,
  Timer,
  Users,
  WandSparkles,
} from "lucide-react";
import { ReadingSizeControl } from "@/components/reading/ReadingSizeControl";

export interface HomeContinuation {
  bookTitle: string | null;
  sprintLabel: string | null;
  nextBlock: string | null;
  studiedMinutes: number | null;
  dailyGoal: number | null;
}

interface LiveTile {
  href: string;
  title: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  testId: string;
  tone: string;
}

const LIVE_TILES: readonly LiveTile[] = [
  {
    href: "/universe",
    title: "My Study Universe",
    detail: "Theme, rhythm, companions, and today's plan.",
    icon: Sparkles,
    testId: "hub-universe-link",
    tone: "bg-selected",
  },
  {
    href: "/reader",
    title: "Open My E-Books",
    detail: "Read your PDFs, highlight, and ask the page.",
    icon: BookOpen,
    testId: "hub-reader-link",
    tone: "bg-beige-2",
  },
  {
    href: "/reader",
    title: "Transform My Book",
    detail: "Explain, illustrate, or revise an open book.",
    icon: WandSparkles,
    testId: "hub-transform-link",
    tone: "bg-surface",
  },
  {
    href: "/sprint",
    title: "StudySprint",
    detail: "Start a timed block with breaks already planned.",
    icon: Timer,
    testId: "hub-sprint-link",
    tone: "bg-surface",
  },
  {
    href: "/roadmap",
    title: "Study Planner",
    detail: "A longer plan you can replan after a missed day.",
    icon: Timer,
    testId: "hub-roadmap-link",
    tone: "bg-beige-2",
  },
  {
    href: "/companion",
    title: "My Study Companion",
    detail: "Text drafts only. Buddy, Coach, Teacher, or Guide.",
    icon: MessageCircle,
    testId: "hub-companion-link",
    tone: "bg-selected",
  },
  {
    href: "/reader",
    title: "Ask My Book",
    detail: "Ask the open PDF. Answers stay tied to that book.",
    icon: BookOpen,
    testId: "hub-ask-link",
    tone: "bg-surface",
  },
  {
    href: "/video",
    title: "Video Lectures",
    detail: "Open a lecture you already have. Not a course catalog.",
    icon: Clapperboard,
    testId: "hub-video-link",
    tone: "bg-beige-2",
  },
  {
    href: "/notes",
    title: "My Notebook",
    detail: "Highlights, notes, and saved study material.",
    icon: PenLine,
    testId: "hub-notes-link",
    tone: "bg-surface",
  },
  {
    href: "/reader?lens=test_me",
    title: "Test Me and Revision",
    detail: "Quiz a passage, then revise what you missed.",
    icon: WandSparkles,
    testId: "hub-test-link",
    tone: "bg-beige-2",
  },
];

const COMING_SOON = ["Study Circle", "Study Progress"] as const;

export function StudyHome({ continuation }: { continuation: HomeContinuation }) {
  const hasBook = Boolean(continuation.bookTitle);
  return (
    <div data-testid="study-home" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Oryzen Learn</p>
          <h1 className="font-reading mt-1 text-[1.85rem] text-heading sm:text-4xl">
            What would you like to learn today?
          </h1>
        </div>
        <ReadingSizeControl />
      </div>

      <div className="flex flex-wrap gap-2">
        {hasBook ? (
          <Link href="/reader" data-testid="hub-continue" className="btn-primary text-sm">
            Continue {continuation.bookTitle}
          </Link>
        ) : null}
        <Link
          href="/reader?upload=1"
          data-testid="hub-upload"
          className={hasBook ? "btn-secondary text-sm" : "btn-primary text-sm"}
        >
          {hasBook ? "Upload another book" : "Upload a book"}
        </Link>
        {!hasBook ? (
          <Link href="/sprint" className="btn-secondary text-sm">
            Start a StudySprint
          </Link>
        ) : null}
      </div>

      {hasBook || continuation.sprintLabel ? (
        <section data-testid="hub-continue-learning" className="rounded-2xl border border-line bg-surface px-3 py-2 text-sm">
          <p className="font-ui text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Continue learning</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-ink">
            {continuation.bookTitle ? <span>Last book: {continuation.bookTitle}</span> : null}
            {continuation.studiedMinutes != null && continuation.dailyGoal != null ? (
              <span>
                Today: {continuation.studiedMinutes} of {continuation.dailyGoal} min
              </span>
            ) : null}
            {continuation.sprintLabel ? <span>{continuation.sprintLabel}</span> : null}
            {continuation.nextBlock ? <span>{continuation.nextBlock}</span> : null}
          </div>
        </section>
      ) : null}

      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {LIVE_TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <li key={tile.testId}>
              <Link
                href={tile.href}
                data-testid={tile.testId}
                className={`flex h-full min-h-28 flex-col rounded-2xl border border-line p-3 transition-colors hover:border-beige ${tile.tone}`}
              >
                <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
                <span className="font-ui mt-2 text-sm font-medium leading-snug text-heading">{tile.title}</span>
                <span className="mt-1 line-clamp-2 text-xs leading-snug text-muted">{tile.detail}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <section aria-label="Coming soon" data-testid="hub-coming-soon">
        <p className="font-ui text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Coming soon</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {COMING_SOON.map((name) => (
            <li key={name}>
              <p className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-dashed border-line px-3 text-sm text-muted">
                <Users className="h-4 w-4" aria-hidden="true" />
                {name}
                <span className="rounded-full bg-beige-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                  Coming soon
                </span>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
