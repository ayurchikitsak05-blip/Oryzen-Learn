"use client";

import React, { useMemo, useState } from "react";
import { Clock, Eye } from "lucide-react";
import type { PrakritiThemePalette } from "@/lib/prakriti/config";
import {
  getSyncedNotesStateAtTime,
  type TimestampedLectureNote,
} from "@/lib/video/sync-engine";
import NoteModToolbar from "@/components/notes/NoteModToolbar";
import type { NoteModificationAction } from "@/lib/ai/adaptive-memory";

export interface ParallelNotesProps {
  lectureTitle: string;
  notes: TimestampedLectureNote[];
  currentTimeSeconds: number;
  onSeekToTimestamp: (seconds: number, badge: string) => void;
  onModifyNote: (noteId: string, action: NoteModificationAction) => void;
  onSaveNote?: (note: TimestampedLectureNote) => void;
  emptyMessage?: string | null;
  theme: PrakritiThemePalette;
}

export default function ParallelNotes({
  lectureTitle,
  notes,
  currentTimeSeconds,
  onSeekToTimestamp,
  onModifyNote,
  onSaveNote,
  emptyMessage,
  theme,
}: ParallelNotesProps) {
  const [revealAllMode, setRevealAllMode] = useState<boolean>(false);

  const { revealedNotes, activeNote, upcomingCount } = useMemo(
    () =>
      getSyncedNotesStateAtTime(notes, currentTimeSeconds, revealAllMode),
    [notes, currentTimeSeconds, revealAllMode]
  );

  return (
    <div
      data-testid="parallel-live-sync-notes"
      className="surface-card space-y-6 p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted">
            Live notes <span className="ml-1 text-[10px] uppercase tracking-wide text-accent">Demo</span>
          </p>
          <h3 className="font-display text-lg text-heading">
            {lectureTitle}
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setRevealAllMode((prev) => !prev)}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition-all active:scale-95 ${
            revealAllMode
              ? "bg-selected text-heading"
              : "border border-line bg-surface text-ink"
          }`}
        >
          <Eye className="h-4 w-4" />
          {revealAllMode
            ? "Showing all"
            : `${revealedNotes.length} of ${notes.length}`}
        </button>
      </div>

      <div className="space-y-4">
        {notes.length === 0 && (
          <p
            data-testid="video-notes-empty"
            className="rounded-2xl border border-dashed border-line px-4 py-6 text-sm leading-relaxed text-muted"
          >
            {emptyMessage ??
              "No notes yet for this lecture. Sample lectures include demo notes. A video you add does not receive a made-up transcript."}
          </p>
        )}
        {revealedNotes.map((note) => {
          const isSpeakingNow = activeNote?.id === note.id;
          return (
            <article
              key={note.id}
              data-testid={`parallel-note-card-${note.id}`}
              className={`rounded-2xl border p-5 space-y-3 transition-all ${
                isSpeakingNow
                  ? "border-beige bg-selected"
                  : "border-line bg-surface"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    data-testid={`timestamp-badge-${note.id}`}
                    onClick={() =>
                      onSeekToTimestamp(note.startSeconds, note.timestampBadge)
                    }
                    className="btn-primary text-xs"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {note.timestampBadge}
                  </button>
                  <h4 className="font-display text-sm text-heading">
                    {note.heading}
                  </h4>
                </div>

                {isSpeakingNow && (
                  <span className="inline-flex items-center rounded-full bg-beige-2 px-3 py-1 text-[11px] font-medium text-muted">
                    Now playing
                  </span>
                )}
              </div>

              <blockquote className="border-l border-line pl-3.5 text-sm leading-relaxed italic text-muted">
                &ldquo;{note.speakerTranscript}&rdquo;
              </blockquote>

              <div className="whitespace-pre-line text-sm leading-relaxed text-ink">
                {note.studyNoteMarkdown}
              </div>

              {note.highYieldKeyPoint ? (
                <p className="rounded-2xl bg-beige-2 px-4 py-3 text-xs leading-relaxed text-muted">
                  {note.highYieldKeyPoint}
                </p>
              ) : null}

              <NoteModToolbar
                noteId={note.id}
                citationBadge={note.timestampBadge}
                onModifyNote={(action) => onModifyNote(note.id, action)}
                theme={theme}
              />
              {onSaveNote ? (
                <button
                  type="button"
                  data-testid={`save-video-note-${note.id}`}
                  onClick={() => onSaveNote(note)}
                  className="btn-secondary text-xs"
                >
                  Save to Notebook
                </button>
              ) : null}
            </article>
          );
        })}

        {upcomingCount > 0 && !revealAllMode && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-4 py-4 text-xs text-muted">
            <span>{upcomingCount} notes still ahead in this lecture</span>
            <button
              type="button"
              onClick={() => setRevealAllMode(true)}
              className="btn-secondary"
            >
              Reveal all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
