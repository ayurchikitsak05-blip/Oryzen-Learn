"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import AccountMenu from "@/components/auth/AccountMenu";
import AppChrome from "@/components/layout/AppChrome";
import { ui } from "@/components/ui/classes";

export default function BodyTypeIntroPage() {
  return (
    <AppChrome
      nav="marketing"
      subtitle="Your Learning Rhythm"
      maxWidthClass="max-w-3xl"
      actions={<AccountMenu />}
    >
      <main className={ui.mainNarrow}>
        <p className={ui.eyebrow}>Your Learning Rhythm</p>
        <h1 className={`${ui.heading} mt-3 text-4xl`}>
          Discover Your Learning Rhythm
        </h1>
        <div className={`${ui.cardPad} mt-6 space-y-4 text-base leading-relaxed text-ink`}>
          <p>
            This explores your preferences, routines, and focus habits, together
            with an Ayurveda-inspired perspective on energy and pace.
          </p>
          <p>
            People do not study from the same kind of energy. Some catch an idea
            quickly and need short, lively bursts before their attention moves on.
            Others settle into a long, precise stretch. Others begin slowly, then
            hold what they have truly worked through.
          </p>
          <p>
            Those differences show up in how you read, how long you can stay with
            a page, and how you get the idea back later. This reading names one
            primary pattern, then suggests focus length and explanations you can try.
          </p>
          <p>
            It is a starting point for how you learn, not a limit on what you
            can study. It is not a scientific measure of intelligence, memory,
            or academic performance.
          </p>
        </div>

        <div className="mt-10 flex flex-col items-start gap-3">
          <Link href="/onboarding" className={`${ui.primary} min-h-[52px] text-base`}>
            Begin the reading
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/hub" className={`${ui.secondary} min-h-[52px] text-base`}>
            Skip for now
          </Link>
        </div>
      </main>
    </AppChrome>
  );
}
