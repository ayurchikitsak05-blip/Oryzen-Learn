"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import AccountMenu from "@/components/auth/AccountMenu";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";

export default function BodyTypeIntroPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100">
      <header className="sticky top-0 z-30 px-4 pt-5 md:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-full border border-amber-500/30 bg-zinc-950/90 px-5 py-2.5 shadow-xl shadow-black/30 backdrop-blur-xl">
          <OryzenLearnBrand subtitle="Adaptive Intelligence & Focus Reader" />
          <div className="flex items-center gap-1">
            <AccountMenu />
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-amber-100 transition-all hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-16 md:px-8 md:py-24">
        <p className="text-xs font-medium uppercase tracking-widest text-amber-200">
          Cognitive Prakriti
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
          Discover Your Cognitive Prakriti
        </h1>
        <div className="mt-6 space-y-4 text-base leading-relaxed text-amber-100">
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

        <div className="mt-10 flex flex-col items-start gap-3">
          <Link
            href="/onboarding"
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-amber-500/40 bg-amber-950/40 px-6 py-3 text-base font-medium text-amber-100 transition-all hover:bg-amber-950/70 active:scale-95"
          >
            Begin the reading
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/hub"
            className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-amber-500/30 bg-black px-6 py-3 text-base font-medium text-amber-100 transition-all hover:border-amber-200/40 active:scale-95"
          >
            Skip for now
          </Link>
        </div>
      </main>
    </div>
  );
}
