"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { ui } from "@/components/ui/classes";
import type { SprintSession } from "@/lib/sprint/types";

/**
 * Strict mode (owner list A, 8 Nov 2026): while a sprint runs, the app shows only the timer
 * and the book. Leaving the app itself can't be stopped by a website; the distraction guard
 * pauses the timer if the student does.
 */
export const STRICT_MODE_KEY = "oryzen_strict_mode_v1";

export function readStrictMode(): boolean {
  try {
    return window.localStorage.getItem(STRICT_MODE_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeStrictMode(on: boolean): void {
  try {
    window.localStorage.setItem(STRICT_MODE_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

export function StrictModeToggle({ value, onChange }: { value: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-start gap-3 text-sm text-ink" data-testid="strict-toggle">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={value}
        onChange={(event) => {
          writeStrictMode(event.target.checked);
          onChange(event.target.checked);
        }}
      />
      <span>
        <span className="block font-semibold text-heading">Strict mode</span>
        <span className="block text-muted">
          Full screen with only the timer and your book until the sprint ends. Turn on Do Not Disturb on your phone too.
        </span>
      </span>
    </label>
  );
}

export function StrictModeOverlay({
  session,
  clock,
  bookHref,
  onEndEarly,
}: {
  session: SprintSession;
  clock: string;
  bookHref: string;
  onEndEarly: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) {
      root.requestFullscreen().catch(() => undefined);
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="strict-title"
      data-testid="strict-overlay"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-canvas px-6 text-center"
    >
      <p id="strict-title" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        <Lock className="h-4 w-4" aria-hidden="true" /> Strict mode
      </p>
      <p className="font-display text-6xl text-heading" data-testid="strict-clock" aria-live="off">
        {clock}
      </p>
      <p className="max-w-sm text-base text-ink">{session.goal}</p>
      <div className="grid w-full max-w-xs gap-2">
        <Link href={bookHref} className={`${ui.primary} min-h-12`} data-testid="strict-open-book">
          Open my book
        </Link>
        {confirming ? (
          <div className="space-y-2 rounded-2xl border border-line bg-surface p-3 text-sm">
            <p className="text-ink">End early? The minutes you studied are still saved.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={ui.secondary} onClick={() => setConfirming(false)} data-testid="strict-keep-going">
                Keep going
              </button>
              <button type="button" className={ui.ghost} onClick={onEndEarly} data-testid="strict-end">
                End sprint
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={`${ui.ghost} text-muted`} onClick={() => setConfirming(true)} data-testid="strict-end-ask">
            End early
          </button>
        )}
      </div>
    </div>
  );
}
