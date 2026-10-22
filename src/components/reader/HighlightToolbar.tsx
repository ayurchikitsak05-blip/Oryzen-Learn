"use client";

import React, { useState } from "react";
import type { HighlightLensType } from "@/lib/prakriti/config";
import { clampToolbarAnchor } from "@/lib/reader/highlight-toolbar";

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
  onHighlight?: () => void;
  onUnderline?: () => void;
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
  onHighlight,
  onUnderline,
  onClearSelection,
  recommendedLensIds = [],
  top,
  left,
}: HighlightToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  if (!selectedText.trim()) return null;

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
  const anchor = clampToolbarAnchor(top, left, viewportWidth);
  const positioned = Boolean(anchor);

  return (
    <div
      id="reader-selection-tools"
      data-testid="multi-lens-highlight-toolbar"
      role="toolbar"
      aria-label="Explore this passage"
      className={`surface-card z-50 w-[min(24rem,calc(100vw-1rem))] p-2 shadow-[0_16px_40px_-24px_rgba(32,36,43,0.45)] ${
        positioned
          ? "fixed max-md:!inset-x-2 max-md:!bottom-[5.25rem] max-md:!top-auto max-md:!left-auto max-md:!w-auto max-md:translate-x-0 max-md:translate-y-0 md:-translate-x-1/2 md:-translate-y-full"
          : ""
      }`}
      style={positioned && anchor ? { top: anchor.top, left: anchor.left } : undefined}
    >
      <p className="sr-only">
        Page {pageNumber} · {sectionHeading}
      </p>
      <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted md:hidden">
        Study this passage
      </p>
      <div
        data-testid="highlight-toolbar-primary"
        className="grid grid-cols-3 gap-1"
      >
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
              className={`inline-flex min-h-10 items-center justify-center rounded-xl px-2 text-xs font-medium disabled:opacity-50 ${
                activeLens === lens.id
                  ? "bg-selected text-heading"
                  : "text-ink hover:bg-beige-2"
              }`}
            >
              {lens.label}
              {recommended ? (
                <span className="ml-1 hidden text-[10px] text-muted sm:inline">For you</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={loading}
          data-testid="lens-btn-more"
          aria-expanded={moreOpen}
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
        <div
          data-testid="highlight-toolbar-more-panel"
          className="mt-1 grid grid-cols-2 gap-1 border-t border-line pt-1"
        >
          {onHighlight ? (
            <button
              type="button"
              data-testid="reader-highlight"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onHighlight}
              className="inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-medium text-ink hover:bg-beige-2"
            >
              Highlight
            </button>
          ) : null}
          {onUnderline ? (
            <button
              type="button"
              data-testid="reader-underline"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onUnderline}
              className="inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-medium text-ink hover:bg-beige-2"
            >
              Underline
            </button>
          ) : null}
          <button
            type="button"
            disabled={loading}
            data-testid="lens-btn-ayurvedic"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onSelectLens("ayurvedic");
              setMoreOpen(false);
            }}
            className="col-span-2 inline-flex min-h-10 items-center rounded-xl px-3 text-left text-xs font-medium text-ink hover:bg-beige-2 disabled:opacity-50"
          >
            Explore My Learning Approach
          </button>
        </div>
      ) : null}
    </div>
  );
}
