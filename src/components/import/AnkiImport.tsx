"use client";

import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { ui } from "@/components/ui/classes";
import type { ImportedDeck } from "@/lib/import/anki";

const BATCH = 500;
const MAX_FILE_BYTES = 80 * 1024 * 1024;

type Status =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "preview"; deck: ImportedDeck }
  | { kind: "saving"; done: number; total: number }
  | { kind: "done"; count: number; name: string }
  | { kind: "error"; text: string };

async function readDeck(file: File): Promise<ImportedDeck> {
  const anki = await import("@/lib/import/anki");
  if (/\.(apkg|colpkg)$/i.test(file.name)) return anki.parseApkg(new Uint8Array(await file.arrayBuffer()), file.name);
  return anki.parseAnkiText(await file.text(), file.name);
}

/** Bring Anki decks in as notes; each card then becomes a revision card. No AI. */
export function AnkiImport({ onImported }: { onImported?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [name, setName] = useState("");

  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setStatus({ kind: "error", text: "That file is too big. Export the deck without media (untick “Include media”) and try again." });
      return;
    }
    setStatus({ kind: "reading" });
    try {
      const deck = await readDeck(file);
      if (deck.cards.length === 0) {
        setStatus({ kind: "error", text: "No cards were found in that file. Each card needs a front and a back." });
        return;
      }
      setName(deck.name);
      setStatus({ kind: "preview", deck });
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "That file couldn't be read." });
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const save = async (deck: ImportedDeck) => {
    const total = deck.cards.length;
    const subjectTitle = name.trim() || deck.name;
    for (let start = 0; start < total; start += BATCH) {
      setStatus({ kind: "saving", done: start, total });
      const response = await fetch("/api/notes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_notes", subjectTitle, notes: deck.cards.slice(start, start + BATCH) }),
      }).catch(() => null);
      if (!response?.ok) {
        const data = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
        setStatus({
          kind: "error",
          text: `${data?.error ?? "The import stopped."}${start > 0 ? ` ${start} cards were saved; import the file again to add the rest.` : ""}`,
        });
        return;
      }
    }
    setStatus({ kind: "done", count: total, name: subjectTitle });
    onImported?.();
  };

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4" data-testid="anki-import">
      <div>
        <h2 className="font-semibold text-heading">Import from Anki</h2>
        <p className="text-sm text-muted">
          Bring your decks with you. Use an .apkg package, or Anki&apos;s “Notes in Plain Text” export (.txt or .csv). Cloze cards become fill-the-gap cards.
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept=".apkg,.txt,.csv,.tsv"
        className="sr-only"
        aria-label="Anki file"
        data-testid="anki-import-file"
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      {status.kind === "preview" ? (
        <div className="space-y-3" data-testid="anki-import-preview">
          <p className="text-sm text-ink">
            Found <span className="font-semibold text-heading">{status.deck.cards.length}</span> cards
            {status.deck.skipped > 0 ? ` (${status.deck.skipped} empty or repeated cards left out)` : ""}.
          </p>
          <label className="block text-sm text-muted">
            Save them in the subject
            <input value={name} onChange={(event) => setName(event.target.value)} className="field-input mt-1 min-h-11 w-full" data-testid="anki-import-subject" />
          </label>
          <ul className="space-y-1 text-sm text-ink">
            {status.deck.cards.slice(0, 3).map((card, index) => (
              <li key={index} className="truncate rounded-lg bg-beige-2 px-3 py-2">
                <span className="font-semibold text-heading">{card.title}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${ui.primary} min-h-11`} onClick={() => void save(status.deck)} data-testid="anki-import-save">
              Import {status.deck.cards.length} cards
            </button>
            <button type="button" className={`${ui.ghost} min-h-11`} onClick={() => setStatus({ kind: "idle" })}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`${ui.secondary} min-h-11`}
          disabled={status.kind === "reading" || status.kind === "saving"}
          onClick={() => input.current?.click()}
          data-testid="anki-import-choose"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {status.kind === "reading" ? "Reading the deck…" : status.kind === "saving" ? `Saving ${status.done} of ${status.total}…` : "Choose a deck file"}
        </button>
      )}
      {status.kind === "done" ? (
        <p className="text-sm text-success" role="status" data-testid="anki-import-done">
          Imported {status.count} cards into “{status.name}”. New cards join your daily revision, 5 a day.
        </p>
      ) : null}
      {status.kind === "error" ? (
        <p className={ui.alert} role="alert" data-testid="anki-import-error">
          {status.text}
        </p>
      ) : null}
    </section>
  );
}
