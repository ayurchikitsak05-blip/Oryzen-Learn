"use client";

import React, { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { choiceClass, tabClass, ui } from "@/components/ui/classes";
import { patchCoachPrefs, readCoachPrefs } from "@/lib/coach/persist";
import { rhythmStyleFromVoice, voiceFromRhythmStyle } from "@/lib/coach/styles";
import { COACH_VOICE_IDS, COACH_VOICE_META, type CoachFrequency, type CoachVoiceId } from "@/lib/coach/types";
import { THEME_DEFINITIONS, themeById } from "@/lib/rhythm/themes";
import { useStudyRhythm } from "./rhythm-context";

const FREQUENCY_OPTIONS: Array<{ value: CoachFrequency; label: string; hint: string }> = [
  { value: "off", label: "Off", hint: "No motivational cards." },
  { value: "gentle", label: "Gentle", hint: "Key moments only — missed days, overwhelm, exam window, low quiz." },
  { value: "regular", label: "Regular", hint: "Dashboard plus key moments. Default." },
  { value: "frequent", label: "Frequent", hint: "Every supported trigger, still once per day unless you ask for another." },
];

export default function StudyRhythmSheet() {
  const titleId = useId();
  const { prefs, suggestion, sheetOpen, closeSheet, setThemeId, updatePrefs, applySuggestion } =
    useStudyRhythm();
  const [tab, setTab] = useState<"look" | "coach">("look");
  const [frequency, setFrequency] = useState<CoachFrequency>("regular");
  const selectedVoice = voiceFromRhythmStyle(prefs.coachStyle);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => {
      setFrequency(readCoachPrefs().frequency);
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
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

        <nav className="mt-5 flex flex-wrap gap-1" aria-label="Study rhythm sections">
          <button
            type="button"
            data-testid="study-rhythm-tab-look"
            className={tabClass(tab === "look")}
            onClick={() => setTab("look")}
          >
            Look
          </button>
          <button
            type="button"
            data-testid="study-rhythm-tab-coach"
            className={tabClass(tab === "coach")}
            onClick={() => setTab("coach")}
          >
            Coach
          </button>
        </nav>

        {tab === "look" && (
          <>
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
          </>
        )}

        {tab === "coach" && (
          <fieldset className="mt-6" data-testid="study-rhythm-coach">
            <legend className={ui.label}>Study Coach</legend>
            <p className="mt-1 text-sm text-muted">
              Speaking style is independent of theme and of your learning profile. Change it anytime.
            </p>
            <div className="mt-2 space-y-2" role="radiogroup" aria-label="Coach style">
              {COACH_VOICE_IDS.map((voice: CoachVoiceId) => {
                const option = COACH_VOICE_META[voice];
                return (
                  <button
                    key={voice}
                    type="button"
                    role="radio"
                    aria-checked={selectedVoice === voice}
                    data-testid={`study-rhythm-coach-${voice}`}
                    onClick={() => updatePrefs({ coachStyle: rhythmStyleFromVoice(voice) })}
                    className={choiceClass(selectedVoice === voice)}
                  >
                    <span>
                      <span className="block font-medium text-heading">{option.label}</span>
                      <span className="mt-1 block text-sm text-muted">{option.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className={`${ui.label} mt-5`}>How often</p>
            <div className="mt-2 space-y-2" role="radiogroup" aria-label="Coach frequency">
              {FREQUENCY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={frequency === option.value}
                  data-testid={`study-rhythm-frequency-${option.value}`}
                  onClick={() => {
                    setFrequency(option.value);
                    patchCoachPrefs({ frequency: option.value });
                  }}
                  className={choiceClass(frequency === option.value)}
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
                data-testid="study-rhythm-encouragement-off"
                type="checkbox"
                checked={prefs.encouragementOff}
                onChange={(event) => updatePrefs({ encouragementOff: event.target.checked })}
              />
              Turn motivational messages off
            </label>
          </fieldset>
        )}

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
