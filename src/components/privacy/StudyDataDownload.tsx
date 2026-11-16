"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { ui } from "@/components/ui/classes";
import { ensureAccountVault, privateRecordsSnapshot } from "@/lib/privacy/account-vault";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { downloadBlob } from "@/lib/vaults/download";
import {
  buildStudyExport,
  exportFileName,
  notesAsText,
  type ExportNote,
  type ExportSubject,
} from "@/lib/privacy/study-export";

type Status = { kind: "idle" } | { kind: "working" } | { kind: "done"; text: string } | { kind: "error"; text: string };

/** "Download my study data": the student's own copy, any time, free. */
export default function StudyDataDownload() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const run = async (kind: "json" | "txt") => {
    setStatus({ kind: "working" });
    const user = await fetchSignedInUser().catch(() => null);
    if (!user?.userId) {
      setStatus({ kind: "error", text: "Please sign in first." });
      return;
    }
    const response = await fetch("/api/notes", { credentials: "same-origin" }).catch(() => null);
    const data = (response?.ok ? await response.json().catch(() => ({})) : {}) as {
      subjects?: ExportSubject[];
      notes?: ExportNote[];
    };
    if (!response?.ok) {
      setStatus({ kind: "error", text: "Your notes couldn't be opened just now. Please try again." });
      return;
    }
    const subjects = Array.isArray(data.subjects) ? data.subjects : [];
    const notes = Array.isArray(data.notes) ? data.notes : [];
    const now = new Date();
    if (kind === "txt") {
      downloadBlob(exportFileName("txt", now), new Blob([notesAsText(subjects, notes, now)], { type: "text/plain" }));
      setStatus({ kind: "done", text: `Downloaded ${notes.length} note${notes.length === 1 ? "" : "s"}.` });
      return;
    }
    const opened = await ensureAccountVault().catch(() => false);
    const records = opened ? privateRecordsSnapshot(user.userId) : {};
    const file = buildStudyExport({ subjects, notes, records, now });
    downloadBlob(exportFileName("json", now), new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    setStatus({
      kind: "done",
      text: opened
        ? "Downloaded. Keep the file somewhere safe, like Google Drive or your email."
        : "Downloaded your notes. Plans and revision progress on this device are locked just now, so they weren't included.",
    });
  };

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10" data-testid="study-data">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Your data</p>
        <h1 className="font-display mt-1 text-3xl text-heading">Download my study data</h1>
        <p className="mt-2 text-sm text-muted">
          Your work is yours. Keep your own copy any time. Updates to ORYZEN never delete your notes, plans or revision
          progress.
        </p>
      </header>

      <section className={`${ui.cardPad} space-y-3`}>
        <h2 className="font-semibold text-heading">My notes (easy to read)</h2>
        <p className="text-sm text-muted">A text file with every note, grouped by subject. Opens on any phone or computer.</p>
        <button
          type="button"
          className={`${ui.primary} min-h-12`}
          onClick={() => void run("txt")}
          disabled={status.kind === "working"}
          data-testid="study-data-txt"
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Download my notes
        </button>
      </section>

      <section className={`${ui.cardPad} space-y-3`}>
        <h2 className="font-semibold text-heading">Everything (full copy)</h2>
        <p className="text-sm text-muted">
          Notes plus what&apos;s kept privately on this device: study roadmap and chapter ratings, revision progress,
          highlights, bookmarks and quiz progress.
        </p>
        <button
          type="button"
          className={`${ui.secondary} min-h-12`}
          onClick={() => void run("json")}
          disabled={status.kind === "working"}
          data-testid="study-data-json"
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Download everything
        </button>
      </section>

      {status.kind === "working" ? <p className={ui.loading}>Preparing your file…</p> : null}
      {status.kind === "done" ? <p className={ui.success} role="status">{status.text}</p> : null}
      {status.kind === "error" ? <p className={ui.alert} role="alert">{status.text}</p> : null}

      <p className="text-xs text-muted">
        The file is made on your device and saved straight to it. Nothing is sent anywhere. See the{" "}
        <Link href="/privacy" className="underline underline-offset-4">privacy notice</Link>.
      </p>
    </main>
  );
}
