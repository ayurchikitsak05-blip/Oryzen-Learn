"use client";

import React from "react";
import { Palette } from "lucide-react";
import { ui } from "@/components/ui/classes";
import { useOptionalStudyRhythm } from "./rhythm-context";

export default function StudyRhythmButton({
  label = "My Study Rhythm",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const rhythm = useOptionalStudyRhythm();
  if (!rhythm) return null;
  return (
    <button
      type="button"
      data-testid="study-rhythm-open"
      onClick={rhythm.openSheet}
      className={className ?? `${ui.secondary} inline-flex`}
    >
      <Palette className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
