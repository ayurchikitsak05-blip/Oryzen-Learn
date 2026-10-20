"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";

export default function BodyTypeIntroPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 px-4 pt-5 md:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-full border border-zinc-800 bg-zinc-900/80 px-5 py-2.5 shadow-xl shadow-black/20 backdrop-blur-xl">
          <OryzenLearnBrand subtitle="Adaptive Intelligence & Focus Reader" />
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-zinc-400 transition-all hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-16 md:px-8 md:py-24">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
          Body type
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Why your body type matters
        </h1>
        <div className="mt-6 space-y-4 text-base leading-relaxed text-zinc-300">
          <p>
            People do not study from the same kind of energy. Some catch an idea
            quickly and need short, lively bursts before their attention moves on.
          </p>
          <p>
            Others settle into a long, precise stretch and tire when the work
            feels hot or glare-heavy. Others begin slowly, then hold what they
            have truly worked through for a long time.
          </p>
          <p>
            Those differences show up in how you read, how long you can stay with
            a page, and how you get the idea back later. A single pace for every
            student leaves some people rushed and others under-stimulated.
          </p>
          <p>
            This reading looks at your constitution and your study habits
            together. It names one primary pattern, then shapes focus length and
            explanations around that pattern.
          </p>
          <p>
            It is a starting point for how you learn, not a limit on what you
            can study.
          </p>
        </div>

        <Link
          href="/onboarding"
          className="mt-10 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-base font-medium text-zinc-950 transition-all hover:bg-zinc-200 active:scale-95"
        >
          Get Started
          <ArrowRight className="h-4 w-4" />
        </Link>
      </main>
    </div>
  );
}
