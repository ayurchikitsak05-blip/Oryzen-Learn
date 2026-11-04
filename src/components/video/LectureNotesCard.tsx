"use client";

import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { TimestampedLectureNote } from "@/lib/video/sync-engine";
import type { LectureAllowance } from "@/lib/video/lecture-notes";

type Status =
  | { kind: "loading" }
  | { kind: "off"; text: string }
  | { kind: "ready"; cached: boolean; allowance: LectureAllowance }
  | { kind: "working" }
  | { kind: "done"; text: string }
  | { kind: "error"; text: string; allowance?: LectureAllowance; cached?: boolean };

function leftText(allowance: LectureAllowance): string {
  if (allowance.left === 0) return "You've used this month's new lectures.";
  return allowance.left === 1 ? "1 new lecture left this month." : `${allowance.left} new lectures left this month.`;
}

/** "Make notes from this lecture": asks the server, which uses shared notes when they exist. */
export function LectureNotesCard({
  videoId,
  onNotes,
}: {
  videoId: string;
  onNotes: (title: string, notes: TimestampedLectureNote[]) => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    void fetch(`/api/video/notes?v=${encodeURIComponent(videoId)}`, { credentials: "same-origin" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          cached?: boolean;
          allowance?: LectureAllowance;
          enabled?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !data.allowance) {
          setStatus({ kind: "off", text: data.error ?? "Lecture notes aren't available right now." });
          return;
        }
        if (!data.cached && data.enabled === false) {
          setStatus({ kind: "off", text: "Lecture notes aren't switched on yet." });
          return;
        }
        setStatus({ kind: "ready", cached: Boolean(data.cached), allowance: data.allowance });
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: "off", text: "Lecture notes aren't available offline." });
      });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const make = async () => {
    setStatus({ kind: "working" });
    try {
      const response = await fetch("/api/video/notes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        title?: string;
        notes?: TimestampedLectureNote[];
        cached?: boolean;
        allowance?: LectureAllowance;
        error?: string;
      };
      if (!response.ok || !data.ok || !Array.isArray(data.notes)) {
        setStatus({
          kind: "error",
          text: data.error ?? "Lecture notes couldn't be made just now. Please try again later.",
          allowance: data.allowance,
        });
        return;
      }
      onNotes(data.title ?? "Your lecture", data.notes);
      setStatus({
        kind: "done",
        text: data.cached
          ? "Notes added. Another student had already made them, so this was free."
          : `Notes added. ${data.allowance ? leftText(data.allowance) : ""}`.trim(),
      });
    } catch {
      setStatus({ kind: "error", text: "You seem to be offline. Nothing was counted." });
    }
  };

  const canMake =
    status.kind === "ready" && (status.cached || status.allowance.left > 0);

  return (
    <section
      data-testid="lecture-notes-card"
      aria-live="polite"
      className="rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-beige-2">
          <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-semibold text-heading">Notes from this lecture</h2>
          {status.kind === "loading" ? <p className="text-sm text-muted">Checking…</p> : null}
          {status.kind === "off" ? <p className="text-sm text-muted">{status.text}</p> : null}
          {status.kind === "ready" ? (
            <p className="text-sm text-muted" data-testid="lecture-notes-status">
              {status.cached
                ? "Notes for this lecture are ready. Free to add."
                : `Timed notes from what the teacher says and writes (first 90 minutes). ${leftText(status.allowance)}`}
            </p>
          ) : null}
          {status.kind === "working" ? (
            <p className="text-sm text-muted">Reading the lecture. This can take 1 to 3 minutes; keep this page open.</p>
          ) : null}
          {status.kind === "done" ? <p className="text-sm text-success">{status.text}</p> : null}
          {status.kind === "error" ? (
            <p className="text-sm text-danger" role="alert">
              {status.text}
            </p>
          ) : null}
        </div>
      </div>
      {status.kind === "ready" ? (
        <button
          type="button"
          onClick={() => void make()}
          disabled={!canMake}
          data-testid="lecture-notes-make"
          className="btn-primary mt-3 min-h-11 w-full text-sm disabled:opacity-50"
        >
          {status.cached
            ? "Add the notes (free)"
            : `Make notes (uses 1 of ${status.allowance.left})`}
        </button>
      ) : null}
    </section>
  );
}
