"use client";

import React, { useState } from "react";
import type { HighlightLensType } from "@/lib/prakriti/config";

export interface HighlightLensActionItem {
  id: HighlightLensType;
  label: string;
}

export const MULTI_LENS_ACTIONS: readonly HighlightLensActionItem[] = [
  { id: "explain", label: "Explain" },
  { id: "illustrative", label: "Illustrate" },
  { id: "story", label: "Story" },
  { id: "high_yield_revision", label: "Revise" },
  { id: "test_me", label: "Test Me" },
  { id: "save_passage", label: "Save" },
] as const;

export interface HighlightToolbarProps {
  selectedText: string;
  pageNumber: number;
  sectionHeading: string;
  activeLens: HighlightLensType | null;
  loading: boolean;
  onSelectLens: (lens: HighlightLensType) => void;
  onClearSelection?: () => void;
  recommendedLensIds?: readonly HighlightLensType[];
  top?: number;
  left?: number;
}

export default function HighlightToolbar({
  selectedText,
  pageNumber,
  sectionHeading,
  activeLens,
  loading,
  onSelectLens,
  onClearSelection,
  recommendedLensIds = [],
  top,
  left,
}: HighlightToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  if (!selectedText.trim()) return null;

  const positioned = typeof top === "number" && typeof left === "number";

  return (
    <div
      id="reader-selection-tools"
      data-testid="multi-lens-highlight-toolbar"
      role="toolbar"
      aria-label="Explore this passage"
      className={`surface-card z-50 w-[min(38rem,calc(100vw-1.5rem))] p-2 shadow-[0_16px_40px_-24px_rgba(32,36,43,0.45)] ${
        positioned ? "fixed -translate-x-1/2 -translate-y-full" : ""
      }`}
      style={positioned ? { top: Math.max(72, top - 8), left } : undefined}
    >
      <p className="sr-only">
        Page {pageNumber} · {sectionHeading}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {MULTI_LENS_ACTIONS.map((lens) => {
          const recommended = recommendedLensIds.includes(lens.id);
          return (
            <button
              key={lens.id}
              type="button"
              disabled={loading}
              data-testid={`lens-btn-${lens.id}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelectLens(lens.id)}
              className={`inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-medium disabled:opacity-50 ${
                activeLens === lens.id
                  ? "bg-selected text-heading"
                  : "text-ink hover:bg-beige-2"
              }`}
            >
              {lens.label}
              {recommended ? (
                <span className="ml-1 text-[10px] text-muted">For you</span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          disabled={loading}
          data-testid="lens-btn-ayurvedic"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setMoreOpen((open) => !open)}
          className="inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-medium text-ink hover:bg-beige-2"
        >
          More
        </button>
        {onClearSelection ? (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClearSelection}
            className="inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-medium text-muted hover:bg-beige-2"
          >
            Clear
          </button>
        ) : null}
      </div>
      {moreOpen ? (
        <button
          type="button"
          disabled={loading}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onSelectLens("ayurvedic");
            setMoreOpen(false);
          }}
          className="mt-1 w-full rounded-xl px-3 py-2 text-left text-xs text-ink hover:bg-beige-2"
        >
          Explore My Learning Approach
        </button>
      ) : null}
    </div>
  );
}
