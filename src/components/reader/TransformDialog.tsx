"use client";

import React, { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { AiGatewayExecutionResult } from "@/lib/ai/gateway";
import type { LocalPdfDocumentRecord } from "@/lib/reader/storage";
import {
  boundChapterSlice,
  chunksForChapter,
  composeChapterRevisionSheet,
  countTransformedChapters,
  editionFromLensRevision,
  listTransformChapters,
  readTransformEdition,
  writeTransformEdition,
  type TransformChapterEdition,
} from "@/lib/reader/transform";

export default function TransformDialog({
  open,
  pdfDocument,
  onClose,
}: {
  open: boolean;
  pdfDocument: LocalPdfDocumentRecord | null;
  onClose: () => void;
}) {
  const chapters = useMemo(
    () => (pdfDocument ? listTransformChapters(pdfDocument) : []),
    [pdfDocument]
  );
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [edition, setEdition] = useState<TransformChapterEdition | null>(null);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [boundDocumentId, setBoundDocumentId] = useState(pdfDocument?.id ?? "");
  const liveDocumentId = useRef(pdfDocument?.id ?? null);
  liveDocumentId.current = pdfDocument?.id ?? null;
  if ((pdfDocument?.id ?? "") !== boundDocumentId) {
    setBoundDocumentId(pdfDocument?.id ?? "");
    setSelectedTitle(null);
    setEdition(null);
    setDone(0);
    setBusy(false);
  }

  const selected = chapters.find((chapter) => chapter.title === selectedTitle) ?? null;

  if (!open) return null;

  const refreshCount = () => {
    if (!pdfDocument) return;
    setDone(
      countTransformedChapters(
        pdfDocument.id,
        chapters,
        undefined,
        pdfDocument.fileHash
      )
    );
  };

  const generate = async () => {
    if (!pdfDocument || !selected || busy) return;
    const cached = readTransformEdition(
      pdfDocument.id,
      selected.title,
      undefined,
      pdfDocument.fileHash
    );
    if (cached) {
      setEdition(cached);
      refreshCount();
      return;
    }

    const chapterChunks = chunksForChapter(pdfDocument, selected);
    const slice = boundChapterSlice(chapterChunks);
    const localFallback = composeChapterRevisionSheet({
      documentId: pdfDocument.id,
      documentHash: pdfDocument.fileHash,
      chapter: selected,
      chunks: chapterChunks,
    });

    setBusy(true);
    const requestedId = pdfDocument.id;
    try {
      const response = await fetch("/api/ai/lens", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: pdfDocument.id,
          documentHash: pdfDocument.fileHash,
          pageNumber: selected.pageNumber,
          sectionHeading: selected.title,
          selectedText: slice.selectedText,
          lensType: "high_yield_revision",
          activePageText: slice.selectedText,
          candidateChunks: slice.candidateChunks,
        }),
      });
      const data = (await response.json()) as AiGatewayExecutionResult & {
        error?: string;
      };
      const fromServer = data.payload
        ? editionFromLensRevision({
            documentId: pdfDocument.id,
            documentHash: pdfDocument.fileHash,
            chapter: selected,
            payload: data.payload,
          })
        : null;
      if (liveDocumentId.current !== requestedId) return;
      const next = writeTransformEdition(fromServer ?? localFallback);
      setEdition(next);
      refreshCount();
    } catch {
      if (liveDocumentId.current !== requestedId) return;
      const next = writeTransformEdition(localFallback);
      setEdition(next);
      refreshCount();
    } finally {
      if (liveDocumentId.current === requestedId) setBusy(false);
    }
  };

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
        aria-label="Transform My Book"
        data-testid="transform-dialog"
        className="surface-card max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-lg overflow-y-auto p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted">Transform My Book</p>
            <h2 className="font-display text-lg text-heading">Revision sheet</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close transform"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-beige-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          One chapter at a time, from text already on this device. The original PDF is never overwritten.
        </p>
        <p className="mt-2 text-xs text-muted" data-testid="transform-progress">
          {done} of {chapters.length} chapters ready
        </p>
        <div className="mt-4 space-y-2">
          {chapters.map((chapter) => (
            <button
              key={`${chapter.title}-${chapter.pageNumber}`}
              type="button"
              onClick={() => {
                setSelectedTitle(chapter.title);
                setEdition(
                  pdfDocument
                    ? readTransformEdition(
                        pdfDocument.id,
                        chapter.title,
                        undefined,
                        pdfDocument.fileHash
                      )
                    : null
                );
              }}
              className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm ${
                selectedTitle === chapter.title
                  ? "bg-selected text-heading"
                  : "text-ink hover:bg-beige-2"
              }`}
            >
              <span>{chapter.title}</span>
              <span className="text-xs text-muted">p. {chapter.pageNumber}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          data-testid="transform-generate"
          disabled={!selected || busy}
          onClick={() => void generate()}
          className="btn-primary mt-4 text-sm disabled:opacity-40"
        >
          {busy ? "Preparing chapter…" : "Make revision sheet"}
        </button>
        {edition ? (
          <div data-testid="transform-edition" className="mt-4 space-y-3">
            <h3 className="font-display text-base text-heading">{edition.chapterTitle}</h3>
            <p className="text-sm leading-relaxed text-ink">{edition.summary}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
              {edition.keyPoints.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
              {edition.selfCheck.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}
