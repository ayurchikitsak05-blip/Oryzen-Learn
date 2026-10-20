"use client";

import React from "react";
import type { PrakritiThemePalette } from "@/lib/prakriti/config";
import type { NoteModificationAction } from "@/lib/ai/adaptive-memory";

export interface NoteModButtonSpec {
  action: NoteModificationAction;
  label: string;
  shortTag: string;
}

export const NOTE_MODIFICATION_BUTTONS: readonly NoteModButtonSpec[] = [
  {
    action: "add_detail",
    label: "Add Detail",
    shortTag: "Expand the explanation",
  },
  {
    action: "subtract_detail",
    label: "Simplify",
    shortTag: "Distill to exam essence",
  },
  {
    action: "illustrative_example",
    label: "Example",
    shortTag: "Add a quick analogy",
  },
  {
    action: "ayurvedic_lens",
    label: "Constitution Lens",
    shortTag: "Map the note to Vata, Pitta, and Kapha",
  },
  {
    action: "convert_table_flowchart",
    label: "Table",
    shortTag: "Turn into a recall matrix",
  },
] as const;

export interface NoteModToolbarProps {
  noteId: string;
  citationBadge: string;
  onModifyNote: (action: NoteModificationAction) => void;
  disabled?: boolean;
  theme: PrakritiThemePalette;
}

export default function NoteModToolbar({
  noteId,
  citationBadge,
  onModifyNote,
  disabled = false,
}: NoteModToolbarProps) {
  return (
    <div
      data-testid={`note-mod-toolbar-${noteId}`}
      role="toolbar"
      aria-label={`Modify study note ${citationBadge}`}
      className="flex flex-wrap items-center gap-2 pt-3"
    >
      {NOTE_MODIFICATION_BUTTONS.map((btn) => (
        <button
          key={btn.action}
          type="button"
          disabled={disabled}
          title={btn.shortTag}
          data-testid={`note-mod-btn-${noteId}-${btn.action}`}
          onClick={() => onModifyNote(btn.action)}
          className="inline-flex min-h-[44px] items-center rounded-full border border-zinc-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-900/80 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
