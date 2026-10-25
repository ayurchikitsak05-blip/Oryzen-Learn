"use client";

import React from "react";
import { ui } from "@/components/ui/classes";
import { UNIVERSE_DISCLAIMER, UNIVERSE_PRESETS, type UniverseProfileId } from "@/lib/universe";

export function UniverseOffer({
  profileId,
  onCreate,
  onCustomize,
  onOpenReader,
}: {
  profileId: UniverseProfileId;
  onCreate: () => void;
  onCustomize: () => void;
  onOpenReader: () => void;
}) {
  const preset = UNIVERSE_PRESETS[profileId];
  return (
    <section data-testid="universe-offer" className="space-y-6">
      <div>
        <p className={ui.eyebrow}>My Study Universe</p>
        <h1 className={`${ui.heading} mt-2 text-3xl md:text-4xl`}>Create My Study Universe</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          One choice can set a theme, study rhythm, breaks, notes, and a text companion. You can
          skip this, change any part later, or keep a plain reader.
        </p>
      </div>
      <article className={ui.cardPad}>
        <p className={ui.eyebrow}>{preset.prakritiLabel}</p>
        <h2 className={`${ui.heading} mt-2 text-2xl`}>{preset.modernName}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{preset.tagline}</p>
        <ul className="mt-4 grid gap-2 text-sm text-ink md:grid-cols-2">
          <li>{preset.sessionMinutes}-minute focus, {preset.breakMinutes}-minute breaks</li>
          <li>{preset.explanationFormat} explanations</li>
          <li>{preset.noteStyle.replace("_", " ")} notes</li>
          <li>{preset.companionName} as a {preset.companionStyle} companion</li>
        </ul>
      </article>
      <p className={ui.notice}>{UNIVERSE_DISCLAIMER}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" data-testid="universe-create" className={ui.primary} onClick={onCreate}>
          Create My Study Universe
        </button>
        <button
          type="button"
          data-testid="universe-customize"
          className={ui.secondary}
          onClick={onCustomize}
        >
          Customize My Universe
        </button>
        <button type="button" data-testid="universe-open-reader" className={ui.ghost} onClick={onOpenReader}>
          Just Open My Reader
        </button>
      </div>
    </section>
  );
}
