"use client";

import React, { useState } from "react";
import type { HighlightLensType } from "@/lib/prakriti/config";
import type { ReaderStudyLens } from "@/components/reader/StudyWorkspace";
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
  activeLens: ReaderStudyLens | null;
  loading: boolean;
  onSelectLens: (lens: ReaderStudyLens) => void;
  onHighlight?: () => void;
  onUnderline?: () => void;
  onClearSelection?: () => void;
  recommendedLensIds?: readonly HighlightLensType[];
  top?: number;
  left?: number;
}

function chipClass(active: boolean) {
  return `inline-flex min-h-8 items-center justify-center rounded-lg px-2 text-[11px] font-medium touch-manipulation disabled:opacity-50 ${
    active ? "bg-selected text-heading" : "text-ink hover:bg-beige-2"
  }`;
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
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const anchor = clampToolbarAnchor(top, left, viewportWidth, viewportHeight);
  const positioned = Boolean(anchor);

  return (
    <div
      id="reader-selection-tools"
      data-testid="multi-lens-highlight-toolbar"
      role="toolbar"
      aria-label="Explore this passage"
      className={`surface-card z-50 w-max max-w-[min(22rem,calc(100vw-0.75rem))] px-1.5 py-1 shadow-[0_12px_28px_-20px_rgba(32,36,43,0.4)] ${
        positioned ? "fixed" : ""
      }`}
      style={positioned && anchor ? { top: anchor.top, left: anchor.left, transform: "translateX(-50%)" } : undefined}
    >
      <p className="sr-only">
        Page {pageNumber} · {sectionHeading}
      </p>
      <div
        data-testid="highlight-toolbar-primary"
        className="flex max-w-[22rem] flex-wrap items-center justify-center gap-0.5"
      >
        {MULTI_LENS_ACTIONS.map((lens) => {
          const recommended = recommendedLensIds.includes(lens.id);
          return (
            <button
              key={lens.id}
              type="button"
              disabled={loading}
              data-testid={`lens-btn-${lens.id}`}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onSelectLens(lens.id)}
              className={chipClass(activeLens === lens.id)}
            >
              {lens.label}
              {recommended ? (
                <span className="sr-only">Recommended for you</span>
              ) : null}
            </button>
          );
        })}
        {onHighlight ? (
          <button
            type="button"
            data-testid="reader-highlight"
            onPointerDown={(event) => event.preventDefault()}
            onClick={onHighlight}
            className={chipClass(false)}
          >
            Highlight
          </button>
        ) : null}
        {onUnderline ? (
          <button
            type="button"
            data-testid="reader-underline"
            onPointerDown={(event) => event.preventDefault()}
            onClick={onUnderline}
            className={chipClass(false)}
          >
            Underline
          </button>
        ) : null}
        <button
          type="button"
          disabled={loading}
          data-testid="lens-btn-more"
          aria-expanded={moreOpen}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setMoreOpen((open) => !open)}
          className={chipClass(moreOpen)}
        >
          More
        </button>
        {onClearSelection ? (
          <button
            type="button"
            onPointerDown={(event) => event.preventDefault()}
            onClick={onClearSelection}
            className="inline-flex min-h-8 items-center rounded-lg px-2 text-[11px] font-medium text-muted hover:bg-beige-2"
          >
            Clear
          </button>
        ) : null}
      </div>
      {moreOpen ? (
        <div
          data-testid="highlight-toolbar-more-panel"
          className="mt-0.5 border-t border-line pt-0.5"
        >
          <button
            type="button"
            disabled={loading}
            data-testid="lens-btn-ayurvedic"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              onSelectLens("ayurvedic");
              setMoreOpen(false);
            }}
            className="inline-flex min-h-8 w-full items-center rounded-lg px-2 text-left text-[11px] font-medium text-ink hover:bg-beige-2 disabled:opacity-50"
          >
            Explore My Learning Approach
          </button>
          <button
            type="button"
            disabled={loading}
            data-testid="lens-btn-ask_my_book"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              onSelectLens("ask_my_book");
              setMoreOpen(false);
            }}
            className="inline-flex min-h-8 w-full items-center rounded-lg px-2 text-left text-[11px] font-medium text-ink hover:bg-beige-2 disabled:opacity-50"
          >
            Ask My Book
          </button>
        </div>
      ) : null}
    </div>
  );
}
