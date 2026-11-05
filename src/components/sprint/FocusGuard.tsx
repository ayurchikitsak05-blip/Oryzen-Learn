"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { ui } from "@/components/ui/classes";
import {
  activeSession,
  completeSprint,
  readSprintStore,
  resumeSprint,
  upsertSprintSession,
  type SprintSession,
} from "@/lib/sprint";
import {
  applyAway,
  bumpAwayCount,
  creditAwayTime,
  minutesLabel,
  readFocusGuardPrefs,
  SPRINT_CHANGED_EVENT,
  type AwayOutcome,
} from "@/lib/sprint/guard";

const HIDDEN_AT_KEY = "oryzen_focus_guard_hidden_at_v1";

function announce() {
  window.dispatchEvent(new Event(SPRINT_CHANGED_EVENT));
}

/**
 * Watches for the student leaving the app during a running sprint. Mounted once in the
 * app frame, so it works on the sprint screen and in the reader alike. No AI, no network.
 */
export function FocusGuard() {
  const userId = useSignedInScope();
  const [away, setAway] = useState<(AwayOutcome & { count: number }) | null>(null);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    // A reload while away (phones often reload a background tab) still remembers when they left.
    try {
      const saved = Number(window.sessionStorage.getItem(HIDDEN_AT_KEY));
      if (Number.isFinite(saved) && saved > 0) hiddenAt.current = saved;
    } catch {
      /* ignore */
    }

    const check = () => {
      const leftAt = hiddenAt.current;
      hiddenAt.current = null;
      try {
        window.sessionStorage.removeItem(HIDDEN_AT_KEY);
      } catch {
        /* ignore */
      }
      if (leftAt === null || !readFocusGuardPrefs().enabled) return;
      const store = readSprintStore(userId);
      const outcome = applyAway(activeSession(store.sessions), leftAt, Date.now());
      if (!outcome) return;
      upsertSprintSession(outcome.paused, userId);
      announce();
      setAway({ ...outcome, count: bumpAwayCount(outcome.paused.id) });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        try {
          window.sessionStorage.setItem(HIDDEN_AT_KEY, String(hiddenAt.current));
        } catch {
          /* ignore */
        }
      } else {
        check();
      }
    };

    if (document.visibilityState === "visible" && hiddenAt.current !== null) check();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [userId]);

  if (!away) return null;

  const save = (next: SprintSession) => {
    upsertSprintSession(next, userId);
    announce();
    setAway(null);
  };
  const page = away.paused.pageNumber > 0 ? ` at page ${away.paused.pageNumber}` : "";

  return (
    <div className={ui.backdrop} role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-guard-title"
        data-testid="focus-guard"
        className={`${ui.modal} space-y-4`}
      >
        <div>
          <h2 id="focus-guard-title" className={`${ui.heading} text-2xl`}>
            Welcome back
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink">
            You were away for {minutesLabel(away.awayMs)}, so your sprint paused with{" "}
            {minutesLabel(away.remainingMs)} left. It happens to everyone. Ready to pick up{page}?
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-beige-2 px-3 py-2">
            <dt className="text-xs text-muted">Away this sprint</dt>
            <dd className="font-semibold text-heading" data-testid="focus-guard-count">
              {away.count === 1 ? "1 time" : `${away.count} times`}
            </dd>
          </div>
          <div className="rounded-xl bg-beige-2 px-3 py-2">
            <dt className="text-xs text-muted">Focused so far</dt>
            <dd className="font-semibold text-heading">{Math.round(away.focusedMs / 60_000)} min</dd>
          </div>
        </dl>
        <p className="text-xs leading-relaxed text-muted">
          Tip: turn on Do Not Disturb until the timer ends. That&apos;s in your phone&apos;s settings, not ours.
        </p>
        <div className="grid gap-2">
          <button
            type="button"
            className={`${ui.primary} min-h-12`}
            data-testid="focus-guard-continue"
            onClick={() => save(resumeSprint(away.paused, Date.now()))}
          >
            Continue{page}
          </button>
          <button
            type="button"
            className={ui.secondary}
            data-testid="focus-guard-credit"
            onClick={() => save(resumeSprint(creditAwayTime(away.paused, away.awayMs), Date.now()))}
          >
            I was studying (count that time)
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={ui.ghost} data-testid="focus-guard-stay" onClick={() => setAway(null)}>
              Stay paused
            </button>
            <button
              type="button"
              className={ui.ghost}
              data-testid="focus-guard-end"
              onClick={() => save(completeSprint(away.paused, Date.now()))}
            >
              End sprint
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
