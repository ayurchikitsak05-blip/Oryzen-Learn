"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignedInScope } from "@/components/coach/CoachHost";
import AppChrome from "@/components/layout/AppChrome";
import { ListenButton } from "@/components/speech/ListenButton";
import { ui } from "@/components/ui/classes";
import { isAccountVaultUnlocked } from "@/lib/privacy/account-vault";
import { patchSprintPrefs } from "@/lib/sprint/persist";
import { readStudyProfile } from "@/lib/study/style-quiz";
import { techniquesFor, type Technique } from "@/lib/study/techniques";
import { UNIVERSE_PRESETS } from "@/lib/universe";
import type { UniverseProfileId } from "@/lib/universe/types";

function TechniqueCard({ technique, onTry }: { technique: Technique; onTry: (t: Technique) => void }) {
  return (
    <article className={`${ui.cardPad} space-y-3`} data-testid={`technique-${technique.id}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className={`${ui.heading} text-lg`}>{technique.name}</h3>
        <ListenButton text={`${technique.name}. ${technique.oneLine} ${technique.steps.join(". ")}`} />
      </div>
      <p className="text-sm text-ink">{technique.oneLine}</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
        {technique.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      {technique.sprint ? (
        <button type="button" className={`${ui.primary} min-h-11`} onClick={() => onTry(technique)} data-testid={`try-${technique.id}`}>
          Try it: {technique.sprint.minutes}-minute sprint
        </button>
      ) : technique.link ? (
        <Link href={technique.link.href} className={`${ui.secondary} min-h-11`}>{technique.link.label}</Link>
      ) : null}
    </article>
  );
}

export default function TechniquesPage() {
  const router = useRouter();
  const userId = useSignedInScope();
  const [profileId, setProfileId] = useState<UniverseProfileId | null>(null);
  useEffect(() => {
    setProfileId(isAccountVaultUnlocked() ? readStudyProfile(userId)?.profileId ?? null : null);
  }, [userId]);
  const { suited, others } = techniquesFor(profileId);

  const tryIt = (technique: Technique) => {
    if (!technique.sprint) return;
    patchSprintPrefs({ preferredDuration: technique.sprint.minutes, preferredBreakMinutes: technique.sprint.breakMinutes }, userId);
    router.push("/sprint");
  };

  return (
    <AppChrome subtitle="Study techniques">
      <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10" data-testid="techniques">
        <header>
          <h1 className={`${ui.heading} text-3xl`}>Study techniques</h1>
          <p className="mt-2 text-sm text-muted">
            {profileId
              ? `Suggested for your style, ${UNIVERSE_PRESETS[profileId].modernName}, first. Try one for a week.`
              : "Take My study style to see which techniques suit you best."}
          </p>
        </header>
        {!profileId ? (
          <Link href="/body-type" className={`${ui.secondary} min-h-11`}>Find my study style</Link>
        ) : null}
        {suited.length ? (
          <section className="space-y-3" aria-label="Suggested for you">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Suggested for you</h2>
            {suited.map((technique) => <TechniqueCard key={technique.id} technique={technique} onTry={tryIt} />)}
          </section>
        ) : null}
        <section className="space-y-3" aria-label="More techniques">
          {suited.length ? (
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">More techniques</h2>
          ) : null}
          {others.map((technique) => <TechniqueCard key={technique.id} technique={technique} onTry={tryIt} />)}
        </section>
      </main>
    </AppChrome>
  );
}
