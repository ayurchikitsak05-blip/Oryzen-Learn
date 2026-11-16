"use client";

import React, { useEffect, useState } from "react";
import type { AllowanceStatus } from "@/lib/ai/daily-allowance";

/** Fired after any AI help, so the count shown stays right. */
export const AI_HELP_USED_EVENT = "oryzen:ai-help-used";

let cached: { at: number; value: AllowanceStatus } | null = null;
const FRESH_MS = 30_000;

export function notifyAiHelpUsed(): void {
  cached = null;
  try {
    window.dispatchEvent(new Event(AI_HELP_USED_EVENT));
  } catch {
    /* not in a browser */
  }
}

async function loadAllowance(): Promise<AllowanceStatus | null> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.value;
  const response = await fetch("/api/ai/allowance", { credentials: "same-origin" }).catch(() => null);
  if (!response?.ok) return null;
  const json = (await response.json().catch(() => null)) as { allowance?: AllowanceStatus } | null;
  if (!json?.allowance) return null;
  cached = { at: Date.now(), value: json.allowance };
  return json.allowance;
}

export function helpsLeftText(allowance: AllowanceStatus): string {
  if (allowance.left <= 0) return "No AI helps left today. Saved answers, reading and practice still work.";
  return `${allowance.left} of ${allowance.limit} AI helps left today · saved answers are free`;
}

/**
 * "N of 5 AI helps left today", shown before the student asks, so limits are never a surprise.
 * Illustrate, Story and Ask My Book use 2.
 */
export default function AiHelpsLeft({ className = "" }: { className?: string }) {
  const [allowance, setAllowance] = useState<AllowanceStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void loadAllowance().then((value) => {
        if (alive && value) setAllowance(value);
      });
    };
    refresh();
    window.addEventListener(AI_HELP_USED_EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener(AI_HELP_USED_EVENT, refresh);
    };
  }, []);
  if (!allowance) return null;
  return (
    <p className={`text-[11px] text-muted ${className}`} data-testid="ai-helps-left" aria-live="polite">
      {helpsLeftText(allowance)}
    </p>
  );
}
