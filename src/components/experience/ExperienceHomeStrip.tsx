"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { achievementsFromSignals, type StudyActivitySignals } from "@/lib/experience/achievements";
import { experienceVisibleTo } from "@/lib/experience/persist";
import { fetchSignedInUser } from "@/lib/supabase/session";

export function ExperienceHomeStrip({
  signals,
  examDaysLeft = null,
}: {
  signals: StudyActivitySignals;
  examDaysLeft?: number | null;
}) {
  const [rewards, setRewards] = useState(true);
  const [experience, setExperience] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSignedInUser()
      .then((user) => {
        if (cancelled) return;
        const prefs = experienceVisibleTo(user?.userId ?? null);
        setRewards(prefs?.rewards !== false);
        setExperience(prefs?.experience ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const earned = rewards ? achievementsFromSignals(signals).filter((item) => item.earned) : [];

  return (
    <section data-testid="experience-home" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink">
          {experience === "studio"
            ? "Studio keeps rewards beside your study, not on the page."
            : experience === "momentum"
              ? "Momentum shows progress you have already recorded."
              : "Focus keeps the desk quiet. Rewards stay optional."}
        </p>
      </div>
      {experience === "momentum" && examDaysLeft != null && examDaysLeft >= 0 ? (
        <p className="text-sm text-heading" data-testid="momentum-exam">
          <Link href="/roadmap" className="underline decoration-accent underline-offset-4">
            {examDaysLeft === 0 ? "Exam day is on the saved plan." : `Exam in ${examDaysLeft} days on the saved plan.`}
          </Link>
        </p>
      ) : null}
      {signals.studiedMinutes != null && signals.studiedMinutes > 0 ? (
        <p className="text-sm text-muted" data-testid="momentum-minutes">
          Recorded today: {signals.studiedMinutes} minutes
          {experience === "momentum" ? ". This is study time, not a score." : "."}
        </p>
      ) : null}
      {earned.length > 0 ? (
        <ul className="flex flex-wrap gap-2" data-testid="study-rewards">
          {earned.map((item) => (
            <li key={item.id} className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-heading">
              {item.title}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">Rewards appear after real study. Nothing here is a streak.</p>
      )}
    </section>
  );
}
