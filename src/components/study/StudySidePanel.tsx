"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  DOSHA_STUDY_PRESETS,
  type Dosha,
} from "@/lib/prakriti/config";
import {
  readSavedBodyType,
  recommendationBullets,
  wellnessSuggestions,
  type SavedBodyType,
} from "@/lib/study/body-type";
import { createClient } from "@/lib/supabase/client";
import {
  beginFocus,
  catchUpSchedule,
  createIdleSchedule,
  formatClock,
  resetSchedule,
  sanitizeSchedule,
  type ScheduleAlert,
  type StudySchedule,
} from "@/lib/study/scheduler";

const SCHEDULE_STORAGE_KEY = "oryzen_study_scheduler_v1";

const ALERT_COPY: Record<ScheduleAlert, { title: string; body: string }> = {
  break: {
    title: "Study block finished",
    body: "Take a break before the next focus block.",
  },
  resume: {
    title: "Break is over",
    body: "Resume studying. Your next focus block is ready.",
  },
  goal: {
    title: "Study goal complete",
    body: "You reached the study time you set for this session.",
  },
};

function readStoredSchedule(): StudySchedule | null {
  try {
    const raw = window.localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; schedule?: unknown };
    if (parsed.version !== 1) return null;
    return sanitizeSchedule(parsed.schedule);
  } catch {
    return null;
  }
}

function writeStoredSchedule(schedule: StudySchedule) {
  window.localStorage.setItem(
    SCHEDULE_STORAGE_KEY,
    JSON.stringify({ version: 1, schedule })
  );
}

function playChime(contextRef: React.MutableRefObject<AudioContext | null>) {
  try {
    const context =
      contextRef.current ?? new AudioContext();
    contextRef.current = context;
    void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 624;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  } catch {
    // Visual alert still carries the reminder when audio is unavailable.
  }
}

function notify(alert: ScheduleAlert) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }
  try {
    const copy = ALERT_COPY[alert];
    new Notification(copy.title, { body: copy.body });
  } catch {
    // The on-screen alert remains when the browser blocks notifications.
  }
}

