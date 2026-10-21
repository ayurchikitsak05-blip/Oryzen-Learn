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
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color-mix(in_srgb,var(--heading)_28%,transparent)] p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="surface-card max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-3xl overflow-y-auto p-5 text-ink shadow-[0_24px_60px_-28px_rgba(32,36,43,0.45)]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg text-heading">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-beige-2"
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
        <p className="text-sm text-muted">This document has no detected chapters yet.</p>
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
                className={`flex min-h-12 w-full items-center justify-between rounded-2xl border px-4 text-left text-sm ${
                  chapter.pageNumber === activePage
                    ? "border-beige bg-selected text-heading"
                    : "border-line bg-surface text-ink hover:bg-beige-2"
                }`}
              >
                <span>{chapter.title}</span>
                <span className="text-xs text-muted">p. {chapter.pageNumber}</span>
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
                  ? "border-beige bg-selected"
                  : "border-line bg-surface hover:bg-beige-2"
              }`}
            >
              <span className="text-xs font-medium text-muted">Page {pageNumber}</span>
              <span className="mt-2 line-clamp-2 font-display text-sm text-heading">{label}</span>
              <span className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-muted">
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
          className="btn-primary text-sm"
        >
          Download annotations
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">
          Highlights and margin notes you add in the reader will collect here.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li
              key={`${item.kind}-${item.pageNumber}-${index}`}
              className="rounded-2xl border border-line bg-beige-2 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {item.kind === "highlight" ? "Highlight" : "Note"} · page {item.pageNumber}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onJump(item.pageNumber);
                    onClose();
                  }}
                  className="text-xs font-medium text-heading underline"
                >
                  Open page
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink">“{item.quote}”</p>
              {item.body && (
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </OverlayShell>
  );
}
