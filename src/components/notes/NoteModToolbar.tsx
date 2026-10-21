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
    label: "Explain Further",
    shortTag: "Add a fuller explanation",
  },
  {
    action: "subtract_detail",
    label: "Make It Easier",
    shortTag: "Use simpler language",
  },
  {
    action: "illustrative_example",
    label: "Show an Example",
    shortTag: "Add a concrete example",
  },
  {
    action: "ayurvedic_lens",
    label: "Explore My Learning Approach",
    shortTag: "See this through your study preferences",
  },
  {
    action: "convert_table_flowchart",
    label: "Turn Into a Table",
    shortTag: "Organize this as a table",
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
          className="btn-secondary text-xs disabled:opacity-50"
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
