"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyThemeToDocument,
  readRhythmPrefs,
  writeRhythmPrefs,
} from "@/lib/rhythm/persist";
import { suggestRhythm, type RhythmSuggestion } from "@/lib/rhythm/suggest";
import { DEFAULT_RHYTHM_PREFS, type StudyRhythmPrefs } from "@/lib/rhythm/types";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { StudyRhythmContext, type StudyRhythmContextValue } from "./rhythm-context";
import StudyRhythmSheet from "./StudyRhythmSheet";

export { useOptionalStudyRhythm, useStudyRhythm } from "./rhythm-context";

declare global {
  interface Window {
    __oryzenSetRhythmOpen?: (open: boolean) => void;
  }
}

export default function StudyRhythmProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<StudyRhythmPrefs>(() => {
    if (typeof window === "undefined") return DEFAULT_RHYTHM_PREFS;
    const next = readRhythmPrefs();
    applyThemeToDocument(next.themeId);
    return next;
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<RhythmSuggestion>(() => suggestRhythm(null));

  useEffect(() => {
    const next = readRhythmPrefs();
    setPrefs(next);
    applyThemeToDocument(next.themeId);
    const timer = window.setTimeout(() => {
      void fetchSignedInUser()
        .then((user) => setSuggestion(suggestRhythm(user?.userId ?? null)))
        .catch(() => setSuggestion(suggestRhythm(null)));
    }, 0);
    window.__oryzenSetRhythmOpen = setSheetOpen;
    const onOpen = () => setSheetOpen(true);
    const onClose = () => setSheetOpen(false);
    window.addEventListener("oryzen-open-rhythm", onOpen);
    window.addEventListener("oryzen-close-rhythm", onClose);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("oryzen-open-rhythm", onOpen);
      window.removeEventListener("oryzen-close-rhythm", onClose);
    };
  }, []);

  const commit = useCallback((next: StudyRhythmPrefs) => {
    const saved = writeRhythmPrefs(next);
    setPrefs(saved);
    applyThemeToDocument(saved.themeId);
  }, []);

  if (typeof window !== "undefined") {
    window.__oryzenSetRhythmOpen = setSheetOpen;
  }

  const value = useMemo<StudyRhythmContextValue>(
    () => ({
      prefs,
      suggestion,
      sheetOpen,
      openSheet: () => setSheetOpen(true),
      closeSheet: () => setSheetOpen(false),
      setThemeId: (themeId) => commit({ ...prefs, themeId }),
      updatePrefs: (patch) => commit({ ...prefs, ...patch }),
      applySuggestion: () =>
        commit({
          ...prefs,
          themeId: suggestion.themeId,
          coachStyle: suggestion.coachStyle,
          suggestionState: "applied",
        }),
    }),
    [commit, prefs, sheetOpen, suggestion]
  );

  return (
    <StudyRhythmContext.Provider value={value}>
      {children}
      <StudyRhythmSheet />
    </StudyRhythmContext.Provider>
  );
}
