"use client";

import React, { useState } from "react";
import type { AiLensResponsePayload } from "@/lib/ai/gateway";
import { noteOptionsForAnswer } from "@/lib/notes/from-answer";
import { serializeNote } from "@/lib/notes/formats";
import { notebookSaveMessage, saveToNotebook } from "@/lib/notes/save-to-notebook";

/** "Save as flowchart / table / Cornell…" for an answer already on screen (no new AI call). */
export function SaveAnswerAsNote({ payload, fallbackTitle }: { payload: AiLensResponsePayload; fallbackTitle?: string }) {
  const options = noteOptionsForAnswer(payload);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  if (options.length === 0) return null;
  const title = (payload.title || fallbackTitle || "Saved answer").replace(/\s+/g, " ").trim().slice(0, 120);

  const save = async (format: string) => {
    const option = options.find((item) => item.format === format);
    if (!option || busy) return;
    setBusy(format);
    setMessage("");
    try {
      const result = await saveToNotebook({ subjectTitle: "From my books", title, noteBody: serializeNote(option.note) });
      setMessage(result.ok ? `Saved to My Notes as a ${option.label.toLowerCase()}.` : notebookSaveMessage(result));
    } catch {
      setMessage("No connection. Try saving again when you're online.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="save-answer-as-note">
      <span className="text-xs text-muted">Save to My Notes as:</span>
      {options.map((option) => (
        <button
          key={option.format}
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void save(option.format)}
          className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 text-xs font-medium text-heading hover:bg-beige-2 disabled:opacity-60"
          data-testid={`save-as-${option.format}`}
        >
          {busy === option.format ? "Saving…" : option.label}
        </button>
      ))}
      {message ? (
        <span className="w-full text-xs text-muted" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
