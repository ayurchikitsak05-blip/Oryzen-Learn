"use client";

import React, { useEffect, useState } from "react";
import { CalendarClock, Download } from "lucide-react";
import { ui } from "@/components/ui/classes";
import { tipForToday } from "@/lib/motivation/tips";
import { localIsoDate } from "@/lib/roadmap/time";
import { countdownView, drawWallpaper, WALLPAPER_HEIGHT, WALLPAPER_WIDTH } from "@/lib/countdown/wallpaper";

function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Exam countdown on Today, with "Save as wallpaper". */
export function CountdownCard({ examName, examDate, examMonth }: { examName: string; examDate: string; examMonth?: string }) {
  const [today, setToday] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setToday(localIsoDate()), []);
  const view = today ? countdownView(examDate, today, examMonth) : null;
  if (!view) return null;

  const save = () => {
    if (busy) return;
    const canvas = document.createElement("canvas");
    canvas.width = WALLPAPER_WIDTH;
    canvas.height = WALLPAPER_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setMessage("This browser can't make the picture.");
      return;
    }
    drawWallpaper(ctx, {
      examName,
      examDate,
      examMonth,
      today,
      thought: tipForToday(null),
      colours: {
        bg: token("--bg", "#f6f1e8"),
        heading: token("--heading", "#2b2620"),
        ink: token("--body", "#3d362e"),
        accent: token("--accent", "#8a5a2b"),
      },
    });
    setBusy(true);
    canvas.toBlob((blob) => {
      void (async () => {
        try {
          if (!blob) {
            setMessage("This browser can't make the picture.");
            return;
          }
          const name = `oryzen-countdown-${today}.png`;
          const file = typeof File !== "undefined" ? new File([blob], name, { type: "image/png" }) : null;
          // Phones that can share files open the share sheet, where "Save Image" puts it in Photos.
          if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file], title: "Exam countdown" });
              setMessage("Choose Save Image, then set it as your wallpaper from Photos. Make a new one each week.");
              return;
            } catch (error) {
              if ((error as Error)?.name === "AbortError") return;
              // Fall through to a normal download.
            }
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = name;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
          setMessage(
            "If your phone asks, tap Download. Find the picture in your downloads or gallery and set it as wallpaper. If nothing happened, open ORYZEN in Chrome or Safari and try again."
          );
        } finally {
          setBusy(false);
        }
      })();
    }, "image/png");
  };

  return (
    <section className="space-y-2 rounded-2xl border border-line bg-surface px-4 py-3" data-testid="today-countdown">
      <div className="flex items-center gap-3">
        <CalendarClock className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold text-heading" data-testid="countdown-line">
            {examName}: {view.line}
          </p>
          <p className="text-sm text-muted">{view.dateLabel}</p>
        </div>
      </div>
      <button
        type="button"
        className={`${ui.secondary} min-h-10 text-sm`}
        onClick={save}
        disabled={busy}
        data-testid="countdown-wallpaper"
      >
        <Download className="h-4 w-4" aria-hidden="true" /> Save as phone wallpaper
      </button>
      {message ? <p className="text-xs text-muted" role="status">{message}</p> : null}
    </section>
  );
}
