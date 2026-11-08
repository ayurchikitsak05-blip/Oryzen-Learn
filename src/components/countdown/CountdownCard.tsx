"use client";

import React, { useEffect, useState } from "react";
import { CalendarClock, Download } from "lucide-react";
import { ui } from "@/components/ui/classes";
import { tipForToday } from "@/lib/motivation/tips";
import { localIsoDate } from "@/lib/roadmap/time";
import {
  countdownLine,
  daysUntil,
  drawWallpaper,
  formatExamDate,
  WALLPAPER_HEIGHT,
  WALLPAPER_WIDTH,
} from "@/lib/countdown/wallpaper";

function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Exam countdown on Today, with "Save as wallpaper". */
export function CountdownCard({ examName, examDate }: { examName: string; examDate: string }) {
  const [today, setToday] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => setToday(localIsoDate()), []);
  if (!today || examDate < today) return null;
  const days = daysUntil(examDate, today);

  const save = () => {
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
      today,
      thought: tipForToday(null),
      colours: {
        bg: token("--bg", "#f6f1e8"),
        heading: token("--heading", "#2b2620"),
        ink: token("--body", "#3d362e"),
        accent: token("--accent", "#8a5a2b"),
      },
    });
    canvas.toBlob((blob) => {
      if (!blob) {
        setMessage("This browser can't make the picture.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `oryzen-countdown-${today}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Saved. Open it in Photos and choose 'Use as wallpaper'. Save a new one each week to keep it current.");
    }, "image/png");
  };

  return (
    <section className="space-y-2 rounded-2xl border border-line bg-surface px-4 py-3" data-testid="today-countdown">
      <div className="flex items-center gap-3">
        <CalendarClock className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-heading">
            {examName}: {countdownLine(days)}
          </p>
          <p className="text-sm text-muted">{formatExamDate(examDate)}</p>
        </div>
      </div>
      <button type="button" className={`${ui.secondary} min-h-10 text-sm`} onClick={save} data-testid="countdown-wallpaper">
        <Download className="h-4 w-4" aria-hidden="true" /> Save as phone wallpaper
      </button>
      {message ? <p className="text-xs text-muted" role="status">{message}</p> : null}
    </section>
  );
}
