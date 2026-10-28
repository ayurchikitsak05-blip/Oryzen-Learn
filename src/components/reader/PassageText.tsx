"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  lookupDictionaryEntry,
  type DictionaryEntry,
  type DictionaryLookupStatus,
} from "@/lib/reader/dictionary-lookup";
import { marksOnSurface, selectionOffsetsInPassage } from "@/lib/reader/highlight-anchor";
import type { PdfTextRun } from "@/lib/reader/pdf-text-layer";

export type ReaderMarkKind = "highlight" | "underline";

export interface ReaderTextMark {
  id: string;
  chunkId: string;
  start: number;
  end: number;
  kind: ReaderMarkKind;
}

interface LookupAnchor {
  word: string;
  top: number;
  left: number;
}

export interface SelectionToolbarState {
  top: number;
  left: number;
  start: number;
  end: number;
  text: string;
}

export interface PassageTextProps {
  chunkId: string;
  text: string;
  marks: readonly ReaderTextMark[];
  overlay?: boolean;
  placedLines?: readonly PdfTextRun[];
  onAddMark: (mark: Omit<ReaderTextMark, "id">) => void;
  onExplain: (selectedText: string) => void;
  onAddNote: (quote: string, note: string) => void;
  onSelectionChange?: (selection: SelectionToolbarState | null) => void;
}

function plainOffsets(
  root: HTMLElement,
  range: Range
): { start: number; end: number } | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().length;
  if (end <= start) return null;
  return { start, end };
}

function buildSegments(text: string, marks: readonly ReaderTextMark[]) {
  const bounds = new Set<number>([0, text.length]);
  for (const mark of marks) {
    bounds.add(Math.max(0, Math.min(text.length, mark.start)));
    bounds.add(Math.max(0, Math.min(text.length, mark.end)));
  }
  const points = [...bounds].sort((a, b) => a - b);
  const segments: Array<{
    start: number;
    end: number;
    text: string;
    highlight: boolean;
    underline: boolean;
  }> = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) continue;
    const active = marks.filter((mark) => mark.start < end && mark.end > start);
    segments.push({
      start,
      end,
      text: text.slice(start, end),
      highlight: active.some((mark) => mark.kind === "highlight"),
      underline: active.some((mark) => mark.kind === "underline"),
    });
  }

  return segments;
}

