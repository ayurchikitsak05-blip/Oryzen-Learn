"use client";

import React from "react";
import type { HighlightLensType, PrakritiThemePalette } from "@/lib/prakriti/config";

export interface HighlightLensActionItem {
  id: HighlightLensType;
  emoji: string;
  label: string;
  shortDesc: string;
}

export const MULTI_LENS_ACTIONS: readonly HighlightLensActionItem[] = [
  {
    id: "ayurvedic",
    emoji: "🌿",
    label: "Explore My Learning Approach",
    shortDesc: "See this idea through your study preferences",
  },
  {
    id: "illustrative",
    emoji: "🎨",
    label: "Illustrative View",
    shortDesc: "Flowcharts, analogies, and mind-maps",
  },
  {
    id: "high_yield_revision",
    emoji: "⚡",
    label: "Revision View",
    shortDesc: "Tables, bullets, and mnemonics",
  },
  {
    id: "save_passage",
    emoji: "📓",
    label: "Save to My Notebook",
    shortDesc: "Keep this idea in My Notebook",
  },
  {
    id: "test_me",
    emoji: "🎯",
    label: "Test Me",
    shortDesc: "Instant paragraph-grounded questions",
  },
  {
    id: "explain",
    emoji: "💬",
    label: "Explain This Passage",
    shortDesc: "A clear explanation from these lines",
  },
] as const;

export interface HighlightToolbarProps {
  selectedText: string;
  pageNumber: number;
  sectionHeading: string;
  activeLens: HighlightLensType | null;
  loading: boolean;
  onSelectLens: (lens: HighlightLensType) => void;
  onClearSelection?: () => void;
  theme: PrakritiThemePalette;
}

export default function HighlightToolbar({
  selectedText,
  pageNumber,
  sectionHeading,
  activeLens,
  loading,
  onSelectLens,
  onClearSelection,
}: HighlightToolbarProps) {
  if (!selectedText.trim()) {
    return null;
  }

  return (
    <div
      data-testid="multi-lens-highlight-toolbar"
      role="toolbar"
      aria-label="Explore this passage"
      className="surface-card p-5"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">Explore this passage</p>
          <p className="font-display text-sm text-heading">
            Page {pageNumber}
            <span className="block font-sans font-normal leading-snug text-muted sm:inline">
              {" "}
              · {sectionHeading}
            </span>
          </p>
        </div>

        {onClearSelection && (
          <button
            type="button"
            onClick={onClearSelection}
            className="btn-secondary text-xs"
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {MULTI_LENS_ACTIONS.map((lens) => {
          const isSelected = activeLens === lens.id;
          return (
            <button
              key={lens.id}
              type="button"
              disabled={loading}
              data-testid={`lens-btn-${lens.id}`}
              onClick={() => onSelectLens(lens.id)}
              className={`flex min-h-[56px] flex-col justify-between rounded-2xl border p-4 text-left transition-all active:scale-95 disabled:opacity-50 ${
                isSelected
                  ? "border-beige bg-selected text-heading"
                  : "border-line bg-surface text-ink"
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <span aria-hidden="true">{lens.emoji}</span>
                <span>{lens.label}</span>
              </div>
              <span
                className={`mt-2 text-[11px] leading-relaxed ${
                  isSelected ? "opacity-80" : "text-muted"
                }`}
              >
                {lens.shortDesc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
