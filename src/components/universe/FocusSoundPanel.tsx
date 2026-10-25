"use client";

import React, { useEffect, useState } from "react";
import { choiceClass, ui } from "@/components/ui/classes";
import {
  FOCUS_SOUND_CATALOG,
  focusSounds,
  type FocusSoundId,
  type UniversePrefs,
} from "@/lib/universe";

export function FocusSoundPanel({
  prefs,
  onChange,
}: {
  prefs: UniversePrefs;
  onChange: (patch: Partial<UniversePrefs>) => void;
}) {
  const [error, setError] = useState("");

  useEffect(() => {
    focusSounds.setVolume(prefs.focusVolume);
    focusSounds.setMuted(prefs.focusMuted);
  }, [prefs.focusMuted, prefs.focusVolume]);

  useEffect(() => () => {
    focusSounds.stop();
  }, []);

  const play = async (sound: FocusSoundId) => {
    setError("");
    try {
      if (sound === "silence") {
        focusSounds.stop();
        onChange({ focusSound: "silence", soundEnabled: false });
        return;
      }
      await focusSounds.play(sound);
      onChange({ focusSound: sound, soundEnabled: true, focusMuted: false });
    } catch {
      setError("This browser blocked the sound. Tap play again after interacting with the page.");
    }
  };

  return (
    <section data-testid="focus-sound-panel" className={`${ui.card} space-y-4`}>
      <div>
        <p className={ui.eyebrow}>Focus sounds</p>
        <h2 className={`${ui.heading} mt-1 text-lg`}>Optional background sound</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Off by default. These are generated locally in the browser — not Spotify, and not a
          licensed recording. Nothing plays until you press Play.
        </p>
      </div>
      <div className="space-y-2">
        {FOCUS_SOUND_CATALOG.map((entry) => (
          <button
            key={entry.id}
            type="button"
            data-testid={`focus-sound-${entry.id}`}
            className={choiceClass(
              entry.id === "silence"
                ? !prefs.soundEnabled || prefs.focusSound === "silence"
                : prefs.focusSound === entry.id && prefs.soundEnabled
            )}
            onClick={() => void play(entry.id)}
          >
            <span>
              <strong className="block text-heading">{entry.label}</strong>
              <span className="text-xs text-muted">{entry.hint}</span>
            </span>
            <span className="text-xs text-muted">{entry.id === "silence" ? "Off" : "Play"}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="focus-sound-mute"
          className={ui.secondary}
          onClick={() => {
            const next = !prefs.focusMuted;
            focusSounds.setMuted(next);
            onChange({ focusMuted: next });
          }}
        >
          {prefs.focusMuted ? "Unmute" : "Mute"}
        </button>
        <label className="flex min-w-40 flex-1 items-center gap-2 text-sm text-muted">
          Volume
          <input
            data-testid="focus-sound-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={prefs.focusVolume}
            onChange={(event) => {
              const volume = Number(event.target.value);
              focusSounds.setVolume(volume);
              onChange({ focusVolume: volume });
            }}
          />
        </label>
      </div>
      {error ? <p className={ui.alert}>{error}</p> : null}
    </section>
  );
}
