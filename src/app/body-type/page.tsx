"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import AccountMenu from "@/components/auth/AccountMenu";
import AppChrome from "@/components/layout/AppChrome";
import { ui } from "@/components/ui/classes";
import { BODY_QUESTIONS, STUDY_QUESTIONS, STYLE_DISCLAIMER } from "@/lib/study/style-quiz";

export default function StudyStyleIntroPage() {
  const total = BODY_QUESTIONS.length + STUDY_QUESTIONS.length;
  return (
    <AppChrome subtitle="My study style" actions={<AccountMenu />}>
      <main className="mx-auto w-full max-w-xl space-y-5 px-4 py-6 md:py-10">
        <header>
          <p className={ui.eyebrow}>Optional · about 8 minutes</p>
          <h1 className={`${ui.heading} mt-2 text-3xl`}>Find your study style</h1>
        </header>
        <div className={`${ui.cardPad} space-y-3 text-base leading-relaxed text-ink`}>
          <p>
            People study from different kinds of energy. Some catch ideas quickly and need short, lively
            sprints. Some focus sharply for longer. Some start slowly, then keep going and remember for a long time.
          </p>
          <p>
            Answer {total} quick questions: {BODY_QUESTIONS.length} about you, based on the body types described in
            traditional Ayurveda, and {STUDY_QUESTIONS.length} about how you study. You get your style (Spark,
            Laser, Anchor or a mix) and study settings that suit you: sprint length, breaks, daily goal and more.
          </p>
        </div>
        <p className="text-xs leading-relaxed text-muted">{STYLE_DISCLAIMER}</p>
        <div className="grid gap-2">
          <Link href="/onboarding" className={`${ui.primary} min-h-[52px] text-base`} data-testid="style-start">
            Start
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/hub" className={`${ui.secondary} min-h-[52px] text-base`}>
            Not now
          </Link>
        </div>
      </main>
    </AppChrome>
  );
}