function RecommendationsCard({
  dosha,
  saved,
}: {
  dosha: Dosha | null;
  saved: SavedBodyType | null;
}) {
  if (!dosha) {
    return (
      <section
        aria-label="Recommendations for Your Body Type"
        className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-5 shadow-xl shadow-black/20"
      >
        <h2 className="text-sm font-semibold tracking-tight text-white">
          Recommendations for Your Body Type
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-amber-100">
          Finish the reading to see pacing and focus strategies made for you.
        </p>
        <Link
          href="/body-type"
          className="mt-4 inline-flex min-h-[44px] items-center rounded-full border border-amber-500/40 bg-amber-950/40 px-4 text-sm font-medium text-amber-100 hover:bg-amber-950/70"
        >
          Discover Your Cognitive Prakriti
        </Link>
      </section>
    );
  }

  const preset = DOSHA_STUDY_PRESETS[dosha];
  const title = saved?.displayProfileTitle ?? preset.modernProfileLabel;

  return (
    <section
      aria-label="Recommendations for Your Body Type"
      data-testid="recommendations-panel"
      className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-5 shadow-xl shadow-black/20"
    >
      <h2 className="text-sm font-semibold tracking-tight text-white">
        Recommendations for Your Body Type
      </h2>
      <p className="mt-3 text-base font-semibold tracking-tight text-amber-50">
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-amber-100">
        {preset.cognitiveSummary}
      </p>
      <ul className="mt-4 space-y-2 text-sm leading-relaxed text-amber-100">
        {recommendationBullets(dosha).map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StudySchedulerCard({
  dosha,
  saved,
}: {
  dosha: Dosha | null;
  saved: SavedBodyType | null;
}) {
  const [schedule, setSchedule] = useState<StudySchedule>(() => createIdleSchedule());
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);
  const [alert, setAlert] = useState<ScheduleAlert | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const alertKeyRef = useRef<string | null>(null);
  const scheduleRef = useRef(schedule);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readStoredSchedule();
      const leftoverVataPace =
        !saved &&
        stored?.phase === "idle" &&
        stored.focusMinutes === DOSHA_STUDY_PRESETS.Vata.pomodoro.studySprintMinutes &&
        stored.breakMinutes === DOSHA_STUDY_PRESETS.Vata.pomodoro.breakMinutes;
      const base =
        stored && !leftoverVataPace
          ? stored
          : createIdleSchedule(
              saved
                ? {
                    focusMinutes: saved.studySprintMinutes,
                    breakMinutes: saved.breakMinutes,
                    goalMinutes: stored?.goalMinutes,
                  }
                : stored
                  ? { goalMinutes: stored.goalMinutes }
                  : undefined
            );
      const caught = catchUpSchedule(base, Date.now());
      setNow(Date.now());
      setSchedule(caught.schedule);
      if (caught.alert) setAlert(caught.alert);
      setMounted(true);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [saved]);

  useEffect(() => {
    if (!ready) return;
    writeStoredSchedule(schedule);
  }, [ready, schedule]);

  useEffect(() => {
    if (!ready || schedule.phase === "idle" || schedule.phase === "complete") return;
    const timer = window.setInterval(() => {
      const tickNow = Date.now();
      setNow(tickNow);
      const caught = catchUpSchedule(scheduleRef.current, tickNow);
      if (caught.schedule !== scheduleRef.current) {
        scheduleRef.current = caught.schedule;
        setSchedule(caught.schedule);
      }
      if (!caught.alert) return;
      const key = `${caught.alert}:${caught.schedule.phase}:${caught.schedule.phaseEndsAt}:${caught.schedule.focusedMs}`;
      if (alertKeyRef.current === key) return;
      alertKeyRef.current = key;
      setAlert(caught.alert);
      playChime(audioRef);
      notify(caught.alert);
    }, 250);
    return () => window.clearInterval(timer);
  }, [ready, schedule.phase]);

  const running = schedule.phase === "focus" || schedule.phase === "break";
  const remaining =
    schedule.phaseEndsAt == null ? 0 : Math.max(0, schedule.phaseEndsAt - now);
  const goalMs = schedule.goalMinutes * 60_000;
  const progress = Math.min(100, Math.round((schedule.focusedMs / goalMs) * 100));
  const wellness = wellnessSuggestions(dosha);
  const showWellness = schedule.phase === "break" || alert === "break";

  const updateNumber = (
    field: "goalMinutes" | "focusMinutes" | "breakMinutes",
    raw: string,
    toMinutes: (value: number) => number
  ) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    setSchedule((current) => ({ ...current, [field]: toMinutes(value) }));
  };

  return (
    <section
      aria-label="Smart study scheduler"
      data-testid="study-scheduler"
      className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-5 shadow-xl shadow-black/20"
    >
      <h2 className="text-sm font-semibold tracking-tight text-white">Smart Study Scheduler</h2>
      <p className="mt-2 text-sm leading-relaxed text-amber-100">
        Set a study goal and the rhythm of focus and rest.
      </p>

      <div className="mt-4 space-y-3">
        <label className="block text-xs font-medium text-amber-200">
          Study goal (hours)
          <input
            type="number"
            min={0.5}
            max={12}
            step={0.5}
            disabled={running}
            value={schedule.goalMinutes / 60}
            onChange={(event) =>
              updateNumber("goalMinutes", event.target.value, (hours) =>
                Math.round(hours * 60)
              )
            }
            className="mt-1 min-h-[44px] w-full rounded-2xl border border-amber-500/30 bg-black px-3 text-sm text-amber-100 disabled:opacity-60"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-amber-200">
            Focus (minutes)
            <input
              type="number"
              min={1}
              max={90}
              step={1}
              disabled={running}
              value={schedule.focusMinutes}
              onChange={(event) =>
                updateNumber("focusMinutes", event.target.value, (minutes) => minutes)
              }
              className="mt-1 min-h-[44px] w-full rounded-2xl border border-amber-500/30 bg-black px-3 text-sm text-amber-100 disabled:opacity-60"
            />
          </label>
          <label className="block text-xs font-medium text-amber-200">
            Break (minutes)
            <input
              type="number"
              min={1}
              max={30}
              step={1}
              disabled={running}
              value={schedule.breakMinutes}
              onChange={(event) =>
                updateNumber("breakMinutes", event.target.value, (minutes) => minutes)
              }
              className="mt-1 min-h-[44px] w-full rounded-2xl border border-amber-500/30 bg-black px-3 text-sm text-amber-100 disabled:opacity-60"
            />
          </label>
        </div>
      </div>

      {mounted && running && (
        <div className="mt-4" aria-live="polite">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-200">
            {schedule.phase === "focus" ? "Focus" : "Break"}
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {formatClock(remaining)}
          </p>
          <p className="mt-1 text-xs text-amber-200">
            {Math.round(schedule.focusedMs / 60_000)} min of {schedule.goalMinutes / 60} hr
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-zinc-100" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {schedule.phase === "complete" && (
        <p className="mt-4 text-sm font-medium text-zinc-100" role="status">
          You reached your study goal.
        </p>
      )}

      {showWellness && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-200">
            Wellness for this break
          </p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-amber-100">
            {wellness.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!running && (
          <button
            type="button"
            onClick={() => {
              const context = audioRef.current ?? new AudioContext();
              audioRef.current = context;
              void context.resume();
              if (typeof Notification !== "undefined" && Notification.permission === "default") {
                void Notification.requestPermission();
              }
              setAlert(null);
              setSchedule((current) => beginFocus(current, Date.now()));
              setNow(Date.now());
            }}
            className="inline-flex min-h-[44px] items-center rounded-full border border-amber-500/40 bg-amber-950/50 px-4 text-sm font-medium text-amber-100 hover:bg-amber-950/70"
          >
            {schedule.phase === "complete" ? "Start again" : "Start"}
          </button>
        )}
        {schedule.phase !== "idle" && (
          <button
            type="button"
            onClick={() => {
              setAlert(null);
              setSchedule((current) => resetSchedule(current));
            }}
            className="inline-flex min-h-[44px] items-center rounded-full border border-amber-500/30 bg-black px-4 text-sm font-medium text-amber-100"
          >
            End session
          </button>
        )}
      </div>

      {alert && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="study-interval-alert-title"
          data-testid="scheduler-alert"
          className="fixed inset-x-4 top-4 z-[80] mx-auto max-w-md rounded-3xl border border-amber-500/30 bg-zinc-950 p-5 shadow-2xl shadow-black/40"
        >
          <h3 id="study-interval-alert-title" className="text-lg font-semibold tracking-tight">
            {ALERT_COPY[alert].title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-amber-100">
            {ALERT_COPY[alert].body}
          </p>
          {alert === "break" && (
            <ul className="mt-3 space-y-1 text-sm text-amber-100">
              {wellness.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setAlert(null)}
            className="mt-4 inline-flex min-h-[44px] items-center rounded-full border border-amber-500/40 bg-amber-950/50 px-4 text-sm font-medium text-amber-100 hover:bg-amber-950/70"
          >
            {alert === "resume" ? "Resume studying" : "Dismiss"}
          </button>
        </div>
      )}
    </section>
  );
}

export default function StudySidePanel({
  dosha,
  showScheduler = true,
}: {
  dosha: Dosha | null;
  showScheduler?: boolean;
}) {
  const [saved, setSaved] = useState<SavedBodyType | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const supabase = createClient();
          const { data } = await supabase.auth.getUser();
          setSaved(readSavedBodyType(data.user?.id ?? null));
        } catch {
          setSaved(null);
        }
        setLoaded(true);
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const constitution = saved ? (dosha ?? saved.primaryDosha) : null;
  const shown = saved && constitution === saved.primaryDosha ? saved : null;

  return (
    <aside className="space-y-4 xl:sticky xl:top-28 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto">
      {loaded && <RecommendationsCard dosha={constitution} saved={shown} />}
      {loaded && showScheduler && (
        <StudySchedulerCard dosha={constitution} saved={shown} />
      )}
    </aside>
  );
}
