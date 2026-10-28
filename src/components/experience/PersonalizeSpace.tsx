"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ReadingSizeControl } from "@/components/reading/ReadingSizeControl";
import StudyRhythmButton from "@/components/rhythm/StudyRhythmButton";
import { FocusSoundPanel } from "@/components/universe/FocusSoundPanel";
import { READINESS_FEELINGS, READINESS_NOTE, readinessSuggestion, type ReadinessFeeling } from "@/lib/experience/check-in";
import {
  applyExperienceToDocument,
  resolveExperienceMode,
  writeExperiencePrefs,
  type ExperienceMode,
} from "@/lib/experience/persist";
import { EXPERIENCE_THEMES } from "@/lib/experience/themes";
import type { ExperienceId, ExperiencePrefs } from "@/lib/experience/types";
import { readRhythmPrefs } from "@/lib/rhythm/persist";
import { themeById } from "@/lib/rhythm/themes";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { readUniversePrefs, writeUniversePrefs, type UniversePrefs } from "@/lib/universe";

const EXPERIENCES: ExperienceId[] = ["focus", "studio", "momentum"];

export function PersonalizeSpace() {
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<ExperienceMode>("preserve");
  const [prefs, setPrefs] = useState<ExperiencePrefs | null>(null);
  const [universe, setUniverse] = useState<UniversePrefs | null>(null);
  const [feeling, setFeeling] = useState<ReadinessFeeling | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSignedInUser()
      .then((user) => {
        if (cancelled) return;
        const id = user?.userId ?? null;
        const resolved = resolveExperienceMode(id);
        setUserId(id);
        setMode(resolved.mode);
        setPrefs(resolved.prefs);
        setUniverse(readUniversePrefs(id));
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = (next: ExperiencePrefs) => {
    const saved = writeExperiencePrefs({ ...next, ownerId: userId });
    setPrefs(saved);
    setMode(saved.experience);
    applyExperienceToDocument({
      mode: saved.experience,
      prefs: saved,
      prakritiThemeId: readRhythmPrefs().themeId,
    });
  };

  const choose = (experience: ExperienceId) => {
    commit({
      ...(prefs ?? {
        version: 1,
        ownerId: userId,
        experience,
        usePrakritiAccent: true,
        decorations: experience === "studio",
        animations: true,
        rewards: true,
      }),
      experience,
      decorations: experience === "studio" ? (prefs?.decorations ?? true) : false,
    });
  };

  const prakritiName = themeById(readRhythmPrefs().themeId).name;
  const suggestion = readinessSuggestion(feeling);

  return (
    <div data-testid="personalize-space" className="mx-auto w-full max-w-3xl space-y-6 px-3 py-4 sm:px-4">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Personalize your space</p>
        <h1 className="font-reading text-3xl text-heading sm:text-4xl">Choose how this place feels</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink">
          Focus, Studio, and Momentum change the look. Your Prakriti profile still guides coaching and can tint the accent.
          Nothing here changes your books, notes, or plan.
        </p>
      </header>

      {mode === "preserve" ? (
        <p data-testid="personalize-current" className="rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-ink">
          Your current look stays as it is until you choose one of these. Focus is the recommended starting point.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3" data-testid="personalize-themes">
        {EXPERIENCES.map((id) => {
          const theme = EXPERIENCE_THEMES[id];
          const selected = mode === id;
          return (
            <button
              key={id}
              type="button"
              data-testid={`experience-${id}`}
              aria-pressed={selected}
              onClick={() => choose(id)}
              className={`experience-rise min-h-11 rounded-2xl border p-3 text-left ${
                selected ? "border-accent" : "border-line"
              }`}
              style={{ background: theme.tokens.card, color: theme.tokens.body }}
            >
              <span className="block text-xs font-medium uppercase tracking-[0.14em]" style={{ color: theme.tokens.textSecondary }}>
                {id === "focus" ? "Recommended" : id === "studio" ? "Playful" : "Performance"}
              </span>
              <span className="mt-1 block font-reading text-2xl" style={{ color: theme.tokens.heading }}>
                {theme.name}
              </span>
              <span className="mt-2 block text-sm leading-snug">{theme.mood}</span>
              <span className="mt-3 flex gap-1" aria-hidden="true">
                {[theme.tokens.bg, theme.tokens.beigePrimary, theme.tokens.accent, theme.tokens.heading].map((color) => (
                  <span key={color} className="h-6 w-6 rounded-full border" style={{ background: color, borderColor: theme.tokens.borders }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-3" data-testid="personalize-prakriti">
        <h2 className="font-reading text-xl text-heading">Prakriti accent</h2>
        <p className="text-sm text-ink">
          Current color tone: {prakritiName}. The questionnaire and study recommendations are unchanged.
        </p>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={prefs?.usePrakritiAccent !== false}
            disabled={!prefs}
            onChange={(event) => prefs && commit({ ...prefs, usePrakritiAccent: event.target.checked })}
          />
          Use my Prakriti accent when the contrast stays readable
        </label>
        <Link href="/universe" className="btn-secondary text-sm">
          Adjust Prakriti colors in Study Universe
        </Link>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-3" data-testid="personalize-rhythm">
        <h2 className="font-reading text-xl text-heading">Study Rhythm</h2>
        <p className="text-sm text-ink">
          Theme, session length, and encouragement live in these settings. They do not change your books or notes.
        </p>
        <StudyRhythmButton />
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-3">
        <h2 className="font-reading text-xl text-heading">Reading type</h2>
        <ReadingSizeControl />
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-3" data-testid="personalize-options">
        <h2 className="font-reading text-xl text-heading">Decorations and rewards</h2>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={Boolean(prefs?.decorations)}
            disabled={!prefs || mode !== "studio"}
            onChange={(event) => prefs && commit({ ...prefs, decorations: event.target.checked })}
          />
          Studio stationery wash on the home screen
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={prefs?.animations !== false}
            disabled={!prefs}
            onChange={(event) => prefs && commit({ ...prefs, animations: event.target.checked })}
          />
          Gentle motion
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={prefs?.rewards !== false}
            disabled={!prefs}
            onChange={(event) => prefs && commit({ ...prefs, rewards: event.target.checked })}
          />
          Show study rewards
        </label>
        <p className="text-sm text-muted">
          Rewards mark real study. There is no streak pressure, leaderboard, or paid reward.
        </p>
      </section>

      {mode === "momentum" ? (
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-3" data-testid="readiness-check">
          <h2 className="font-reading text-xl text-heading">How do you feel about studying right now?</h2>
          <div className="flex flex-wrap gap-2">
            {READINESS_FEELINGS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="btn-secondary text-sm"
                aria-pressed={feeling === item.id}
                onClick={() => setFeeling(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {suggestion ? <p className="text-sm text-ink">{suggestion}</p> : null}
          <p className="text-xs leading-relaxed text-muted">{READINESS_NOTE}</p>
        </section>
      ) : null}

      {ready && universe ? (
        <section className="space-y-2" data-testid="personalize-audio">
          <h2 className="font-reading text-xl text-heading">Ambient sound</h2>
          <p className="text-sm text-muted">The same generated sounds as Study Universe. Nothing streams in.</p>
          <FocusSoundPanel
            prefs={universe}
            onChange={(patch) => {
              const next = writeUniversePrefs({ ...universe, ...patch }, userId);
              setUniverse(next);
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
