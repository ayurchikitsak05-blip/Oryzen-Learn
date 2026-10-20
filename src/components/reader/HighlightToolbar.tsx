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
    label: "Constitution View",
    shortDesc: "Map the passage to your Prakriti energy",
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
    id: "add_to_notebook",
    emoji: "📓",
    label: "Add to Notebook",
    shortDesc: "Save with a precise page deep-link",
  },
  {
    id: "test_me",
    emoji: "🎯",
    label: "Test Me",
    shortDesc: "Instant paragraph-grounded questions",
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
      aria-label="Multi-Lens Highlighting Actions"
      className="backdrop-blur-xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl shadow-xl shadow-zinc-950/5 p-8"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-zinc-500">Five-lens AI</p>
          <p className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Page {pageNumber}
            <span className="font-normal text-zinc-500">
              {" "}
              · {sectionHeading.slice(0, 42)}
            </span>
          </p>
        </div>

        {onClearSelection && (
          <button
            type="button"
            onClick={onClearSelection}
            className="inline-flex min-h-[44px] items-center rounded-full border border-zinc-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-900/80 px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 transition-all hover:opacity-90 active:scale-95"
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
                  ? "bg-[#C2410C] text-white hover:bg-amber-800 border-[#C2410C]"
                  : "border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/80 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100"
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <span aria-hidden="true">{lens.emoji}</span>
                <span>{lens.label}</span>
              </div>
              <span
                className={`mt-2 text-[11px] leading-relaxed ${
                  isSelected ? "opacity-80" : "text-zinc-500"
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
