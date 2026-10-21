"use client";

import React, { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { StudySchedulerCard } from "@/components/study/StudySidePanel";
import { readSavedBodyType, type SavedBodyType } from "@/lib/study/body-type";
import { createClient } from "@/lib/supabase/client";

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
          const supabase = createClient();
          const { data } = await supabase.auth.getUser();
          setSaved(readSavedBodyType(data.user?.id ?? null));
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-md overflow-y-auto rounded-3xl border border-amber-500/30 bg-zinc-950 p-3 shadow-2xl shadow-black/50 [animation:oryzen-rise_180ms_ease]"
      >
        <div className="mb-2 flex items-center justify-between px-2 pt-2">
          <h2 id={titleId} className="text-base font-semibold tracking-tight text-white">
            Smart Scheduler
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scheduler"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <StudySchedulerCard dosha={saved?.primaryDosha ?? null} saved={saved} />
      </div>
    </div>
  );
}
