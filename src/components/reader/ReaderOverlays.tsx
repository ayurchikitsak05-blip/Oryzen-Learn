"use client";

import React from "react";
import { X } from "lucide-react";
import {
  annotationsToMarkdown,
  collectAnnotations,
  type ReaderMarginNote,
} from "@/lib/reader/annotations";
import type { CitationReadyChunk } from "@/lib/reader/extractor";
import { downloadBlob, safeDownloadName } from "@/lib/vaults/download";

interface OverlayShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function OverlayShell({ title, onClose, children }: OverlayShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-3xl overflow-y-auto rounded-3xl border border-amber-500/30 bg-zinc-950 p-5 text-amber-100 shadow-2xl shadow-black/50"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-amber-200 hover:bg-amber-950/40"
            aria-label={`Close ${title}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ContentsModal({
  chapters,
  activePage,
  onJump,
  onClose,
}: {
  chapters: readonly { title: string; pageNumber: number }[];
  activePage: number;
  onJump: (pageNumber: number) => void;
  onClose: () => void;
}) {
  return (
    <OverlayShell title="Contents" onClose={onClose}>
      {chapters.length === 0 ? (
        <p className="text-sm text-amber-100">This document has no detected chapters yet.</p>
      ) : (
        <ul className="space-y-2">
          {chapters.map((chapter) => (
            <li key={`${chapter.pageNumber}-${chapter.title}`}>
              <button
                type="button"
                onClick={() => {
                  onJump(chapter.pageNumber);
                  onClose();
                }}
                className={`flex min-h-[48px] w-full items-center justify-between rounded-2xl border px-4 text-left text-sm ${
                  chapter.pageNumber === activePage
                    ? "border-amber-200/40 bg-amber-950/50 text-amber-50"
                    : "border-amber-500/30 bg-amber-950/20 text-amber-100 hover:border-amber-200/40"
                }`}
              >
                <span>{chapter.title}</span>
                <span className="text-xs text-amber-200">p. {chapter.pageNumber}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </OverlayShell>
  );
}

export function PageGridModal({
  pageCount,
  activePage,
  chunks,
  onJump,
  onClose,
}: {
  pageCount: number;
  activePage: number;
  chunks: readonly CitationReadyChunk[];
  onJump: (pageNumber: number) => void;
  onClose: () => void;
}) {
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
  return (
    <OverlayShell title="Page grid" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {pages.map((pageNumber) => {
          const pageChunks = chunks.filter((chunk) => chunk.page_number === pageNumber);
          const label = pageChunks[0]?.section_heading ?? `Page ${pageNumber}`;
          const preview = pageChunks[0]?.text.slice(0, 90) ?? "No extracted text";
          return (
            <button
              key={pageNumber}
              type="button"
              onClick={() => {
                onJump(pageNumber);
                onClose();
              }}
              className={`flex min-h-[120px] flex-col rounded-2xl border p-3 text-left ${
                pageNumber === activePage
                  ? "border-amber-200/40 bg-amber-950/50"
                  : "border-amber-500/30 bg-black hover:border-amber-200/40"
              }`}
            >
              <span className="text-xs font-medium text-amber-200">Page {pageNumber}</span>
              <span className="mt-2 line-clamp-2 text-sm font-medium text-white">{label}</span>
              <span className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-amber-100">
                {preview}
              </span>
            </button>
          );
        })}
      </div>
    </OverlayShell>
  );
}

export function AnnotationsDrawer({
  title,
  documentId,
  chunks,
  marks,
  notes,
  onJump,
  onClose,
}: {
  title: string;
  documentId: string | null;
  chunks: readonly CitationReadyChunk[];
  marks: readonly { chunkId: string; start: number; end: number; kind: "highlight" | "underline" }[];
  notes: readonly ReaderMarginNote[];
  onJump: (pageNumber: number) => void;
  onClose: () => void;
}) {
  const items = collectAnnotations({ documentId, chunks, marks, notes });
  const download = () => {
    const markdown = annotationsToMarkdown(title, items);
    downloadBlob(
      safeDownloadName(title, "md"),
      new Blob([markdown], { type: "text/markdown" })
    );
  };

  return (
    <OverlayShell title="Annotations" onClose={onClose}>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={download}
          className="inline-flex min-h-[44px] items-center rounded-full border border-amber-500/40 bg-amber-950/50 px-4 text-sm font-medium text-amber-100 hover:bg-amber-950/70"
        >
          Download annotations
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-amber-100">
          Highlights and margin notes you add in the reader will collect here.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li
              key={`${item.kind}-${item.pageNumber}-${index}`}
              className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-amber-200">
                  {item.kind === "highlight" ? "Highlight" : "Note"} · page {item.pageNumber}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onJump(item.pageNumber);
                    onClose();
                  }}
                  className="text-xs font-medium text-amber-100 underline"
                >
                  Open page
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-amber-50">“{item.quote}”</p>
              {item.body && (
                <p className="mt-2 text-sm leading-relaxed text-amber-100">{item.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </OverlayShell>
  );
}
