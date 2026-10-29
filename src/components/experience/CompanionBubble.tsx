"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CompanionFigure } from "@/components/companion/CompanionFigure";
import { readCompanionStore, STARTER_COMPANIONS, STYLE_COPY } from "@/lib/companion";
import { experienceVisibleTo } from "@/lib/experience/persist";
import { fetchSignedInUser } from "@/lib/supabase/session";

const BUBBLE_ROUTES = ["/hub", "/studio", "/companion", "/personalize"];

function lineFor(style: string): string {
  if (style === "teacher") return "Read one passage, then put it in your own words.";
  if (style === "coach") return "One saved block is enough for this sitting.";
  if (style === "guide") return "Pause when you need to. The page will keep.";
  return "Text only. I'm beside the work, not a person.";
}

export function CompanionBubble() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [style, setStyle] = useState<"buddy" | "teacher" | "coach" | "guide">("buddy");
  const [character, setCharacter] = useState<"leaf" | "lamp" | "stone" | "kite">("leaf");

  useEffect(() => {
    if (!BUBBLE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
      setOpen(false);
      return;
    }
    if (window.sessionStorage.getItem("oryzen-bubble-hide") === "1") {
      setOpen(false);
      return;
    }
    let cancelled = false;
    void fetchSignedInUser()
      .then((user) => {
        if (cancelled) return;
        const prefs = experienceVisibleTo(user?.userId ?? null);
        const show = prefs?.experience === "studio" && (prefs.rewards !== false || prefs.decorations);
        if (!show) {
          setOpen(false);
          return;
        }
        const store = readCompanionStore(user?.userId ?? null);
        const starter = STARTER_COMPANIONS.find((member) => member.style === store.prefs.style);
        setStyle(store.prefs.style);
        setCharacter(store.prefs.onboarded ? store.prefs.character : starter?.character ?? "leaf");
        setOpen(true);
      })
      .catch(() => setOpen(false));
    const wide = typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 768px)") : null;
    const sync = () => setExpanded(Boolean(wide?.matches));
    sync();
    wide?.addEventListener("change", sync);
    return () => {
      cancelled = true;
      wide?.removeEventListener("change", sync);
    };
  }, [pathname]);

  if (!open) return null;
  const label = STYLE_COPY[style].label;
  const line = lineFor(style);
  return (
    <aside
      data-testid="companion-bubble"
      data-expanded={expanded ? "true" : "false"}
      className="fixed right-3 bottom-[5.5rem] z-30 md:bottom-6"
    >
      {expanded ? (
        <div className="flex w-[min(16rem,calc(100vw-1.5rem))] items-start gap-2 rounded-3xl border border-line bg-surface p-3 shadow-sm">
          <CompanionFigure character={character} still className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-heading">{label}</p>
            <p className="text-sm leading-snug text-ink">{line}</p>
            <button
              type="button"
              className="mt-1 text-xs text-muted underline"
              onClick={() => {
                window.sessionStorage.setItem("oryzen-bubble-hide", "1");
                setOpen(false);
              }}
            >
              Hide
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface shadow-sm"
          aria-expanded="false"
          aria-label={`${label}. ${line}. Show the note.`}
          onClick={() => setExpanded(true)}
        >
          <CompanionFigure character={character} still className="h-9 w-9" />
        </button>
      )}
    </aside>
  );
}
