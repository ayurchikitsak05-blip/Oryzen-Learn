"use client";

import { setVoiceGuide, voiceGuideOn } from "@/lib/speech/speak";
import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { ReadingSizeControl } from "@/components/reading/ReadingSizeControl";
import { FocusSoundPanel } from "@/components/universe/FocusSoundPanel";
import { activateCompanionStyle, readCompanionStore } from "@/lib/companion";
import type { CompanionStyle } from "@/lib/companion/types";
import { applyColour, COLOUR_CHOICES, colourForTheme, currentColour, type ColourId } from "@/lib/experience/colours";
import { ensureAccountVault } from "@/lib/privacy/account-vault";
import Link from "next/link";
import { readFocusGuardPrefs, writeFocusGuardPrefs } from "@/lib/sprint/guard";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { readLocalPrakritiProfile } from "@/lib/supabase/profile-sync";
import {
  readUniversePrefs,
  recommendedProfileForStudent,
  UNIVERSE_PRESETS,
  writeUniversePrefs,
  type UniversePrefs,
} from "@/lib/universe";

/** The three Take My Study tones (see the reply library), each with its helper's name. */
export const HELPER_CHOICES: readonly { style: CompanionStyle; name: string; tone: string }[] = [
  { style: "teacher", name: "Meera", tone: "Teacher" },
  { style: "buddy", name: "Aarav", tone: "Friend" },
  { style: "coach", name: "Kabir", tone: "Coach" },
];

const sectionClass = "space-y-3 rounded-2xl border border-line bg-surface p-4";

function suggestion(userId: string | null): { colour: ColourId; styleName: string } | null {
  if (!readLocalPrakritiProfile(userId)) return null;
  const preset = UNIVERSE_PRESETS[recommendedProfileForStudent(userId)];
  const colour = colourForTheme(preset.themeId);
  return colour ? { colour, styleName: preset.modernName } : null;
}

