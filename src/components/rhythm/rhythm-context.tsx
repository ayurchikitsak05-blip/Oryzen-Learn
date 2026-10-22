"use client";

import { createContext, useContext } from "react";
import type { RhythmSuggestion } from "@/lib/rhythm/suggest";
import type { StudyRhythmPrefs, ThemeId } from "@/lib/rhythm/types";

export interface StudyRhythmContextValue {
  prefs: StudyRhythmPrefs;
  suggestion: RhythmSuggestion;
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  setThemeId: (themeId: ThemeId) => void;
  updatePrefs: (patch: Partial<StudyRhythmPrefs>) => void;
  applySuggestion: () => void;
}

export const StudyRhythmContext = createContext<StudyRhythmContextValue | null>(null);

export function useStudyRhythm(): StudyRhythmContextValue {
  const value = useContext(StudyRhythmContext);
  if (!value) {
    throw new Error("useStudyRhythm must be used inside StudyRhythmProvider");
  }
  return value;
}

export function useOptionalStudyRhythm(): StudyRhythmContextValue | null {
  return useContext(StudyRhythmContext);
}
