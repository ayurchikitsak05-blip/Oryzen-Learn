"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Clapperboard, Library } from "lucide-react";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";
import StudySidePanel from "@/components/study/StudySidePanel";
import { readSavedBodyType, type SavedBodyType } from "@/lib/study/body-type";

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
] as const;

export default function StudyHubPage() {
  const [saved, setSaved] = useState<SavedBodyType | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSaved(readSavedBodyType());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 px-4 pt-5 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full border border-zinc-800 bg-zinc-900/80 px-5 py-2.5 shadow-xl shadow-black/20 backdrop-blur-xl">
          <OryzenLearnBrand subtitle="Adaptive Intelligence & Focus Reader" />
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-zinc-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 md:px-8 md:py-14">
        {saved ? (
          <div data-testid="hub-constitution">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
              Your body type
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight">
              {saved.displayProfileTitle}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-400">
              {saved.cognitiveSummary}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
              Study hub
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Choose how you want to study
            </h1>
          </div>
        )}

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className="flex min-h-[180px] flex-col rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl shadow-black/20 transition-all hover:border-zinc-600 active:scale-[0.99]"
              >
                <Icon className="h-5 w-5 text-zinc-300" />
                <h2 className="mt-4 text-lg font-semibold tracking-tight">{tool.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {tool.description}
                </p>
              </Link>
            );
          })}
        </div>

        <div className="mt-8 xl:max-w-sm">
          <StudySidePanel dosha={null} />
        </div>
      </main>
    </div>
  );
}