function WordLookupPopup({
  anchor,
  onClose,
}: {
  anchor: LookupAnchor;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [status, setStatus] = useState<"loading" | DictionaryLookupStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const popupWidth =
    typeof window === "undefined" ? 288 : Math.min(288, window.innerWidth - 24);
  const showBelow = typeof window === "undefined" ? false : anchor.top < 140;

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setEntry(null);

    void lookupDictionaryEntry(anchor.word, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.status === "ready") {
          setEntry(result.entry);
          setStatus("ready");
          return;
        }
        setStatus(result.status);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setStatus("error");
      });

    return () => controller.abort();
  }, [anchor.word, attempt]);

  return (
    <div
      role="dialog"
      aria-label={`Meaning of ${anchor.word}`}
      data-testid="reader-dictionary-dialog"
      data-status={status}
      className="surface-card fixed z-50 p-4 text-left shadow-[0_16px_40px_-24px_rgba(32,36,43,0.45)]"
      style={{
        top: showBelow ? anchor.top + 16 : Math.max(12, anchor.top - 12),
        left:
          typeof window === "undefined"
            ? anchor.left
            : Math.min(window.innerWidth - popupWidth - 12, Math.max(12, anchor.left)),
        width: popupWidth,
        transform: showBelow ? "none" : "translateY(-100%)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm text-heading">
            {anchor.word}
          </p>
          {entry?.phonetic && (
            <p className="text-xs text-muted">{entry.phonetic}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 rounded-xl px-2 text-xs font-medium text-muted"
        >
          Close
        </button>
      </div>
      <div className="mt-2 text-sm leading-relaxed text-ink" aria-live="polite">
        {status === "loading" && "Looking up this word…"}
        {status === "ready" && entry && (
          <>
            {entry.partOfSpeech && (
              <span className="mr-1 text-xs uppercase tracking-wide text-muted">
                {entry.partOfSpeech}
              </span>
            )}
            {entry.definition}
          </>
        )}
        {status === "missing" && "No dictionary entry for this word."}
        {status === "timeout" && "The dictionary timed out. Try again."}
        {status === "error" && "The dictionary could not be reached just now."}
      </div>
      {(status === "timeout" || status === "error") && (
        <button
          type="button"
          data-testid="reader-dictionary-retry"
          onClick={() => setAttempt((count) => count + 1)}
          className="btn-primary mt-3 min-h-11 px-3 text-xs"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export default function PassageText({
  chunkId,
  text,
  marks,
  overlay = false,
  placedLines,
  onAddMark,
  onExplain,
  onAddNote,
  onSelectionChange,
}: PassageTextProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const [lookup, setLookup] = useState<LookupAnchor | null>(null);
  const [toolbar, setToolbar] = useState<SelectionToolbarState | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noting, setNoting] = useState(false);
  const chunkMarks = marks.filter((mark) => mark.chunkId === chunkId);
  const aligned = placedLines && placedLines.length > 0 ? placedLines : null;
  const source = aligned ? aligned.map((line) => line.text).join(" ") : text;
  const surfaceMarks = marksOnSurface(text, source, chunkMarks);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      const popup = document.getElementById("reader-word-lookup");
      const tools = document.getElementById("reader-selection-tools");
      const study = document.getElementById("study-result-workspace") ?? document.querySelector("[data-testid=study-result-workspace]");
      const readerTools = document.querySelector("[data-testid=reader-toolbar]");
      if (
        popup?.contains(target) ||
        tools?.contains(target) ||
        study?.contains(target) ||
        readerTools?.contains(target)
      ) {
        return;
      }
      setLookup(null);
      setToolbar(null);
      onSelectionChangeRef.current?.(null);
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, []);

  const readSelectionRef = useRef<() => void>(() => undefined);
  readSelectionRef.current = () => {
    const selection = window.getSelection();
    const root = rootRef.current;
    if (!selection || selection.isCollapsed || !root) return;
    if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return;
    const range = selection.getRangeAt(0);
    const offsets = plainOffsets(root, range);
    const selected = range.toString().replace(/\s+/g, " ").trim();
    if (!offsets || !selected) return;
    const anchored = selectionOffsetsInPassage(text, selected, offsets.start, offsets.end, source);
    const rect = range.getBoundingClientRect();
    setNoting(false);
    setNoteDraft("");
    const next = {
      top: rect.top,
      left: rect.left + rect.width / 2,
      start: anchored?.start ?? -1,
      end: anchored?.end ?? -1,
      text: selected,
    };
    setToolbar(next);
    onSelectionChangeRef.current?.(next);
  };

  useEffect(() => {
    const onChange = () => readSelectionRef.current();
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  const applyMark = (kind: ReaderMarkKind) => {
    if (!toolbar || toolbar.start < 0 || toolbar.end <= toolbar.start) return;
    onAddMark({
      chunkId,
      start: toolbar.start,
      end: toolbar.end,
      kind,
    });
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
  };

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !aligned) return;
    const nodes = root.querySelectorAll<HTMLElement>("[data-testid=pdf-text-run]");
    nodes.forEach((node, index) => {
      const run = aligned[index];
      const measured = node.scrollWidth;
      if (!run || measured <= 0 || run.width <= 0) return;
      node.style.transform = `scaleX(${run.width / measured})`;
      node.style.transformOrigin = "left top";
    });
  }, [aligned, source]);

  const segments = buildSegments(source, surfaceMarks);

  const renderPieces = (segment: (typeof segments)[number]) => {
    const wordPattern = /(\s+|\S+)/g;
    const pieces = segment.text.match(wordPattern) ?? [segment.text];
    let cursor = segment.start;
    return pieces.map((piece) => {
      const start = cursor;
      cursor += piece.length;
      if (/^\s+$/.test(piece)) {
        return <span key={`${start}-space`}>{piece}</span>;
      }
      const lookupWord = piece.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
      return (
        <span
          key={`${start}-${piece}`}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            const current = window.getSelection();
            if ((current && !current.isCollapsed) || toolbar) return;
            if (!lookupWord) return;
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setLookup({
              word: lookupWord,
              top: rect.top,
              left: rect.left,
            });
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !lookupWord) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setLookup({
              word: lookupWord,
              top: rect.top,
              left: rect.left,
            });
          }}
          className="cursor-pointer rounded-sm hover:bg-beige-2"
        >
          {piece}
        </span>
      );
    });
  };

  const renderSegment = (segment: (typeof segments)[number]) => (
    <span
      key={`${segment.start}-${segment.end}`}
      className={`${segment.highlight ? "rounded-sm bg-selected text-heading" : ""} ${segment.underline ? "underline decoration-accent decoration-2 underline-offset-4" : ""}`}
    >
      {renderPieces(segment)}
    </span>
  );

  let lineCursor = 0;

  return (
    <>
      <div
        ref={rootRef}
        onMouseUp={() => readSelectionRef.current()}
        onTouchEnd={(event) => {
          if (event.touches.length > 0 || event.changedTouches.length > 1) return;
          window.setTimeout(() => readSelectionRef.current(), 40);
        }}
        className={
          aligned
            ? "relative h-full w-full select-text font-sans text-transparent selection:bg-selected selection:text-heading"
            : overlay
              ? "font-reading-family h-full w-full text-[11px] leading-tight text-transparent selection:bg-selected selection:text-heading"
              : "text-sm leading-relaxed"
        }
      >
        {aligned
          ? aligned.map((line, index) => {
              const lineStart = lineCursor;
              lineCursor += line.text.length;
              const lineEnd = lineCursor;
              const lineSegments = segments.flatMap((segment) => {
                const start = Math.max(segment.start, lineStart);
                const end = Math.min(segment.end, lineEnd);
                if (end <= start) return [];
                return [
                  {
                    ...segment,
                    start,
                    end,
                    text: source.slice(start, end),
                  },
                ];
              });
              const spacer =
                index < aligned.length - 1 ? (
                  <span key={`${line.left}-gap`} className="absolute overflow-hidden">
                    {" "}
                  </span>
                ) : null;
              if (index < aligned.length - 1) lineCursor += 1;
              return (
                <React.Fragment key={`${line.left}-${line.top}-${index}`}>
                  <span
                    data-testid="pdf-text-run"
                    className="absolute whitespace-pre"
                    style={{
                      left: line.left,
                      top: line.top,
                      fontSize: line.fontSize,
                      lineHeight: 1,
                      fontFamily: "Helvetica, Arial, sans-serif",
                    }}
                  >
                    {lineSegments.map(renderSegment)}
                  </span>
                  {spacer}
                </React.Fragment>
              );
            })
          : segments.map(renderSegment)}
      </div>

      {toolbar && !overlay && (
        <div
          id="reader-selection-tools"
          role="toolbar"
          aria-label="Highlight, note, copy, and look up"
          className="surface-card fixed z-50 w-[min(22rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-full p-2 shadow-[0_16px_40px_-24px_rgba(32,36,43,0.45)]"
          style={{ top: Math.max(72, toolbar.top - 8), left: toolbar.left }}
        >
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              data-testid="reader-highlight"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyMark("highlight")}
              className="btn-primary px-3 text-xs"
            >
              Highlight
            </button>
            <button
              type="button"
              data-testid="reader-underline"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyMark("underline")}
              className="btn-ghost px-3 text-xs"
            >
              Underline
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setNoting(true)}
              className="btn-ghost px-3 text-xs"
            >
              Add Note
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                void navigator.clipboard?.writeText(toolbar.text);
                setToolbar(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="btn-ghost px-3 text-xs"
            >
              Copy
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onExplain(toolbar.text);
                setToolbar(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="btn-ghost px-3 text-xs"
            >
              Explain
            </button>
            <button
              type="button"
              data-testid="reader-lookup"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const word = toolbar.text.replace(/[^A-Za-z0-9' -]/g, " ").trim().split(/\s+/)[0];
                if (!word) return;
                setLookup({ word, top: toolbar.top, left: toolbar.left });
                setToolbar(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="btn-ghost px-3 text-xs"
            >
              Look Up
            </button>
          </div>
          {noting && (
            <form
              className="mt-2 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                const body = noteDraft.trim();
                if (!body) return;
                onAddNote(toolbar.text, body);
                setNoteDraft("");
                setNoting(false);
                setToolbar(null);
                window.getSelection()?.removeAllRanges();
              }}
            >
              <label className="block text-[11px] font-medium uppercase tracking-wide text-muted">
                Margin note
                <textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  rows={3}
                  className="field-input mt-1 text-sm"
                />
              </label>
              <button
                type="submit"
                className="btn-primary px-3 text-xs"
              >
                Save note
              </button>
            </form>
          )}
        </div>
      )}

      {lookup &&
        createPortal(
          <div id="reader-word-lookup" data-testid="reader-word-lookup">
            <WordLookupPopup
              key={`${lookup.word}-${lookup.top}-${lookup.left}`}
              anchor={lookup}
              onClose={() => setLookup(null)}
            />
          </div>,
          document.body
        )}
    </>
  );
}
