"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import type { HighlightLensType } from "@/lib/prakriti/config";
import type { ReaderStudyLens } from "@/components/reader/StudyWorkspace";
import {
  clampToolbarAnchor,
  firstLineHeightForPage,
  placeHighlightToolbar,
  TOOLBAR_ESTIMATED_HEIGHT,
} from "@/lib/reader/highlight-toolbar";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const fractionRef = useRef<{ x: number; y: number } | null>(null);
  const selectionKey = `${top ?? ""}:${left ?? ""}:${selectedText}`;
  const [toolbarHeight, setToolbarHeight] = useState(TOOLBAR_ESTIMATED_HEIGHT);
  const [anchor, setAnchor] = useState(() =>
    clampToolbarAnchor(
      top,
      left,
      typeof window !== "undefined" ? window.innerWidth : 1280,
      typeof window !== "undefined" ? window.innerHeight : 800
    )
  );

  useLayoutEffect(() => {
    fractionRef.current = null;
  }, [selectionKey]);

  useLayoutEffect(() => {
    const place = () => {
      const node = rootRef.current;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const measuredHeight = node?.offsetHeight ?? 0;
      const height = measuredHeight > 0 ? measuredHeight : toolbarHeight;
      if (measuredHeight > 0 && Math.abs(measuredHeight - toolbarHeight) > 2) {
        setToolbarHeight(measuredHeight);
      }
      const page = document.querySelector<HTMLElement>('[data-active="true"]');
      const rect = page?.getBoundingClientRect();
      if (!page || !rect || rect.height <= 0 || typeof top !== "number" || typeof left !== "number") {
        setAnchor(clampToolbarAnchor(top, left, viewportWidth, viewportHeight));
        return;
      }
      if (!fractionRef.current) {
        fractionRef.current = {
          x: rect.width > 0 ? (left - rect.left) / rect.width : 0.5,
          y: (top - rect.top) / rect.height,
        };
      }
      const fraction = fractionRef.current;
      const obstacles = [...page.querySelectorAll<HTMLElement>("[data-testid=pdf-text-run]")]
        .map((run) => run.getBoundingClientRect())
        .filter((box) => box.height > 4 && box.width > 8)
        .map((box) => ({ top: box.top, bottom: box.bottom, left: box.left, right: box.right }));
      setAnchor(
        placeHighlightToolbar({
          selectionTop: rect.top + fraction.y * rect.height,
          selectionLeft: rect.left + fraction.x * rect.width,
          pageTop: rect.top,
          firstLineHeight: firstLineHeightForPage(rect.height),
          toolbarWidth: node?.offsetWidth || Math.min(352, viewportWidth - 24),
          toolbarHeight: height,
          viewportWidth,
          viewportHeight,
          obstacles,
        })
      );
    };
    place();
    const host = document.querySelector("[data-testid=pdf-scroll-host]");
    const sheet = document.querySelector<HTMLElement>('[data-active="true"]');
    host?.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => place());
    if (sheet) observer?.observe(sheet);
    return () => {
      observer?.disconnect();
      host?.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
  }, [left, selectionKey, toolbarHeight, top]);

  if (!selectedText.trim()) return null;

  const positioned = Boolean(anchor);

  return (
    <div
      ref={rootRef}
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
