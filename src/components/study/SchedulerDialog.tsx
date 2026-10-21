"use client";

import React, { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { StudySchedulerCard } from "@/components/study/StudySidePanel";
import { readSavedBodyType, type SavedBodyType } from "@/lib/study/body-type";
import { fetchSignedInUser } from "@/lib/supabase/session";

export default function SchedulerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const [saved, setSaved] = useState<SavedBodyType | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const user = await fetchSignedInUser();
          setSaved(readSavedBodyType(user?.userId ?? null));
        } catch {
          setSaved(null);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color-mix(in_srgb,var(--heading)_28%,transparent)] p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="surface-card max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-md overflow-y-auto p-3 shadow-[0_24px_60px_-28px_rgba(32,36,43,0.45)] [animation:oryzen-rise_180ms_ease]"
      >
        <div className="mb-2 flex items-center justify-between px-2 pt-2">
          <h2 id={titleId} className="font-display text-base text-heading">
            Plan Your Study Time
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close study planner"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-beige-2 hover:text-heading"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <StudySchedulerCard dosha={saved?.primaryDosha ?? null} saved={saved} />
      </div>
    </div>
  );
}
