"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Brain, Pin, PinOff } from "lucide-react";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { isAccountVaultUnlocked } from "@/lib/privacy/account-vault";
import { memoriseNow, readRevisionState, writeRevisionState } from "@/lib/revision/cards";
import { localIsoDate } from "@/lib/roadmap/time";
import { isPinned, MAX_PINS, pinNote, PINS_EVENT, readPins, unpinNote, type PinnedNote } from "@/lib/notes/pins";

export function PinButton({ note }: { note: PinnedNote }) {
  const userId = useSignedInScope();
  const [pinned, setPinned] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setPinned(isPinned(note.id, userId)), [note.id, userId]);
  return (
    <>
      <button
        type="button"
        data-testid="pin-note"
        aria-pressed={pinned}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium text-heading hover:bg-beige-2"
        onClick={() => {
          if (pinned) {
            unpinNote(note.id, userId);
            setPinned(false);
            setMessage("");
            return;
          }
          if (pinNote(note, userId)) {
            setPinned(true);
            setMessage("Pinned to Today.");
          } else {
            setMessage(`You can pin up to ${MAX_PINS}. Unpin one first.`);
          }
        }}
      >
        {pinned ? <PinOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="h-3.5 w-3.5" aria-hidden="true" />}
        {pinned ? "Unpin" : "Pin to Today"}
      </button>
      {message ? <span className="text-xs text-muted">{message}</span> : null}
    </>
  );
}

/** Sticky notes at the top of Today. Nothing shows until the student pins a note. */
export function PinnedNotes() {
  const userId = useSignedInScope();
  const [pins, setPins] = useState<PinnedNote[]>([]);
  useEffect(() => {
    const load = () => setPins(isAccountVaultUnlocked() ? readPins(userId) : []);
    load();
    window.addEventListener(PINS_EVENT, load);
    const retry = window.setTimeout(load, 1500);
    return () => {
      window.removeEventListener(PINS_EVENT, load);
      window.clearTimeout(retry);
    };
  }, [userId]);
  if (!pins.length) return null;
  return (
    <section aria-labelledby="today-sticky" className="space-y-2" data-testid="today-sticky-notes">
      <h2 id="today-sticky" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        Sticky notes
      </h2>
      <div className="flex snap-x gap-2 overflow-x-auto pb-1">
        {pins.map((pin) => (
          <Link
            key={pin.id}
            href="/notes"
            className="w-56 shrink-0 snap-start rounded-2xl border border-line bg-[#fff6c9] p-3 text-[#3a3320] shadow-sm"
          >
            <span className="block truncate text-sm font-semibold">{pin.title}</span>
            <span className="mt-1 line-clamp-4 block whitespace-pre-line text-xs leading-relaxed">{pin.body}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** "Memorise this": puts the note first in the next Morning revision round. */
export function MemoriseButton({ noteId }: { noteId: string }) {
  const userId = useSignedInScope();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      data-testid="memorise-note"
      disabled={done}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium text-heading hover:bg-beige-2 disabled:opacity-60"
      onClick={() => {
        if (!isAccountVaultUnlocked()) return;
        const today = localIsoDate();
        writeRevisionState(memoriseNow(readRevisionState(userId), noteId, today), userId);
        setDone(true);
      }}
    >
      <Brain className="h-3.5 w-3.5" aria-hidden="true" />
      {done ? "Added to revision" : "Memorise this"}
    </button>
  );
}
