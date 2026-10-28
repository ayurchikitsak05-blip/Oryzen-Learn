"use client";

import React, { useEffect } from "react";
import {
  applyExperienceToDocument,
  experienceVisibleTo,
  readExperienceRecord,
  resolveExperienceMode,
  writeExperiencePrefs,
} from "@/lib/experience/persist";
import { readRhythmPrefs, RHYTHM_CHANGED_EVENT } from "@/lib/rhythm/persist";
import { fetchSignedInUser } from "@/lib/supabase/session";

function paint(userId: string | null) {
  const resolved = resolveExperienceMode(userId);
  if (resolved.mode === "focus" && !experienceVisibleTo(userId) && !readExperienceRecord()) {
    const saved = writeExperiencePrefs(resolved.prefs ?? {
      version: 1,
      ownerId: userId,
      experience: "focus",
      usePrakritiAccent: true,
      decorations: false,
      animations: true,
      rewards: true,
    });
    applyExperienceToDocument({
      mode: "focus",
      prefs: saved,
      prakritiThemeId: readRhythmPrefs().themeId,
    });
    return;
  }
  const visible = experienceVisibleTo(userId);
  if (visible && userId && !visible.ownerId) {
    const saved = writeExperiencePrefs({ ...visible, ownerId: userId });
    applyExperienceToDocument({
      mode: saved.experience,
      prefs: saved,
      prakritiThemeId: readRhythmPrefs().themeId,
    });
    return;
  }
  applyExperienceToDocument({
    mode: resolved.mode,
    prefs: resolved.prefs,
    prakritiThemeId: readRhythmPrefs().themeId,
  });
}

export default function ExperienceProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    const run = (userId: string | null) => {
      if (!cancelled) paint(userId);
    };
    void fetchSignedInUser()
      .then((user) => run(user?.userId ?? null))
      .catch(() => run(null));
    const onChange = () => {
      void fetchSignedInUser()
        .then((user) => run(user?.userId ?? null))
        .catch(() => run(null));
    };
    window.addEventListener("oryzen-experience-changed", onChange);
    window.addEventListener(RHYTHM_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("oryzen-experience-changed", onChange);
      window.removeEventListener(RHYTHM_CHANGED_EVENT, onChange);
    };
  }, []);

  return children;
}
