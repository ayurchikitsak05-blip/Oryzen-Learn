"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { tabClass, ui } from "@/components/ui/classes";
import { adjustSession, moveSession, setSessionStart } from "@/lib/roadmap/edit";
import {
  dayByDate,
  daysInRange,
  detectMissedDates,
  planProgress,
  workSessions,
} from "@/lib/roadmap/engine";
import { linksForSession } from "@/lib/roadmap/hooks";
import { applyReplan, proposeReplan } from "@/lib/roadmap/replan";
import {
  addDays,
  daysBetween,
  formatClock,
  formatDisplayDate,
  formatHours,
  parseClock,
} from "@/lib/roadmap/time";
import type { ReplanProposal, RoadmapRecord, RoadmapSession } from "@/lib/roadmap/types";

type StudioTab = "today" | "week" | "month" | "custom" | "edit";

function SessionRow({
  session,
  completed,
  onToggle,
}: {
  session: RoadmapSession;
  completed: boolean;
  onToggle: () => void;
}) {
  const links = linksForSession(session);
  const isWork = session.kind !== "break" && session.kind !== "buffer";
  return (
    <article
      data-testid={isWork ? "roadmap-task" : "roadmap-slot"}
      className={`rounded-2xl border px-4 py-3 ${completed ? "border-success/20 bg-success-bg" : "border-line bg-beige-2"}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">
            {formatClock(session.startMinutes)}–{formatClock(session.endMinutes)} · {session.kind.replace("_", " ")}
          </p>
          <h3 className="mt-1 font-display text-base text-heading">{session.title}</h3>
          {session.subjectName && (
            <p className="mt-1 text-sm text-muted">{session.subjectName}</p>
          )}
        </div>
        {isWork && (
          <label className="inline-flex min-h-11 items-center gap-2 text-sm text-heading">
            <input
              data-testid="roadmap-task-complete"
              type="checkbox"
              checked={completed}
              onChange={onToggle}
            />
            Done
          </label>
        )}
      </div>
      {isWork && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link href={links.reader} className={ui.secondary}>
            Open in Read
          </Link>
          <Link href={links.notes} className={ui.secondary}>
            Notes
          </Link>
          <Link href={links.testMe} className={ui.secondary}>
            Test Me
          </Link>
          <Link href={links.weakConcepts} className={ui.secondary}>
            Weak concepts
          </Link>
        </div>
      )}
    </article>
  );
}

export default function RoadmapStudio({
  record,
  today,
  onChange,
  onReset,
}: {
  record: RoadmapRecord;
  today: string;
  onChange: (record: RoadmapRecord) => void;
  onReset: () => void;
}) {
  const [tab, setTab] = useState<StudioTab>("today");
  const [replanOpen, setReplanOpen] = useState(false);
  const [proposal, setProposal] = useState<ReplanProposal | null>(null);
  const [selectedMissed, setSelectedMissed] = useState<string[]>([]);
  const [dailyHours, setDailyHours] = useState(record.intake.dailyHours);
  const [examDate, setExamDate] = useState(record.intake.examDate);
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(addDays(today, 13));
  const [editDate, setEditDate] = useState(today);
  const [editStart, setEditStart] = useState("");
  const [editMinutes, setEditMinutes] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editWarning, setEditWarning] = useState<string | null>(null);

  const missed = useMemo(
    () => detectMissedDates(record.plan, record.completions, today),
    [record, today]
  );
  const progress = planProgress(record.plan, record.completions);
  const todayDay = dayByDate(record.plan, today);
  const daysLeft = Math.max(0, daysBetween(today, record.intake.examDate));
  const week = record.plan.weeks.find((row) => row.days.some((day) => day.date === today)) ?? record.plan.weeks[0];
  const month = record.plan.months.find((row) => row.days.some((day) => day.date === today)) ?? record.plan.months[0];
  const customDays = daysInRange(record.plan.days, customStart, customEnd);
  const examLabel = record.intake.examName.trim() || "the exam";

  const toggleComplete = (sessionId: string) => {
    const next = { ...record, completions: { ...record.completions }, updatedAt: new Date().toISOString() };
    if (next.completions[sessionId]) {
      delete next.completions[sessionId];
    } else {
      next.completions[sessionId] = { completedAt: new Date().toISOString() };
    }
    onChange(next);
  };

  const openReplan = (preset: string[] = missed) => {
    setSelectedMissed(preset.length > 0 ? preset : [today]);
    setDailyHours(record.intake.dailyHours);
    setExamDate(record.intake.examDate);
    setProposal(null);
    setReplanOpen(true);
  };

  const previewReplan = () => {
    setProposal(
      proposeReplan(record, {
        today,
        missedDates: selectedMissed,
        intakeOverrides: { dailyHours, examDate },
      })
    );
  };

  const confirmReplan = () => {
    if (!proposal) return;
    onChange(applyReplan(record, proposal));
    setReplanOpen(false);
    setProposal(null);
  };

  const applyEdit = () => {
    if (!editId) return;
    let next = record;
    let warning: string | null = null;
    if (editDate) {
      const moved = moveSession(next, editId, editDate, next.plan.days.flatMap((day) => day.sessions).find((session) => session.id === editId)?.startMinutes ?? 16 * 60);
      next = moved.record;
      warning = moved.warning;
    }
    if (!warning && editStart) {
      const parsed = parseClock(editStart);
      if (parsed != null) {
        const started = setSessionStart(next, editId, parsed);
        next = started.record;
        warning = started.warning;
      }
    }
    if (!warning && editMinutes) {
      const adjusted = adjustSession(next, editId, Number(editMinutes));
      next = adjusted.record;
      warning = adjusted.warning;
    }
    setEditWarning(warning);
    if (!warning) {
      onChange({ ...next, updatedAt: new Date().toISOString() });
    }
  };

  const markMissed = (date: string) => {
    openReplan([...new Set([...missed, date])]);
  };

  return (
    <div className="mt-8 space-y-6">
      {!record.plan.overflow.fits && (
        <p data-testid="roadmap-overflow" className={ui.alert}>
          {record.plan.overflow.message}
        </p>
      )}

      {missed.length > 0 && (
        <div className={ui.notice}>
          You missed {missed.length} study day{missed.length === 1 ? "" : "s"}. Rebuild the plan around what is left.
          <button type="button" className={`${ui.secondary} ml-3`} onClick={() => openReplan(missed)}>
            Replan My Studies
          </button>
        </div>
      )}

      <section className={ui.cardPad}>
        <p className={ui.eyebrow}>Today · {formatDisplayDate(today)}</p>
        <h2 className={`${ui.heading} mt-2 text-2xl`}>
          {daysLeft} day{daysLeft === 1 ? "" : "s"} until {examLabel}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {progress.completedWork} of {progress.totalWork} study blocks done · {formatHours(progress.completedMinutes)} of {formatHours(progress.totalMinutes)}
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-beige-2">
          <div className="h-full rounded-full bg-heading" style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" data-testid="roadmap-replan" className={ui.secondary} onClick={() => openReplan()}>
            Replan My Studies
          </button>
          <button type="button" className={ui.ghost} onClick={onReset}>
            Start a new roadmap
          </button>
        </div>
      </section>

      <nav className="flex flex-wrap gap-1" aria-label="Roadmap views">
        {(
          [
            ["today", "Today"],
            ["week", "This week"],
            ["month", "This month"],
            ["custom", "Custom range"],
            ["edit", "Edit timetable"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={tabClass(tab === id)} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "today" && (
        <section data-testid="roadmap-today" className="space-y-3">
          {!todayDay || todayDay.sessions.length === 0 ? (
            <p className={ui.empty}>No sessions sit on today. Open this week to move one here, or replan.</p>
          ) : (
            todayDay.sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                completed={Boolean(record.completions[session.id])}
                onToggle={() => toggleComplete(session.id)}
              />
            ))
          )}
        </section>
      )}

      {tab === "week" && week && (
        <section className="space-y-4">
          {week.days.map((day) => (
            <div key={day.date} className={ui.card}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={`${ui.heading} text-lg`}>{formatDisplayDate(day.date)}</h3>
                <button type="button" className={ui.ghost} onClick={() => markMissed(day.date)}>
                  I missed this day
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {workSessions(day.sessions).map((session) => (
                  <p key={session.id} className="text-sm text-ink">
                    {formatClock(session.startMinutes)} · {session.title}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === "month" && month && (
        <section className="grid gap-3 md:grid-cols-2">
          {month.days.map((day) => (
            <article key={day.date} className={ui.card}>
              <p className={ui.eyebrow}>{formatDisplayDate(day.date)}</p>
              <p className="mt-2 text-sm text-muted">
                {workSessions(day.sessions).length} study blocks · {day.kind}
              </p>
            </article>
          ))}
        </section>
      )}

      {tab === "custom" && (
        <section className="space-y-4" data-testid="roadmap-custom">
          <div className={`${ui.cardPad} grid gap-3 md:grid-cols-2`}>
            <label>
              <span className={ui.label}>From</span>
              <input
                data-testid="roadmap-custom-start"
                type="date"
                value={customStart}
                min={record.plan.days[0]?.date ?? today}
                max={record.intake.examDate}
                onChange={(event) => setCustomStart(event.target.value)}
                className={ui.input}
              />
            </label>
            <label>
              <span className={ui.label}>To</span>
              <input
                data-testid="roadmap-custom-end"
                type="date"
                value={customEnd}
                min={record.plan.days[0]?.date ?? today}
                max={record.intake.examDate}
                onChange={(event) => setCustomEnd(event.target.value)}
                className={ui.input}
              />
            </label>
          </div>
          {customDays.length === 0 ? (
            <p className={ui.empty}>No planned days sit in that range.</p>
          ) : (
            customDays.map((day) => (
              <div key={day.date} className={ui.card}>
                <h3 className={`${ui.heading} text-lg`}>{formatDisplayDate(day.date)}</h3>
                <div className="mt-3 space-y-2">
                  {workSessions(day.sessions).map((session) => (
                    <p key={session.id} className="text-sm text-ink">
                      {formatClock(session.startMinutes)} · {session.title}
                    </p>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {tab === "edit" && (
        <section className={ui.cardPad} data-testid="roadmap-edit">
          <h3 className={`${ui.heading} text-lg`}>Move, reschedule, or shorten a session</h3>
          <p className="mt-2 text-sm text-muted">
            Sessions stay outside your sleep window ({formatClock(record.intake.sleepWindow.startMinutes)}–
            {formatClock(record.intake.sleepWindow.endMinutes)}).
          </p>
          <div className="mt-4 space-y-2">
            {workSessions(record.plan.days.flatMap((day) => day.sessions))
              .slice(0, 24)
              .map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => {
                    setEditId(session.id);
                    setEditDate(session.date);
                    setEditStart(formatClock(session.startMinutes));
                    setEditMinutes(String(session.minutes));
                    setEditWarning(null);
                  }}
                  className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${
                    editId === session.id ? ui.selected : ui.idle
                  }`}
                >
                  {formatDisplayDate(session.date)} · {formatClock(session.startMinutes)} · {session.title}
                </button>
              ))}
          </div>
          {editId && (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label>
                <span className={ui.label}>Move to date</span>
                <input
                  type="date"
                  value={editDate}
                  min={today}
                  max={addDays(record.intake.examDate, -1)}
                  onChange={(event) => setEditDate(event.target.value)}
                  className={ui.input}
                />
              </label>
              <label>
                <span className={ui.label}>Start time</span>
                <input
                  type="time"
                  value={editStart}
                  onChange={(event) => setEditStart(event.target.value)}
                  className={ui.input}
                />
              </label>
              <label>
                <span className={ui.label}>Minutes</span>
                <input
                  type="number"
                  min={10}
                  value={editMinutes}
                  onChange={(event) => setEditMinutes(event.target.value)}
                  className={ui.input}
                />
              </label>
              <button type="button" className={`${ui.primary} md:col-span-3`} onClick={applyEdit}>
                Save session change
              </button>
              {editWarning && <p className={`${ui.alert} md:col-span-3`}>{editWarning}</p>}
            </div>
          )}
        </section>
      )}

      {replanOpen && (
        <div className={ui.backdrop} role="dialog" aria-labelledby="replan-title">
          <div className={`${ui.modal} max-w-xl`} data-testid="roadmap-replan-dialog">
            <p className={ui.eyebrow}>Replan My Studies</p>
            <h3 id="replan-title" className={`${ui.heading} mt-2 text-xl`}>
              Review before replacing your plan
            </h3>
            <p className="mt-2 text-sm text-muted">
              Missed days, a new daily hour count, and unfinished chapters are rebuilt. Nothing changes until you confirm.
            </p>
            <div className="mt-4 space-y-2">
              {record.plan.days.slice(0, 10).map((day) => (
                <label key={day.date} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    data-testid="roadmap-missed-day"
                    type="checkbox"
                    checked={selectedMissed.includes(day.date)}
                    onChange={() =>
                      setSelectedMissed((current) =>
                        current.includes(day.date)
                          ? current.filter((value) => value !== day.date)
                          : [...current, day.date]
                      )
                    }
                  />
                  Missed {formatDisplayDate(day.date)}
                </label>
              ))}
            </div>
            <label className="mt-4 block">
              <span className={ui.label}>Daily hours after this change</span>
              <input
                type="number"
                min={0.5}
                max={12}
                step={0.5}
                value={dailyHours}
                onChange={(event) => setDailyHours(Number(event.target.value))}
                className={ui.input}
              />
            </label>
            <label className="mt-4 block">
              <span className={ui.label}>Exam date after this change</span>
              <input
                data-testid="roadmap-replan-exam-date"
                type="date"
                min={today}
                value={examDate}
                onChange={(event) => setExamDate(event.target.value)}
                className={ui.input}
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={ui.secondary} onClick={previewReplan}>
                Preview rebuilt plan
              </button>
              <button type="button" className={ui.ghost} onClick={() => setReplanOpen(false)}>
                Keep current plan
              </button>
            </div>
            {proposal && (
              <div className="mt-4 space-y-3">
                <p className={ui.notice}>{proposal.summary}</p>
                {!proposal.overflow.fits && (
                  <p className={ui.alert}>{proposal.overflow.message}</p>
                )}
                <button
                  type="button"
                  data-testid="roadmap-replan-confirm"
                  className={ui.primary}
                  onClick={confirmReplan}
                >
                  Replace my current plan
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
