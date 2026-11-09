"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, RotateCcw } from "lucide-react";
import { ui } from "@/components/ui/classes";
import { ListenButton } from "@/components/speech/ListenButton";
import { saveToNotebook, notebookSaveMessage } from "@/lib/notes/save-to-notebook";
import { shrinkPhoto } from "@/lib/notes/photo-resize";
import type { PhotoNotes } from "@/lib/notes/ai-notes";

type Stage =
  | { kind: "pick" }
  | { kind: "ready"; data: string; previewUrl: string }
  | { kind: "reading"; previewUrl: string }
  | { kind: "result"; previewUrl: string }
  | { kind: "saved" };

/** Photo to notes: photograph a page, check the typed notes, save them to My Notes. */
export function PhotoToNotes() {
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setMessage("");
    try {
      const photo = await shrinkPhoto(file);
      if (alive.current) setStage({ kind: "ready", data: photo.data, previewUrl: photo.previewUrl });
    } catch {
      if (alive.current) setMessage("This picture couldn't be opened. Try a JPEG or PNG photo.");
    }
  };

  const read = async () => {
    if (stage.kind !== "ready") return;
    const { data, previewUrl } = stage;
    setStage({ kind: "reading", previewUrl });
    setMessage("");
    try {
      const response = await fetch("/api/notes/ai", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "photo", image: { data, mimeType: "image/jpeg" } }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        photo?: PhotoNotes;
        error?: string;
        reference?: string;
      };
      if (!alive.current) return;
      if (!response.ok || !json.photo) {
        const reference = json.reference ? ` (${json.reference})` : "";
        setMessage(
          response.status === 401
            ? "Sign in to turn photos into notes."
            : `${json.error ?? "Notes couldn't be made just now."}${reference}`
        );
        setStage({ kind: "ready", data, previewUrl });
        return;
      }
      setTitle(json.photo.title);
      setSubject(json.photo.subject);
      setBody(json.photo.body);
      setStage({ kind: "result", previewUrl });
    } catch {
      if (!alive.current) return;
      setMessage("No connection. Nothing was counted. Try again when you're online.");
      setStage({ kind: "ready", data, previewUrl });
    }
  };

  const save = async () => {
    if (saving || !title.trim() || !body.trim()) return;
    setSaving(true);
    const result = await saveToNotebook({
      subjectTitle: subject.trim() || "Photo notes",
      title: title.trim(),
      noteBody: body.trim(),
    });
    if (!alive.current) return;
    setSaving(false);
    if (result.ok) {
      setStage({ kind: "saved" });
      setMessage("");
    } else {
      setMessage(notebookSaveMessage(result));
    }
  };

  const reset = () => {
    setStage({ kind: "pick" });
    setTitle("");
    setSubject("");
    setBody("");
    setMessage("");
    if (input.current) input.current.value = "";
  };

  const preview = "previewUrl" in stage ? stage.previewUrl : null;

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10" data-testid="photo-notes">
      <header>
        <h1 className={`${ui.heading} text-3xl`}>Photo to notes</h1>
        <p className="mt-2 text-sm text-muted">
          Take a photo of your handwritten notes, a textbook page or a class sheet. You get typed notes to check, edit
          and keep in My Notes. One page uses one AI help. The photo isn&apos;t kept.
        </p>
      </header>

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => void choose(event.target.files?.[0])}
        data-testid="photo-input"
        aria-label="Choose a photo of a page"
      />

      {stage.kind === "saved" ? (
        <section className={`${ui.cardPad} space-y-3`} data-testid="photo-saved">
          <p className="flex items-center gap-2 font-semibold text-heading">
            <Check className="h-5 w-5 text-accent" aria-hidden="true" /> Saved to My Notes
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ui.primary} onClick={reset} data-testid="photo-another">
              <Camera className="h-4 w-4" aria-hidden="true" /> Next page
            </button>
            <Link href="/notes" className={ui.secondary}>
              Open My Notes
            </Link>
          </div>
        </section>
      ) : (
        <section className={`${ui.cardPad} space-y-3`}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your page" className="max-h-72 w-full rounded-xl object-contain bg-beige-2" />
          ) : null}
          {stage.kind === "pick" ? (
            <button
              type="button"
              className={`${ui.primary} min-h-12 w-full`}
              onClick={() => input.current?.click()}
              data-testid="photo-pick"
            >
              <Camera className="h-4 w-4" aria-hidden="true" /> Take or choose a photo
            </button>
          ) : null}
          {stage.kind === "ready" ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={`${ui.primary} min-h-12 flex-1`} onClick={() => void read()} data-testid="photo-read">
                Make notes (1 AI help)
              </button>
              <button type="button" className={ui.secondary} onClick={reset}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Retake
              </button>
            </div>
          ) : null}
          {stage.kind === "reading" ? (
            <p className="text-sm text-muted" role="status" data-testid="photo-reading">
              Reading your page… this takes about 10 seconds.
            </p>
          ) : null}
          {stage.kind === "result" ? (
            <div className="space-y-3" data-testid="photo-result">
              <p className="text-sm text-muted">Check the notes against your page and fix anything before saving.</p>
              <label className="block">
                <span className={ui.label}>Title</span>
                <input className={ui.input} value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="block">
                <span className={ui.label}>Subject</span>
                <input
                  className={ui.input}
                  value={subject}
                  maxLength={40}
                  placeholder="Photo notes"
                  onChange={(event) => setSubject(event.target.value)}
                />
              </label>
              <label className="block">
                <span className={ui.label}>Notes</span>
                <textarea
                  className={`${ui.input} min-h-64 font-[inherit]`}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  data-testid="photo-body"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`${ui.primary} min-h-12`}
                  onClick={() => void save()}
                  disabled={saving || !title.trim() || !body.trim()}
                  data-testid="photo-save"
                >
                  {saving ? "Saving…" : "Save to My Notes"}
                </button>
                <ListenButton text={body} speechId="photo-notes" />
                <button type="button" className={ui.ghost} onClick={reset}>
                  Discard
                </button>
              </div>
            </div>
          ) : null}
        </section>
      )}
      {message ? (
        <p className={ui.notice} role="status" data-testid="photo-message">
          {message}
        </p>
      ) : null}
    </main>
  );
}
