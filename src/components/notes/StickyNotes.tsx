"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Pin, PinOff } from "lucide-react";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { usePrivateReady } from "@/lib/privacy/use-private-ready";
import { isPinned, MAX_PINS, pinNote, PINS_EVENT, readPins, unpinNote, type PinnedNote } from "@/lib/notes/pins";

export function PinButton({ note }: { note: PinnedNote }) {
  const userId = useSignedInScope();
  const ready = usePrivateReady(userId);
  const [pinned, setPinned] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setPinned(ready && isPinned(note.id, userId)), [note.id, userId, ready]);
  return (
    <>
      <button
        type="button"
        data-testid="pin-note"
        aria-pressed={pinned}
        disabled={!ready}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium text-heading hover:bg-beige-2 disabled:opacity-60"
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
      <span className="text-xs text-muted" aria-live="polite">{message}</span>
    </>
  );
}

/** Sticky notes at the top of Today. Nothing shows until the student pins a note. */
export function PinnedNotes() {
  const userId = useSignedInScope();
  const ready = usePrivateReady(userId);
  const [pins, setPins] = useState<PinnedNote[]>([]);
  useEffect(() => {
    const load = () => setPins(ready ? readPins(userId) : []);
    load();
    window.addEventListener(PINS_EVENT, load);
    return () => window.removeEventListener(PINS_EVENT, load);
  }, [userId, ready]);
  if (!pins.length) return null;
  return (
    <section aria-labelledby="today-sticky" className="space-y-2" data-testid="today-sticky-notes">
      <h2 id="today-sticky" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        Sticky notes
      </h2>
      <div className="flex snap-x gap-2 overflow-x-auto pb-1">
        {pins.map((pin) => (
          <div key={pin.id} className="relative w-56 shrink-0 snap-start rounded-2xl border border-beige bg-selected text-heading shadow-sm">
            <Link href="/notes" className="block rounded-2xl p-3 pr-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              <span className="block truncate text-sm font-semibold">{pin.title}</span>
              <span className="mt-1 line-clamp-4 block whitespace-pre-line text-xs leading-relaxed text-ink">{pin.body}</span>
            </Link>
            <button
              type="button"
              aria-label={`Unpin ${pin.title}`}
              className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-beige-2"
              onClick={() => unpinNote(pin.id, userId)}
              data-testid="unpin-today"
            >
              <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
