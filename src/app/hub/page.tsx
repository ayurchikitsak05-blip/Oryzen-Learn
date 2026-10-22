"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  BookOpen,
  CalendarClock,
  Clapperboard,
  Compass,
  Library,
  Map,
  PenLine,
} from "lucide-react";
import AccountMenu from "@/components/auth/AccountMenu";
import AppChrome from "@/components/layout/AppChrome";
import SchedulerDialog from "@/components/study/SchedulerDialog";
import { ui } from "@/components/ui/classes";
import {
  modernProfileHeadline,
  readSavedBodyType,
  type SavedBodyType,
} from "@/lib/study/body-type";
import { fetchSignedInUser } from "@/lib/supabase/session";

const TOOLS = [
  {
    href: "/reader",
    title: "Read & Explore",
    description:
      "Turn your documents into an interactive reading experience. Highlight ideas, explore meanings, and make notes as you go.",
    icon: BookOpen,
  },
  {
    href: "/video",
    title: "Learn from Videos",
    description:
      "Turn lectures into useful notes. Revisit key moments and explore concepts at your own pace.",
    icon: Clapperboard,
  },
  {
    href: "/vaults",
    title: "My Learning Library",
    description:
      "Keep your subjects, textbooks, and learning materials organized and easy to find.",
    icon: Archive,
  },
  {
    href: "/notes",
    title: "My Notebook",
    description:
      "Capture your thoughts, save important ideas, and return to them whenever you need.",
    icon: PenLine,
  },
  {
    href: "/roadmap",
    title: "My Study Roadmap",
    description:
      "Build a daily, weekly, and monthly plan around your exam, then replan when a day is missed.",
    icon: Map,
  },
  {
    href: "/synthesis",
    title: "Connect Your Knowledge",
    description:
      "Bring ideas from different documents and lectures together into one organized study guide.",
    icon: Library,
  },
] as const;

export default function StudyHubPage() {
  const [saved, setSaved] = useState<SavedBodyType | null>(null);
  const [schedulerOpen, setSchedulerOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const user = await fetchSignedInUser();
          setSaved(readSavedBodyType(user?.userId ?? null));
        } catch {
          setSaved(null);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
            className={`${ui.secondary} inline-flex`}
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Plan time
          </button>
        </div>
      }
    >
      <main className={ui.main}>
        <div>
          <p className={ui.eyebrow}>My Learning Space</p>
          <h1 className={`${ui.heading} mt-3 max-w-3xl text-4xl`}>
            Your learning space, your way.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
            Read, watch, explore, and organize everything you learn—all in one place.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                data-testid={tool.href === "/roadmap" ? "hub-roadmap-link" : undefined}
                className={`${ui.card} flex min-h-[180px] flex-col transition-colors hover:bg-beige-2`}
              >
                <span className={ui.chip}>
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className={`${ui.heading} mt-4 text-lg`}>{tool.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {tool.description}
                </p>
              </Link>
            );
          })}
        </div>

        {saved ? (
          <section
            data-testid="hub-constitution"
            className={`${ui.card} mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className={ui.chip}>
                <Compass className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className={`${ui.heading} text-lg`}>Your Learning Insights</h2>
                <p className="mt-1 text-sm font-medium text-heading">
                  {modernProfileHeadline(saved.displayProfileTitle)}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {saved.cognitiveSummary} These are optional strategies to
                  try—not a measure of ability.
                </p>
              </div>
            </div>
            <Link href="/body-type" className={`${ui.secondary} shrink-0`}>
              Explore My Learning Profile
            </Link>
          </section>
        ) : (
          <section
            data-testid="hub-general"
            className={`${ui.card} mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className={ui.chip}>
                <Compass className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className={`${ui.heading} text-lg`}>
                  Make Learning More Personal.
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Discover your learning rhythm and explore study strategies that
                  may work for you.
                </p>
              </div>
            </div>
            <Link href="/body-type" className={`${ui.secondary} shrink-0`}>
              Explore My Learning Profile
            </Link>
          </section>
        )}
      </main>
      <SchedulerDialog open={schedulerOpen} onClose={() => setSchedulerOpen(false)} />
    </AppChrome>
  );
}
