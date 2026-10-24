"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { choiceClass, ui } from "@/components/ui/classes";
import { readSavedBodyType } from "@/lib/study/body-type";
import { listLocalPdfDocuments, type LocalPdfDocumentRecord } from "@/lib/reader/storage";
import {
  RHYTHM_COPY,
  SPRINT_DURATIONS,
  activeSession,
  completeSprint,
  createSprintSession,
  formatSprintClock,
  listSprintNotes,
  nextRecommendedBlock,
  notesHref,
  pauseSprint,
  pendingSessions,
  quizHref,
  readerHref,
  DEFAULT_SPRINT_STORE,
  readSprintStore,
  resumeSprint,
  saveSprintNote,
  splitDailyTarget,
  startSprint,
  statusLabel,
  studiedMinutesOnDate,
  suggestSprintDefaults,
  tickSprint,
  todayKey,
  upsertSprintSession,
  patchSprintPrefs,
  type SprintRhythm,
  type SprintSession,
  type SprintStore,
} from "@/lib/sprint";

const EMPTY_SPRINT_STORE: SprintStore = { ...DEFAULT_SPRINT_STORE, sessions: [] };

export function SprintStudio({ userId }: { userId: string }) {
  const [store, setStore] = useState<SprintStore>(EMPTY_SPRINT_STORE);
  const [ready, setReady] = useState(false);
  const [goal, setGoal] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [chapter, setChapter] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [documents, setDocuments] = useState<LocalPdfDocumentRecord[]>([]);
  const [now, setNow] = useState(0);
  const [noteStatus, setNoteStatus] = useState("");
  const seededRhythm = useRef(false);
  const today = todayKey();

  useEffect(() => {
    setStore(readSprintStore(userId));
    setNow(Date.now());
    setReady(true);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [userId]);

  useEffect(() => {
    void listLocalPdfDocuments().then(setDocuments).catch(() => setDocuments([]));
  }, []);

  useEffect(() => {
    if (!ready || seededRhythm.current || store.sessions.length > 0) return;
    const body = readSavedBodyType(userId === "local-anonymous" ? null : userId);
    if (!body) return;
    if (
      store.rhythm !== "custom" ||
      store.preferredDuration !== 25 ||
      store.dailyTargetMinutes !== 90
    ) {
      return;
    }
    const suggested = suggestSprintDefaults(body.primaryDosha);
    seededRhythm.current = true;
    setStore(
      patchSprintPrefs(
        {
          rhythm: suggested.rhythm,
          preferredDuration: suggested.duration,
          preferredBreakMinutes: suggested.breakMinutes,
          dailyTargetMinutes: suggested.dailyTargetMinutes,
        },
        userId
      )
    );
  }, [ready, store.dailyTargetMinutes, store.preferredDuration, store.rhythm, store.sessions.length, userId]);

  const live = useMemo(() => {
    const current = activeSession(store.sessions);
    return current && now ? tickSprint(current, now) : current;
  }, [store.sessions, now]);

  useEffect(() => {
    if (!live || !now) return;
    if (live.status === "break" || live.status === "completed") {
      const stored = store.sessions.find((item) => item.id === live.id);
      if (stored && (stored.status !== live.status || stored.elapsedMs !== live.elapsedMs)) {
        setStore(upsertSprintSession(live, userId));
      }
    }
  }, [live, now, store.sessions, userId]);

  const studied = studiedMinutesOnDate(store.sessions, today);
  const pending = pendingSessions(store.sessions, today);
  const plan = splitDailyTarget(store.dailyTargetMinutes, store.preferredDuration);
  const nextBlock = nextRecommendedBlock(
    store.sessions,
    store.dailyTargetMinutes,
    store.preferredDuration,
    today
  );
  const sessionNotes = ready
    ? listSprintNotes(userId).filter((note) =>
        store.sessions.some((session) => session.id === note.sessionId)
      )
    : [];
  const selectedDoc = documents.find((item) => item.id === documentId);

  const saveSession = (session: SprintSession) => {
    setStore(upsertSprintSession(session, userId));
  };

  const create = () => {
    const session = createSprintSession({
      goal: goal || topic || chapter || subject || "Study this page",
      subject,
      topic,
      chapter: chapter || selectedDoc?.chapters[0]?.title || "",
      documentId,
      documentTitle: selectedDoc?.title ?? "",
      durationMinutes: store.preferredDuration,
      breakMinutes: store.preferredBreakMinutes,
      dailyTargetMinutes: store.dailyTargetMinutes,
      date: today,
    });
    saveSession(startSprint(session));
    setGoal("");
  };

  return (
    <div data-testid="sprint-studio" className="space-y-6">
      <div>
        <p className={ui.eyebrow}>StudySprint</p>
        <h1 className={`${ui.heading} mt-2 text-3xl`}>A timed study block from your book</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Pick a goal, choose a length, then start, pause, or resume. Longer daily targets split
          into smaller sessions with breaks. These timings are suggestions you can change.
        </p>
      </div>

      <section className={ui.card} data-testid="sprint-progress">
        <p className="text-sm text-heading">
          Today: {studied} of {store.dailyTargetMinutes} minutes
        </p>
        <p className="mt-1 text-xs text-muted">
          {plan.count} session{plan.count === 1 ? "" : "s"} of about {store.preferredDuration}{" "}
          minutes, with {store.preferredBreakMinutes}-minute breaks.
        </p>
        {pending.length > 0 ? (
          <p className="mt-2 text-sm text-muted">{pending.length} unfinished today.</p>
        ) : null}
        <p data-testid="sprint-next-block" className="mt-2 text-sm text-heading">
          {nextBlock.hint}
        </p>
      </section>

      {live ? (
        <section className={ui.cardPad} data-testid="sprint-timer">
          <p className={ui.eyebrow}>{statusLabel(live.status)}</p>
          <p className={`${ui.heading} mt-2 text-4xl`} data-testid="sprint-clock">
            {live.status === "break" ? "Break" : formatSprintClock(live, now)}
          </p>
          <p className="mt-2 text-sm text-heading">{live.goal}</p>
          <p className="text-xs text-muted">
            {[live.subject, live.topic || live.chapter].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {live.status === "running" ? (
              <button
                type="button"
                data-testid="sprint-pause"
                className={ui.primary}
                onClick={() => saveSession(pauseSprint(live, Date.now()))}
              >
                Pause
              </button>
            ) : null}
            {live.status === "paused" || live.status === "break" ? (
              <button
                type="button"
                data-testid="sprint-resume"
                className={ui.primary}
                onClick={() => saveSession(resumeSprint(live, Date.now()))}
              >
                Resume
              </button>
            ) : null}
            <button
              type="button"
              data-testid="sprint-complete"
              className={ui.secondary}
              onClick={() => saveSession(completeSprint(live, Date.now()))}
            >
              Complete
            </button>
            <Link href={readerHref(live)} className={ui.secondary} data-testid="sprint-open-reader">
              Open book
            </Link>
            <Link href={quizHref(live)} className={ui.ghost} data-testid="sprint-open-quiz">
              Take quiz
            </Link>
            <button
              type="button"
              data-testid="sprint-save-note"
              className={ui.ghost}
              onClick={() => {
                saveSprintNote(
                  {
                    session: live,
                    kind: "session",
                    title: live.goal,
                    body: `StudySprint on ${live.subject || live.documentTitle || "this book"}: ${live.goal}. ${live.passageText || live.topic || live.chapter}`,
                  },
                  userId
                );
                setNoteStatus("Saved to your notebook with the book and page as the source.");
              }}
            >
              Save notes
            </button>
            <Link href={notesHref(live)} className={ui.ghost}>
              Open notebook
            </Link>
            <Link href="/companion" className={ui.ghost}>
              Ask companion
            </Link>
          </div>
          {live.status === "break" ? (
            <p data-testid="sprint-break" className={`${ui.notice} mt-4`}>
              Break time. Step away for {live.breakMinutes} minutes, then resume or complete.
            </p>
          ) : null}
        </section>
      ) : (
        <section className={`${ui.cardPad} space-y-4`} data-testid="sprint-setup">
          <label className="block">
            <span className={ui.label}>Study goal</span>
            <input
              data-testid="sprint-goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              className={ui.input}
              placeholder="Finish the linear equations page"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={ui.label}>Subject</span>
              <input
                data-testid="sprint-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className={ui.input}
                placeholder="Mathematics"
              />
            </label>
            <label className="block">
              <span className={ui.label}>Topic or chapter</span>
              <input
                data-testid="sprint-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                className={ui.input}
                placeholder="Linear equations"
              />
            </label>
          </div>
          <label className="block">
            <span className={ui.label}>PDF in your reader</span>
            <select
              data-testid="sprint-document"
              value={documentId}
              className={ui.input}
              onChange={(event) => {
                setDocumentId(event.target.value);
                const doc = documents.find((item) => item.id === event.target.value);
                if (doc && !subject) setSubject(doc.title);
                setChapter(doc?.chapters[0]?.title ?? "");
              }}
            >
              <option value="">Use any open book</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className={ui.label}>Session length</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {SPRINT_DURATIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  data-testid={`sprint-duration-${minutes}`}
                  className={choiceClass(store.preferredDuration === minutes)}
                  onClick={() =>
                    setStore(patchSprintPrefs({ preferredDuration: minutes }, userId))
                  }
                >
                  {minutes} min
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className={ui.label}>Daily target (minutes)</span>
            <input
              data-testid="sprint-daily-target"
              type="number"
              min={15}
              max={360}
              value={store.dailyTargetMinutes}
              className={ui.input}
              onChange={(event) =>
                setStore(
                  patchSprintPrefs(
                    { dailyTargetMinutes: Number(event.target.value) || 90 },
                    userId
                  )
                )
              }
            />
          </label>
          <fieldset>
            <legend className={ui.label}>Study rhythm</legend>
            <p className="mt-1 text-xs text-muted">
              Optional preferences inspired by learning-profile pacing. They do not measure ability.
            </p>
            <div className="mt-2 space-y-2">
              {(Object.keys(RHYTHM_COPY) as SprintRhythm[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`sprint-rhythm-${id}`}
                  className={choiceClass(store.rhythm === id)}
                  onClick={() => {
                    const body = readSavedBodyType(
                      userId === "local-anonymous" ? null : userId
                    );
                    const suggested = suggestSprintDefaults(body?.primaryDosha ?? null);
                    if (id !== "custom" && suggested.rhythm === id) {
                      setStore(
                        patchSprintPrefs(
                          {
                            rhythm: id,
                            preferredDuration: suggested.duration,
                            preferredBreakMinutes: suggested.breakMinutes,
                          },
                          userId
                        )
                      );
                      return;
                    }
                    setStore(patchSprintPrefs({ rhythm: id }, userId));
                  }}
                >
                  <span>
                    <strong className="block text-heading">{RHYTHM_COPY[id].label}</strong>
                    <span className="text-xs text-muted">{RHYTHM_COPY[id].hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
          <button type="button" data-testid="sprint-start" className={ui.primary} onClick={create}>
            Start StudySprint
          </button>
        </section>
      )}

      {noteStatus ? (
        <p data-testid="sprint-note-status" className={ui.notice}>
          {noteStatus}
        </p>
      ) : null}

      <section data-testid="sprint-history">
        <h2 className={`${ui.heading} text-lg`}>Today&apos;s sessions</h2>
        <ul className="mt-3 space-y-2">
          {store.sessions
            .filter((session) => session.date === today)
            .map((session) => (
              <li key={session.id} className={`${ui.card} text-sm`}>
                <p className="font-medium text-heading">{session.goal}</p>
                <p className="text-xs text-muted">
                  {statusLabel(session.status)} · {session.durationMinutes} min
                  {session.quizLinked ? " · quiz done" : ""}
                  {session.notesLinked ? " · notes saved" : ""}
                </p>
              </li>
            ))}
        </ul>
      </section>

      {sessionNotes.length > 0 ? (
        <section data-testid="sprint-saved-notes">
          <h2 className={`${ui.heading} text-lg`}>Saved from this study</h2>
          <ul className="mt-3 space-y-2">
            {sessionNotes.slice(0, 6).map((note) => (
              <li key={note.id} className={`${ui.card} text-sm`}>
                <p className="font-medium text-heading">{note.title}</p>
                <p className="text-xs text-muted">{note.source}</p>
                <p className="mt-1 text-sm text-ink">{note.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
