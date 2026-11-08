"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { ui } from "@/components/ui/classes";
import { activeSession, completeSprint, formatSprintClock, readSprintStore, upsertSprintSession } from "@/lib/sprint";
import { SPRINT_CHANGED_EVENT } from "@/lib/sprint/guard";
import { isAccountVaultUnlocked } from "@/lib/privacy/account-vault";
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
          Covers the app with only the timer and your book until the sprint ends (full screen where your phone allows
          it). Turn on Do Not Disturb on your phone too.
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
  stillRunning,
}: {
  session: SprintSession;
  clock: string;
  bookHref: string;
  onEndEarly: () => void;
  /** Checked when the overlay closes: full screen stays on while the sprint is still running (e.g. opening the book). */
  stillRunning?: () => boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const bookLink = useRef<HTMLAnchorElement>(null);
  const runningCheck = useRef(stillRunning);
  runningCheck.current = stillRunning;

  useEffect(() => {
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) {
      root.requestFullscreen().catch(() => undefined);
    }
    bookLink.current?.focus();
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (!runningCheck.current?.()) exitFullscreen();
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
        <Link ref={bookLink} href={bookHref} className={`${ui.primary} min-h-12`} data-testid="strict-open-book">
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

function exitFullscreen(): void {
  if (typeof document !== "undefined" && document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => undefined);
  }
}

/**
 * The strict sprint that is running right now, for pages other than the sprint screen (e.g. the
 * reader). Null when strict mode is off, the record is locked, or no sprint is running.
 */
export function useStrictSprint(pathname: string): { session: SprintSession; clock: string; userId: string } | null {
  const userId = useSignedInScope();
  const [state, setState] = useState<{ session: SprintSession; clock: string; userId: string } | null>(null);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (pathname === "/sprint" || pathname.startsWith("/sprint/")) {
      setState(null);
      return;
    }
    const tick = () => {
      if (!readStrictMode() || userId === "local-anonymous" || !isAccountVaultUnlocked()) {
        setState(null);
        return;
      }
      const session = activeSession(readSprintStore(userId).sessions);
      if (session && session.status === "running") {
        wasRunning.current = true;
        setState({ session, clock: formatSprintClock(session, Date.now()), userId });
      } else {
        if (wasRunning.current) exitFullscreen();
        wasRunning.current = false;
        setState(null);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    window.addEventListener(SPRINT_CHANGED_EVENT, tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(SPRINT_CHANGED_EVENT, tick);
    };
  }, [pathname, userId]);
  return state;
}

/** Shown instead of the app menus on other pages (the book) while a strict sprint runs. */
export function StrictBar({ session, clock, userId }: { session: SprintSession; clock: string; userId: string }) {
  const [confirming, setConfirming] = useState(false);
  const end = () => {
    upsertSprintSession(completeSprint(session, Date.now()), userId);
    window.dispatchEvent(new Event(SPRINT_CHANGED_EVENT));
    exitFullscreen();
    setConfirming(false);
  };
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-3 py-2 backdrop-blur-md pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
      data-testid="strict-bar"
      role="region"
      aria-label="Strict mode sprint"
    >
      <div className="mx-auto flex max-w-xl items-center justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold text-heading">
          <Lock className="h-4 w-4" aria-hidden="true" /> Strict · <span data-testid="strict-bar-clock">{clock}</span>
        </span>
        {confirming ? (
          <span className="flex gap-1">
            <button type="button" className={ui.ghost} onClick={() => setConfirming(false)}>
              Keep going
            </button>
            <button type="button" className={ui.secondary} onClick={end} data-testid="strict-bar-end">
              End sprint
            </button>
          </span>
        ) : (
          <span className="flex gap-1">
            <Link href="/sprint" className={ui.ghost}>
              Timer
            </Link>
            <button type="button" className={ui.ghost} onClick={() => setConfirming(true)} data-testid="strict-bar-end-ask">
              End early
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