/** Personalize my space: colours, reading text, focus sound and the Take My Study helper. */
export function PersonalizeSpace() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [colour, setColour] = useState<ColourId | null>(null);
  const [suggested, setSuggested] = useState<{ colour: ColourId; styleName: string } | null>(null);
  const [universe, setUniverse] = useState<UniversePrefs | null>(null);
  const [helper, setHelper] = useState<CompanionStyle | null>(null);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [guardOn, setGuardOn] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false);
  useEffect(() => setVoiceOn(voiceGuideOn()), []);
  useEffect(() => setGuardOn(readFocusGuardPrefs().enabled), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await fetchSignedInUser().catch(() => null);
      const id = user?.userId ?? null;
      const opened = id ? await ensureAccountVault().catch(() => false) : true;
      if (cancelled) return;
      setUserId(id);
      setColour(currentColour(id));
      setUniverse(readUniversePrefs(id));
      setVaultOpen(Boolean(opened));
      if (opened) {
        setSuggested(suggestion(id));
        const store = readCompanionStore(id);
        // Tara (guide) uses the Teacher replies, so show Teacher as chosen.
        const style = store.prefs.style === "guide" ? "teacher" : store.prefs.style;
        setHelper(store.prefs.onboarded ? style : null);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestedLabel = suggested ? COLOUR_CHOICES.find((item) => item.id === suggested.colour)?.label : null;

  return (
    <div data-testid="personalize-space" className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Tools · Settings</p>
        <h1 className="font-display mt-1 text-3xl text-heading">Personalize my space</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Changes are saved on this device and apply straight away. Your books and notes don&apos;t change.
        </p>
      </header>

      <section className={sectionClass} aria-labelledby="personalize-colours" data-testid="personalize-colours">
        <h2 id="personalize-colours" className="font-semibold text-heading">Colours</h2>
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-labelledby="personalize-colours">
          {COLOUR_CHOICES.map((choice) => {
            const active = colour === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`colour-${choice.id}`}
                disabled={!ready}
                onClick={() => {
                  applyColour(choice.id, userId);
                  setColour(choice.id);
                }}
                className="flex flex-col items-center gap-1.5 rounded-xl p-1 text-xs font-medium text-ink disabled:opacity-60"
              >
                <span
                  className={`relative flex h-12 w-12 items-center justify-center rounded-full border-2 ${
                    active ? "border-heading" : "border-line"
                  }`}
                  style={{ background: choice.swatch.bg }}
                  aria-hidden="true"
                >
                  <span className="h-5 w-5 rounded-full" style={{ background: choice.swatch.accent }} />
                  {active ? (
                    <Check className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-heading p-0.5 text-canvas" />
                  ) : null}
                </span>
                {choice.label}
              </button>
            );
          })}
        </div>
        {suggested && suggestedLabel ? (
          <p className="text-sm text-muted" data-testid="colour-suggestion">
            {suggestedLabel} is suggested for your {suggested.styleName} study style.
          </p>
        ) : null}
      </section>

      <section className={sectionClass}>
        <h2 className="font-semibold text-heading">Reading text</h2>
        <ReadingSizeControl />
      </section>

      {ready && universe && vaultOpen ? (
        <section className="space-y-2" data-testid="personalize-audio">
          <FocusSoundPanel
            prefs={universe}
            onChange={(patch) => setUniverse(writeUniversePrefs({ ...universe, ...patch }, userId))}
          />
          <p className="px-1 text-sm text-muted">The sound you pick plays while a study sprint is running.</p>
        </section>
      ) : null}

      <section className={sectionClass} data-testid="personalize-guard">
        <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={guardOn}
            onChange={(event) => {
              setGuardOn(event.target.checked);
              writeFocusGuardPrefs({ enabled: event.target.checked });
            }}
            data-testid="guard-toggle"
          />
          <span>
            <span className="block font-semibold text-heading">Distraction guard in sprints</span>
            <span className="block text-muted">
              If you leave the app for more than a minute during a sprint, the timer pauses and welcomes you back.
            </span>
          </span>
        </label>
      </section>

      <section className={sectionClass} data-testid="personalize-voice">
        <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={voiceOn}
            onChange={(event) => {
              setVoiceOn(event.target.checked);
              setVoiceGuide(event.target.checked);
            }}
            data-testid="voice-guide-toggle"
          />
          <span>
            <span className="block font-semibold text-heading">Read each step aloud</span>
            <span className="block text-muted">
              Questions and steps are read out in your phone&apos;s own voice. You can also tap Listen on any note.
            </span>
          </span>
        </label>
      </section>

      <section className={sectionClass}>
        <h2 className="font-semibold text-heading">Morning revision reminder</h2>
        <p className="text-sm text-muted">
          Set a time and add it to your phone&apos;s calendar.{" "}
          <Link href="/revise" className="font-medium text-accent underline-offset-4 hover:underline">
            Open Morning revision
          </Link>
        </p>
      </section>

      <section className={sectionClass} aria-labelledby="personalize-helper" data-testid="personalize-helper">
        <h2 id="personalize-helper" className="font-semibold text-heading">Take My Study helper</h2>
        <p className="text-sm text-muted">
          How the written replies sound when you can&apos;t get started. Changing it starts a fresh chat.
        </p>
        {ready && !vaultOpen ? (
          <p className="text-sm text-muted">Your private study record is locked on this device, so this can&apos;t be changed right now.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="personalize-helper">
            {HELPER_CHOICES.map((choice) => {
              const active = helper === choice.style;
              return (
                <button
                  key={choice.style}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!ready}
                  data-testid={`helper-${choice.style}`}
                  onClick={() => {
                    if (active) return;
                    activateCompanionStyle(choice.style, userId);
                    setHelper(choice.style);
                  }}
                  className={`min-h-16 rounded-2xl border px-2 py-2 text-center text-sm transition-colors ${
                    active ? "border-beige bg-selected text-heading" : "border-line bg-canvas text-ink hover:bg-beige-2"
                  }`}
                >
                  <span className="block font-semibold">{choice.name}</span>
                  <span className="block text-xs text-muted">{choice.tone}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
