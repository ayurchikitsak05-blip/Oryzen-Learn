"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  DOSHA_STUDY_PRESETS,
  type Dosha,
} from "@/lib/prakriti/config";
import {
  modernProfileHeadline,
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
  extendPhase,
  formatClock,
  isSchedulePaused,
  pauseSchedule,
  resetSchedule,
  resumeSchedule,
  sanitizeSchedule,
  skipPhase,
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
        aria-label="Your Learning Insights"
        className="surface-card p-5"
      >
        <h2 className="font-display text-sm text-heading">
          Your Learning Insights
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Explore your learning rhythm for optional study strategies you can try.
        </p>
        <Link
          href="/body-type"
          className="btn-secondary mt-4 text-sm"
        >
          Explore My Learning Profile
        </Link>
      </section>
    );
  }

  const preset = DOSHA_STUDY_PRESETS[dosha];
  const title = modernProfileHeadline(
    saved?.displayProfileTitle ?? preset.modernProfileLabel
  );

  return (
    <section
      aria-label="Your Learning Insights"
      data-testid="recommendations-panel"
      className="surface-card p-5"
    >
      <h2 className="font-display text-sm text-heading">
        Your Learning Insights
      </h2>
      <p className="mt-3 font-display text-base text-heading">
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {preset.cognitiveSummary} These are optional strategies to try—not a measure of ability.
      </p>
      <ul className="mt-4 space-y-2 text-sm leading-relaxed text-ink">
        {recommendationBullets(dosha).map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
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
    if (!ready || schedule.phase === "idle" || schedule.phase === "complete" || isSchedulePaused(schedule)) return;
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
  const paused = isSchedulePaused(schedule);
  const remaining = paused
    ? schedule.pausedRemainingMs ?? 0
    : schedule.phaseEndsAt == null
      ? 0
      : Math.max(0, schedule.phaseEndsAt - now);
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
      aria-label="Plan your study time"
      data-testid="study-scheduler"
      className="surface-card p-5"
    >
      <h2 className="font-display text-sm text-heading">Plan Your Study Time</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Set your goals, make time for focused learning, and take breaks that work for you.
      </p>

      <div className="mt-4 space-y-3">
        <label className="block text-xs font-medium text-muted">
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
            className="field-input mt-1 text-sm disabled:opacity-60"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-muted">
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
              className="field-input mt-1 text-sm disabled:opacity-60"
            />
          </label>
          <label className="block text-xs font-medium text-muted">
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
              className="field-input mt-1 text-sm disabled:opacity-60"
            />
          </label>
        </div>
      </div>

        {mounted && running && (
        <div className="mt-4" aria-live="polite">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            {paused ? "Paused" : schedule.phase === "focus" ? "Focus" : "Break"}
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {formatClock(remaining)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {Math.round(schedule.focusedMs / 60_000)} min of {schedule.goalMinutes / 60} hr
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-beige-2">
            <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {schedule.phase === "complete" && (
        <p className="mt-4 text-sm font-medium text-heading" role="status">
          You reached your study goal.
        </p>
      )}

      {showWellness && (
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            Wellness for this break
          </p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink">
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
            className="btn-primary text-sm"
          >
            {schedule.phase === "complete" ? "Start again" : "Start"}
          </button>
        )}
        {running && !paused && (
          <button
            type="button"
            data-testid="scheduler-pause"
            onClick={() => {
              const tick = Date.now();
              setNow(tick);
              setSchedule((current) => pauseSchedule(current, tick));
            }}
            className="btn-secondary text-sm"
          >
            Pause
          </button>
        )}
        {running && paused && (
          <button
            type="button"
            data-testid="scheduler-resume"
            onClick={() => {
              const tick = Date.now();
              setNow(tick);
              setSchedule((current) => resumeSchedule(current, tick));
            }}
            className="btn-primary text-sm"
          >
            Resume
          </button>
        )}
        {running && (
          <>
            <button
              type="button"
              data-testid="scheduler-skip"
              onClick={() => {
                const tick = Date.now();
                setNow(tick);
                setSchedule((current) => skipPhase(current, tick));
              }}
              className="btn-secondary text-sm"
            >
              Skip
            </button>
            <button
              type="button"
              data-testid="scheduler-extend"
              onClick={() => {
                const tick = Date.now();
                setNow(tick);
                setSchedule((current) => extendPhase(current, 5, tick));
              }}
              className="btn-secondary text-sm"
            >
              Extend 5 min
            </button>
          </>
        )}
        {schedule.phase !== "idle" && (
          <button
            type="button"
            data-testid="scheduler-end"
            onClick={() => {
              setAlert(null);
              setSchedule((current) => resetSchedule(current));
            }}
            className="btn-secondary text-sm"
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
          className="surface-card fixed inset-x-4 top-4 z-[80] mx-auto max-w-md p-5 shadow-[0_24px_60px_-28px_rgba(32,36,43,0.45)]"
        >
          <h3 id="study-interval-alert-title" className="font-display text-lg text-heading">
            {ALERT_COPY[alert].title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-ink">
            {ALERT_COPY[alert].body}
          </p>
          {alert === "break" && (
            <ul className="mt-3 space-y-1 text-sm text-ink">
              {wellness.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setAlert(null)}
            className="btn-primary mt-4 text-sm"
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
  showScheduler = false,
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
    <aside className="space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
      {loaded && <RecommendationsCard dosha={constitution} saved={shown} />}
      {loaded && showScheduler && (
        <StudySchedulerCard dosha={constitution} saved={shown} />
      )}
    </aside>
  );
}
