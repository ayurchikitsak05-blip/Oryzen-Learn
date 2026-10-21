"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, BookOpen, CalendarClock, Clapperboard, Library, PenLine } from "lucide-react";
import AccountMenu from "@/components/auth/AccountMenu";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";
import SchedulerDialog from "@/components/study/SchedulerDialog";
import StudySidePanel from "@/components/study/StudySidePanel";
import { readSavedBodyType, type SavedBodyType } from "@/lib/study/body-type";
import { createClient } from "@/lib/supabase/client";

const TOOLS = [
  {
    href: "/reader",
    title: "Document Reader & Upload",
    description:
      "Study one file with word meanings, highlighting, underlining, and smooth auto-scroll.",
    icon: BookOpen,
  },
  {
    href: "/video",
    title: "Video Analysis & Notes",
    description: "Watch a lecture and turn it into structured notes.",
    icon: Clapperboard,
  },
  {
    href: "/synthesis",
    title: "Multi-PDF Merge Notes",
    description: "Combine and synthesize notes across several source documents.",
    icon: Library,
  },
  {
    href: "/vaults",
    title: "Subject Vaults",
    description: "Upload a textbook, ask questions from it, and keep study notes.",
    icon: Archive,
  },
  {
    href: "/notes",
    title: "My Notes",
    description: "Write notes by subject, then open that subject whenever you need them.",
    icon: PenLine,
  },
] as const;

export default function StudyHubPage() {
  const [saved, setSaved] = useState<SavedBodyType | null>(null);
  const [schedulerOpen, setSchedulerOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const supabase = createClient();
          const { data } = await supabase.auth.getUser();
          setSaved(readSavedBodyType(data.user?.id ?? null));
        } catch {
          setSaved(null);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100">
      <header className="sticky top-0 z-30 px-4 pt-5 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full border border-amber-500/30 bg-zinc-950/80 px-5 py-2.5 shadow-xl shadow-black/20 backdrop-blur-xl">
          <OryzenLearnBrand subtitle="Adaptive Intelligence & Focus Reader" />
          <div className="flex items-center gap-1">
            <AccountMenu />
            <button
              type="button"
              aria-label="Open smart scheduler"
              aria-expanded={schedulerOpen}
              onClick={() => setSchedulerOpen((open) => !open)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-amber-500/40 bg-amber-950/40 px-4 text-sm font-medium text-amber-100 hover:bg-amber-950/70"
            >
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              Scheduler
            </button>
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-amber-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Home
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 md:px-8 md:py-14">
        {saved ? (
          <div data-testid="hub-constitution">
            <p className="text-xs font-medium uppercase tracking-widest text-amber-200">
              Your cognitive prakriti
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white">
              {saved.displayProfileTitle}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-amber-100">
              {saved.cognitiveSummary}
            </p>
          </div>
        ) : (
          <div data-testid="hub-general">
            <p className="text-xs font-medium uppercase tracking-widest text-amber-200">
              Study hub
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white">
              Choose how you want to study
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-amber-100">
              These tools are ready before the reading. Discover Your Cognitive
              Prakriti when you want a pace made for how you focus.
            </p>
            <Link
              href="/body-type"
              className="mt-5 inline-flex min-h-[44px] items-center rounded-full border border-amber-500/40 bg-amber-950/40 px-4 text-sm font-medium text-amber-100 hover:bg-amber-950/70"
            >
              Discover Your Cognitive Prakriti
            </Link>
          </div>
        )}

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className="flex min-h-[180px] flex-col rounded-3xl border border-amber-500/30 bg-amber-950/20 p-5 shadow-xl shadow-black/20 transition-all hover:border-amber-200/40 active:scale-[0.99]"
              >
                <Icon className="h-5 w-5 text-amber-200" />
                <h2 className="mt-4 text-lg font-semibold tracking-tight text-white">{tool.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-amber-100">
                  {tool.description}
                </p>
              </Link>
            );
          })}
        </div>

        <div className="mt-8 xl:max-w-sm">
          <StudySidePanel dosha={null} showScheduler={false} />
        </div>
      </main>
      <SchedulerDialog open={schedulerOpen} onClose={() => setSchedulerOpen(false)} />
    </div>
  );
}
