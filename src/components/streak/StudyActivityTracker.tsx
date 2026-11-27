"use client";

import { useEffect } from "react";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { whenAccountVaultOpen } from "@/lib/privacy/account-vault";
import { recordActiveMinute } from "@/lib/streak/study-days";
import { todayKey } from "@/lib/sprint/plan";

/** Pages where time spent counts as study for the week stamps. */
export const STUDY_PATHS = ["/reader", "/video", "/revise", "/synthesis", "/notes", "/vaults", "/practice", "/voice-notes"];

export function isStudyPath(pathname: string): boolean {
  return STUDY_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** A minute counts when the page is on screen and the student touched, scrolled or typed in the last 90 seconds. */
export const IDLE_AFTER_MS = 90_000;

export function StudyActivityTracker({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    let userId: string | null = null;
    let cancelled = false;
    let lastInput = Date.now();
    const onInput = () => {
      lastInput = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    events.forEach((name) => window.addEventListener(name, onInput, { passive: true, capture: true }));
    void fetchSignedInUser()
      .then(async (user) => {
        if (cancelled || !user?.userId) return;
        await whenAccountVaultOpen().catch(() => false);
        if (!cancelled) userId = user.userId;
      })
      .catch(() => undefined);
    const timer = window.setInterval(() => {
      if (!userId || document.visibilityState !== "visible") return;
      if (Date.now() - lastInput > IDLE_AFTER_MS) return;
      recordActiveMinute(userId, todayKey());
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      events.forEach((name) => window.removeEventListener(name, onInput, { capture: true }));
    };
  }, [active]);
  return null;
}
