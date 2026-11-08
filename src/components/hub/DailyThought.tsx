"use client";

import React, { useEffect, useState } from "react";
import { Sun } from "lucide-react";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { ListenButton } from "@/components/speech/ListenButton";
import { tipForToday } from "@/lib/motivation/tips";
import { usePrivateReady } from "@/lib/privacy/use-private-ready";
import { readStudyProfile } from "@/lib/study/style-quiz";

export function DailyThought() {
  const userId = useSignedInScope();
  const ready = usePrivateReady(userId);
  const [tip, setTip] = useState<string | null>(null);
  useEffect(() => {
    const profile = ready ? readStudyProfile(userId) : null;
    setTip(tipForToday(profile?.profileId ?? null));
  }, [userId, ready]);
  if (!tip) return null;
  return (
    <section
      className="flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
      data-testid="today-thought"
      aria-label="Today's thought"
    >
      <Sun className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm leading-relaxed text-ink">{tip}</p>
        <ListenButton text={tip} />
      </div>
    </section>
  );
}
