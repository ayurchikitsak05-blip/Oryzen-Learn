import React from "react";
import { Check, Flame } from "lucide-react";
import { STAMP_MINUTES, type WeekStamp } from "@/lib/streak/study-days";

/** This week's stamps and the streak. A day is stamped after 10 minutes of study. */
export function WeekStampsCard({ stamps, streak, todayMinutes, testId = "today-week" }: { stamps: WeekStamp[]; streak: number; todayMinutes: number; testId?: string }) {
  const left = Math.max(0, STAMP_MINUTES - todayMinutes);
  const stampedToday = stamps.some((stamp) => stamp.state === "stamped" && stamp.minutes === todayMinutes && todayMinutes >= STAMP_MINUTES);
  return (
    <section data-testid={testId} aria-label="This week" className="card-soft space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-heading">This week</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f6efe8] px-2.5 py-1 text-xs font-semibold text-[#94664f]" data-testid={`${testId}-streak`}>
          <Flame className="h-3.5 w-3.5" aria-hidden="true" />
          {streak > 0 ? `${streak}-day streak` : "Start a streak"}
        </span>
      </div>
      <ol className="grid grid-cols-7 gap-1" aria-label="Study stamps, Monday to Sunday">
        {stamps.map((stamp) => (
          <li key={stamp.day} className="flex flex-col items-center gap-1.5">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                stamp.state === "stamped"
                  ? "stamp-in bg-accent text-canvas"
                  : stamp.state === "today"
                    ? "border-2 border-accent/60 bg-surface"
                    : "border border-dashed border-line"
              }`}
              aria-label={`${stamp.day}: ${stamp.state === "stamped" ? "stamped" : stamp.state === "future" ? "coming" : stamp.state === "today" ? "today, not stamped yet" : "no stamp"}`}
            >
              {stamp.state === "stamped" ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
            </span>
            <span className={`text-[11px] ${stamp.state === "today" ? "font-bold text-heading" : "text-muted"}`}>{stamp.label}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">
        {stampedToday || left === 0
          ? "Today is stamped. Well done."
          : `${left} more minute${left === 1 ? "" : "s"} of reading, a lecture or the timer earns today's stamp.`}
      </p>
    </section>
  );
}
