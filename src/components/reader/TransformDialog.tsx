"use client";

import React, { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { ListenButton } from "@/components/speech/ListenButton";
import type { LocalPdfDocumentRecord } from "@/lib/reader/storage";
import { chapterTextForShortNotes, shortNotesAsText, SHORT_NOTES_MIN_CHARS, type ShortNotes } from "@/lib/notes/ai-notes";
import { notebookSaveMessage, saveToNotebook } from "@/lib/notes/save-to-notebook";
import {
  chunksForChapter,
  countTransformedChapters,
  listTransformChapters,
  readTransformEdition,
  SHORT_NOTES_EDITION,
  writeTransformEdition,
  type TransformChapterEdition,
} from "@/lib/reader/transform";

function editionToShortNotes(edition: TransformChapterEdition): ShortNotes {
  return {
    summary: edition.summary,
    keyPoints: edition.keyPoints,
    terms: edition.terms ?? [],
    formulas: edition.formulas ?? [],
    table: edition.table ?? null,
    memoryTips: edition.memoryTips ?? [],
    selfCheck: edition.selfCheck,
  };
}

/** Short notes (group B): one page of notes for a chapter of the student's own book. */
export default function TransformDialog({
  open,
  pdfDocument,
  onClose,
}: {
  open: boolean;
  pdfDocument: LocalPdfDocumentRecord | null;
  onClose: () => void;
}) {
  const chapters = useMemo(() => (pdfDocument ? listTransformChapters(pdfDocument) : []), [pdfDocument]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [edition, setEdition] = useState<TransformChapterEdition | null>(null);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [boundDocumentId, setBoundDocumentId] = useState(pdfDocument?.id ?? "");
  const liveDocumentId = useRef(pdfDocument?.id ?? null);
  liveDocumentId.current = pdfDocument?.id ?? null;
  if ((pdfDocument?.id ?? "") !== boundDocumentId) {
    setBoundDocumentId(pdfDocument?.id ?? "");
    setSelectedKey(null);
    setEdition(null);
    setDone(0);
    setBusy(false);
    setMessage("");
  }

  const keyOf = (chapter: { title: string; pageNumber: number }) => `${chapter.title}::${chapter.pageNumber}`;
  const selected = chapters.find((chapter) => keyOf(chapter) === selectedKey) ?? null;

  if (!open) return null;

  const read = (title: string) =>
    pdfDocument ? readTransformEdition(pdfDocument.id, title, SHORT_NOTES_EDITION, pdfDocument.fileHash) : null;

  const refreshCount = () => {
    if (!pdfDocument) return;
    setDone(countTransformedChapters(pdfDocument.id, chapters, SHORT_NOTES_EDITION, pdfDocument.fileHash));
  };

  const generate = async () => {
    if (!pdfDocument || !selected || busy) return;
    setMessage("");
    setSaveState("idle");
    const cached = read(selected.title);
    if (cached) {
      setEdition(cached);
      return;
    }
    const text = chapterTextForShortNotes(chunksForChapter(pdfDocument, selected));
    if (text.length < SHORT_NOTES_MIN_CHARS) {
      setMessage("This chapter has too little text to read. If it's a scanned book, try Photo to notes instead.");
      return;
    }
    setBusy(true);
    const requestedId = pdfDocument.id;
    try {
      const response = await fetch("/api/notes/ai", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "short", chapterTitle: selected.title, text }),
      });
      const json = (await response.json().catch(() => ({}))) as { short?: ShortNotes; error?: string; reference?: string };
      if (liveDocumentId.current !== requestedId) return;
      if (!response.ok || !json.short) {
        const reference = json.reference ? ` (${json.reference})` : "";
        setMessage(
          response.status === 401
            ? "Sign in to make short notes."
            : `${json.error ?? "Short notes couldn't be made just now."}${reference}`
        );
        return;
      }
      const next = writeTransformEdition({
        documentId: pdfDocument.id,
        documentHash: pdfDocument.fileHash,
        chapterTitle: selected.title,
        pageNumber: selected.pageNumber,
        edition: SHORT_NOTES_EDITION,
        summary: json.short.summary,
        keyPoints: json.short.keyPoints,
        selfCheck: json.short.selfCheck,
        terms: json.short.terms,
        formulas: json.short.formulas,
        table: json.short.table,
        memoryTips: json.short.memoryTips,
        createdAt: new Date().toISOString(),
      });
      setEdition(next);
      refreshCount();
    } catch {
      if (liveDocumentId.current === requestedId) setMessage("No connection. Nothing was counted. Try again when you're online.");
    } finally {
      if (liveDocumentId.current === requestedId) setBusy(false);
    }
  };

  const saveNotes = async () => {
    if (!edition || saveState === "saving") return;
    setSaveState("saving");
    const result = await saveToNotebook({
      subjectTitle: pdfDocument?.title?.replace(/\.pdf$/i, "").trim().slice(0, 60) || "Short notes",
      title: `Short notes: ${edition.chapterTitle}`.slice(0, 120),
      noteBody: shortNotesAsText(editionToShortNotes(edition)),
    });
    setSaveState(result.ok ? "saved" : "idle");
    if (!result.ok) setMessage(notebookSaveMessage(result));
  };

  const notes = edition ? editionToShortNotes(edition) : null;

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
        aria-label="Short notes"
        data-testid="transform-dialog"
        className="surface-card max-h-[min(44rem,calc(100vh-2rem))] w-full max-w-lg overflow-y-auto p-4"
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted">From your book</p>
            <h2 className="font-display text-lg text-heading">Short notes</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close short notes"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-beige-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Pick a chapter for one page of key points, words to know, formulas and test-yourself questions, made only from
          your book. Each new chapter uses two AI helps; opening it again is free.
        </p>
        <p className="mt-2 text-xs text-muted" data-testid="transform-progress">
          {done} of {chapters.length} chapters ready
        </p>
        <div className="mt-4 space-y-2">
          {chapters.map((chapter) => (
            <button
              key={keyOf(chapter)}
              type="button"
              aria-pressed={selectedKey === keyOf(chapter)}
              onClick={() => {
                setSelectedKey(keyOf(chapter));
                setEdition(read(chapter.title));
                setMessage("");
                setSaveState("idle");
              }}
              className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm ${
                selectedKey === keyOf(chapter) ? "bg-selected text-heading" : "text-ink hover:bg-beige-2"
              }`}
            >
              <span>{chapter.title}</span>
              <span className="text-xs text-muted">p. {chapter.pageNumber}</span>
            </button>
          ))}
        </div>
        {!edition ? (
          <button
            type="button"
            data-testid="transform-generate"
            disabled={!selected || busy}
            onClick={() => void generate()}
            className="btn-primary mt-4 text-sm disabled:opacity-40"
          >
            {busy ? "Reading the chapter… (about 20 seconds)" : "Make short notes (2 AI helps)"}
          </button>
        ) : null}
        {message ? (
          <p className="mt-3 text-sm text-muted" role="status" data-testid="short-notes-message">
            {message}
          </p>
        ) : null}
        {edition && notes ? (
          <div data-testid="transform-edition" className="mt-4 space-y-3 text-sm text-ink">
            <h3 className="font-display text-base text-heading">{edition.chapterTitle}</h3>
            {notes.summary ? <p className="leading-relaxed">{notes.summary}</p> : null}
            {notes.keyPoints.length ? (
              <section>
                <h4 className="font-semibold text-heading">Key points</h4>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {notes.keyPoints.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {notes.terms.length ? (
              <section>
                <h4 className="font-semibold text-heading">Words to know</h4>
                <dl className="mt-1 space-y-1">
                  {notes.terms.map((row) => (
                    <div key={row.term}>
                      <dt className="inline font-medium text-heading">{row.term}: </dt>
                      <dd className="inline">{row.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
            {notes.formulas.length ? (
              <section>
                <h4 className="font-semibold text-heading">Formulas</h4>
                <ul className="mt-1 space-y-1 font-mono text-[13px]">
                  {notes.formulas.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {notes.table ? (
              <section className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs" data-testid="short-notes-table">
                  <thead>
                    <tr>
                      {notes.table.headers.map((header) => (
                        <th key={header} scope="col" className="border border-line bg-beige-2 px-2 py-1 font-semibold">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {notes.table.rows.map((row, index) => (
                      <tr key={index}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="border border-line px-2 py-1 align-top">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
            {notes.memoryTips.length ? (
              <section>
                <h4 className="font-semibold text-heading">Remember it</h4>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {notes.memoryTips.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {notes.selfCheck.length ? (
              <section>
                <h4 className="font-semibold text-heading">Test yourself</h4>
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  {notes.selfCheck.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </section>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={() => void saveNotes()}
                disabled={saveState !== "idle"}
                data-testid="short-notes-save"
              >
                {saveState === "saved" ? "Saved to My Notes" : saveState === "saving" ? "Saving…" : "Save to My Notes"}
              </button>
              <ListenButton text={shortNotesAsText(notes)} speechId={`short-${edition.chapterTitle}`} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
