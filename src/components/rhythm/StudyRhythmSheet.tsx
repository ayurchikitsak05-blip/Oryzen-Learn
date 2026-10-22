"use client";

import React, { useEffect, useId } from "react";
import { X } from "lucide-react";
import { choiceClass, ui } from "@/components/ui/classes";
import { THEME_DEFINITIONS, themeById } from "@/lib/rhythm/themes";
import type { CoachStyleId } from "@/lib/rhythm/types";
import { useStudyRhythm } from "./rhythm-context";

const COACH_OPTIONS: Array<{ value: CoachStyleId; label: string; hint: string }> = [
  { value: "balanced", label: "Balanced Support", hint: "Saved for later. Default voice." },
  { value: "calm", label: "Courage & Calm", hint: "Saved for later. Steady, short lines." },
  { value: "mastery", label: "Challenge & Mastery", hint: "Saved for later. Precise, adult." },
  { value: "momentum", label: "Momentum & Action", hint: "Saved for later. One next step." },
  { value: "off", label: "Off", hint: "No study encouragement when that feature arrives." },
];

export default function StudyRhythmSheet() {
  const titleId = useId();
  const { prefs, suggestion, sheetOpen, closeSheet, setThemeId, updatePrefs, applySuggestion } =
    useStudyRhythm();

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, closeSheet]);

  if (!sheetOpen) return null;

  const selected = themeById(prefs.themeId);

  return (
    <div
      className={ui.backdrop}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeSheet();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="study-rhythm-sheet"
        className={`${ui.modal} max-w-2xl motion-safe:animate-none`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={ui.eyebrow}>My Study Rhythm</p>
            <h2 id={titleId} className={`${ui.heading} mt-2 text-xl`}>
              Starting look and voice you can change
            </h2>
            {suggestion.hasProfile ? (
              <p className="mt-2 text-sm text-muted">
                Suggested from your learning profile — not required.
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Classic Soft Beige is the default. Change it anytime.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Close study rhythm"
            className={ui.iconBtn}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <fieldset className="mt-6">
          <legend className={ui.label}>Look</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Study theme">
            {THEME_DEFINITIONS.map((theme) => (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={prefs.themeId === theme.id}
                data-testid={`study-rhythm-theme-${theme.id}`}
                onClick={() => setThemeId(theme.id)}
                className={`${choiceClass(prefs.themeId === theme.id)} min-h-11`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-10 w-10 shrink-0 rounded-xl border border-line"
                    style={{ background: theme.tokens.bg, boxShadow: `inset 0 0 0 4px ${theme.tokens.beigePrimary}` }}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-heading">
                      {theme.name}
                      {theme.id === "classic" ? " · Default" : ""}
                    </span>
                    <span className="mt-1 block text-sm text-muted">{theme.mood}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className={`${ui.card} mt-5`} data-testid="study-rhythm-preview">
          <p className={ui.eyebrow}>Preview</p>
          <h3 className={`${ui.heading} mt-2 text-lg`}>{selected.name}</h3>
          <p className="mt-1 text-sm text-muted">{selected.mood}</p>
          <button type="button" className={`${ui.primary} mt-4`}>
            Start studying
          </button>
        </div>

        <fieldset className="mt-6">
          <legend className={ui.label}>Study Coach — saved for later</legend>
          <p className="mt-1 text-sm text-muted">
            A speaking style is stored here. The full encouragement library is not in this release.
          </p>
          <div className="mt-2 space-y-2" role="radiogroup" aria-label="Coach style placeholder">
            {COACH_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={(prefs.coachStyle ?? "balanced") === option.value}
                onClick={() => updatePrefs({ coachStyle: option.value })}
                className={choiceClass((prefs.coachStyle ?? "balanced") === option.value)}
              >
                <span>
                  <span className="block font-medium text-heading">{option.label}</span>
                  <span className="mt-1 block text-sm text-muted">{option.hint}</span>
                </span>
              </button>
            ))}
          </div>
          <label className="mt-4 flex min-h-11 items-center gap-2 text-sm text-heading">
            <input
              type="checkbox"
              checked={prefs.encouragementOff}
              onChange={(event) => updatePrefs({ encouragementOff: event.target.checked })}
            />
            Turn encouragement off when it arrives
          </label>
        </fieldset>

        <label className="mt-4 flex min-h-11 items-start gap-2 text-sm text-heading">
          <input
            className="mt-1"
            type="checkbox"
            checked={Boolean(prefs.pdfPaperOptIn)}
            onChange={(event) => updatePrefs({ pdfPaperOptIn: event.target.checked })}
          />
          <span>
            Tint the page paper to match my theme.
            <span className="mt-1 block text-sm text-muted">
              Off by default. Textbook colors stay as printed unless you turn this on later.
            </span>
          </span>
        </label>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className={ui.secondary} onClick={applySuggestion}>
            Use suggestion
          </button>
          <button
            type="button"
            className={ui.ghost}
            onClick={() => {
              updatePrefs({ suggestionState: "dismissed" });
              closeSheet();
            }}
          >
            Keep mine
          </button>
          <button type="button" className={ui.primary} onClick={closeSheet}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
