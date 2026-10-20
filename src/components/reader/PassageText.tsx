"use client";

import React, { useEffect, useRef, useState } from "react";

export type ReaderMarkKind = "highlight" | "underline";

export interface ReaderTextMark {
  id: string;
  chunkId: string;
  start: number;
  end: number;
  kind: ReaderMarkKind;
}

interface DictionaryEntry {
  word: string;
  phonetic: string | null;
  partOfSpeech: string | null;
  definition: string;
}

interface LookupAnchor {
  word: string;
  top: number;
  left: number;
}

interface SelectionToolbarState {
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
  onAddMark: (mark: Omit<ReaderTextMark, "id">) => void;
  onExplain: (selectedText: string) => void;
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

function stripMarkup(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function lookupFreeDictionary(
  word: string,
  signal: AbortSignal
): Promise<DictionaryEntry | "missing" | null> {
  const response = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    { signal }
  );
  if (response.status === 404) return "missing";
  if (!response.ok) return null;
  const payload = (await response.json()) as Array<{
    phonetic?: string;
    meanings?: Array<{
      partOfSpeech?: string;
      definitions?: Array<{ definition?: string }>;
    }>;
  }>;
  const first = payload[0];
  const meaning = first?.meanings?.[0];
  const definition = meaning?.definitions?.[0]?.definition?.trim();
  if (!definition) return "missing";
  return {
    word,
    phonetic: first.phonetic ?? null,
    partOfSpeech: meaning?.partOfSpeech ?? null,
    definition,
  };
}

async function lookupWiktionary(
  word: string,
  signal: AbortSignal
): Promise<DictionaryEntry | "missing" | null> {
  const response = await fetch(
    `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
    { signal }
  );
  if (response.status === 404) return "missing";
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    en?: Array<{
      partOfSpeech?: string;
      definitions?: Array<{ definition?: string }>;
    }>;
  };
  const meaning = payload.en?.[0];
  const definition = stripMarkup(meaning?.definitions?.[0]?.definition ?? "");
  if (!definition) return "missing";
  return {
    word,
    phonetic: null,
    partOfSpeech: meaning?.partOfSpeech ?? null,
    definition,
  };
}

function WordLookupPopup({
  anchor,
  onClose,
}: {
  anchor: LookupAnchor;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">(
    "loading"
  );

  useEffect(() => {
    const controller = new AbortController();

    const ignoreAbort = (error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return null;
    };

    (async () => {
      setStatus("loading");
      setEntry(null);
      try {
        const query = anchor.word.toLowerCase();
        const primary = await lookupFreeDictionary(query, controller.signal).catch(
          ignoreAbort
        );
        const resolved =
          primary && primary !== "missing"
            ? primary
            : await lookupWiktionary(query, controller.signal).catch(ignoreAbort);
        if (!resolved || resolved === "missing") {
          setStatus(resolved === "missing" || primary === "missing" ? "missing" : "error");
          return;
        }
        setEntry(resolved);
        setStatus("ready");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      }
    })();

    return () => controller.abort();
  }, [anchor.word]);

  return (
    <div
      role="dialog"
      aria-label={`Meaning of ${anchor.word}`}
      className="fixed z-50 w-72 rounded-2xl border border-zinc-700 bg-zinc-900 p-4 text-left text-zinc-100 shadow-xl shadow-black/40"
      style={{
        top: Math.max(12, anchor.top - 12),
        left: Math.min(window.innerWidth - 300, Math.max(12, anchor.left)),
        transform: "translateY(-100%)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">
            {anchor.word}
          </p>
          {entry?.phonetic && (
            <p className="text-xs text-zinc-500">{entry.phonetic}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[32px] rounded-full px-2 text-xs font-medium text-zinc-500"
        >
          Close
        </button>
      </div>
      <div className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        {status === "loading" && "Looking up this word…"}
        {status === "ready" && entry && (
          <>
            {entry.partOfSpeech && (
              <span className="mr-1 text-xs uppercase tracking-wide text-zinc-400">
                {entry.partOfSpeech}
              </span>
            )}
            {entry.definition}
          </>
        )}
        {status === "missing" && "No dictionary entry for this word."}
        {status === "error" && "The dictionary could not be reached just now."}
      </div>
    </div>
  );
}

export default function PassageText({
  chunkId,
  text,
  marks,
  onAddMark,
  onExplain,
}: PassageTextProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [lookup, setLookup] = useState<LookupAnchor | null>(null);
  const [toolbar, setToolbar] = useState<SelectionToolbarState | null>(null);
  const chunkMarks = marks.filter((mark) => mark.chunkId === chunkId);

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      const popup = document.getElementById("reader-word-lookup");
      const tools = document.getElementById("reader-selection-tools");
      if (popup?.contains(target) || tools?.contains(target)) return;
      setLookup(null);
      setToolbar(null);
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, []);

  const handleMouseUp = () => {
    const selection = window.getSelection();
    const root = rootRef.current;
    if (!selection || selection.isCollapsed || !root) {
      return;
    }
    if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) {
      return;
    }
    const range = selection.getRangeAt(0);
    const offsets = plainOffsets(root, range);
    const selected = range.toString().trim();
    if (!offsets || !selected) return;
    const rect = range.getBoundingClientRect();
    setToolbar({
      top: rect.top,
      left: rect.left + rect.width / 2,
      start: offsets.start,
      end: offsets.end,
      text: selected,
    });
  };

  const applyMark = (kind: ReaderMarkKind) => {
    if (!toolbar) return;
    onAddMark({
      chunkId,
      start: toolbar.start,
      end: toolbar.end,
      kind,
    });
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
  };

  const segments = buildSegments(text, chunkMarks);

  return (
    <>
      <div
        ref={rootRef}
        onMouseUp={handleMouseUp}
        className="text-sm leading-relaxed"
      >
        {segments.map((segment) => {
          const wordPattern = /(\s+|\S+)/g;
          const pieces = segment.text.match(wordPattern) ?? [segment.text];
          let cursor = segment.start;
          return (
            <span
              key={`${segment.start}-${segment.end}`}
              className={`${segment.highlight ? "rounded-sm bg-zinc-200 text-zinc-950" : ""} ${segment.underline ? "underline decoration-zinc-300 decoration-2 underline-offset-4" : ""}`}
            >
              {pieces.map((piece) => {
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
                      if (current && !current.isCollapsed) return;
                      if (!lookupWord) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      setToolbar(null);
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
                    className="cursor-pointer rounded-sm hover:bg-zinc-800"
                  >
                    {piece}
                  </span>
                );
              })}
            </span>
          );
        })}
      </div>

      {toolbar && (
        <div
          id="reader-selection-tools"
          role="toolbar"
          aria-label="Highlight and underline"
          className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 p-1 shadow-xl shadow-black/40"
          style={{ top: Math.max(56, toolbar.top - 8), left: toolbar.left }}
        >
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applyMark("highlight")}
            className="min-h-[36px] rounded-full px-3 text-xs font-medium text-zinc-100 hover:bg-zinc-800"
          >
            Highlight
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applyMark("underline")}
            className="min-h-[36px] rounded-full px-3 text-xs font-medium text-zinc-100 underline hover:bg-zinc-800"
          >
            Underline
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onExplain(toolbar.text);
              setToolbar(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="min-h-[36px] rounded-full bg-white px-3 text-xs font-medium text-zinc-950 hover:bg-zinc-200"
          >
            Explain
          </button>
        </div>
      )}

      {lookup && (
        <div id="reader-word-lookup">
          <WordLookupPopup key={lookup.word} anchor={lookup} onClose={() => setLookup(null)} />
        </div>
      )}
    </>
  );
}
