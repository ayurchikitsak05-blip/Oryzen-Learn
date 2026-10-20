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
  theme: PrakritiThemePalette;
}

export default function ParallelNotes({
  lectureTitle,
  notes,
  currentTimeSeconds,
  onSeekToTimestamp,
  onModifyNote,
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
      className="space-y-6 backdrop-blur-xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl shadow-xl shadow-zinc-950/5 p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-500">Live notes</p>
          <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {lectureTitle}
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setRevealAllMode((prev) => !prev)}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition-all active:scale-95 ${
            revealAllMode
              ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
              : "border border-zinc-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-800/70 text-zinc-700 dark:text-zinc-200"
          }`}
        >
          <Eye className="h-4 w-4" />
          {revealAllMode
            ? "Showing all"
            : `${revealedNotes.length} of ${notes.length}`}
        </button>
      </div>

      <div className="space-y-4">
        {revealedNotes.map((note) => {
          const isSpeakingNow = activeNote?.id === note.id;
          return (
            <article
              key={note.id}
              data-testid={`parallel-note-card-${note.id}`}
              className={`rounded-2xl border p-5 space-y-3 transition-all ${
                isSpeakingNow
                  ? "border-zinc-900/20 dark:border-white/20 bg-zinc-50 dark:bg-zinc-800/60"
                  : "border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/40"
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
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 px-4 py-2 text-xs font-medium hover:opacity-90 transition-all active:scale-95"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {note.timestampBadge}
                  </button>
                  <h4 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                    {note.heading}
                  </h4>
                </div>

                {isSpeakingNow && (
                  <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-[11px] font-medium text-zinc-500">
                    Now playing
                  </span>
                )}
              </div>

              <blockquote className="border-l border-zinc-200 dark:border-zinc-700 pl-3.5 text-sm leading-relaxed italic text-zinc-500">
                &ldquo;{note.speakerTranscript}&rdquo;
              </blockquote>

              <div className="whitespace-pre-line text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {note.studyNoteMarkdown}
              </div>

              <p className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 px-4 py-3 text-xs leading-relaxed text-zinc-500">
                {note.highYieldKeyPoint}
              </p>

              <NoteModToolbar
                noteId={note.id}
                citationBadge={note.timestampBadge}
                onModifyNote={(action) => onModifyNote(note.id, action)}
                theme={theme}
              />
            </article>
          );
        })}

        {upcomingCount > 0 && !revealAllMode && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-4 text-xs text-zinc-500">
            <span>{upcomingCount} notes still ahead in this lecture</span>
            <button
              type="button"
              onClick={() => setRevealAllMode(true)}
              className="inline-flex min-h-[44px] items-center rounded-full border border-zinc-200/60 dark:border-zinc-800/60 px-4 py-2 font-medium text-zinc-700 dark:text-zinc-200 transition-all active:scale-95"
            >
              Reveal all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
