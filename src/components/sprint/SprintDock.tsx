"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSignedInScope } from "@/components/coach/CoachHost";
import {
  activeSession,
  formatSprintClock,
  markNotesLinked,
  markQuizLinked,
  pauseSprint,
  quizHref,
  readSprintStore,
  resumeSprint,
  tickSprint,
  upsertSprintSession,
  type SprintSession,
} from "@/lib/sprint";

export function SprintDock({
  quizCompleted,
  notesSaved,
}: {
  quizCompleted?: boolean;
  notesSaved?: boolean;
}) {
  const userId = useSignedInScope();
  const searchParams = useSearchParams();
  const sprintId = searchParams.get("sprint");
  const [session, setSession] = useState<SprintSession | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const store = readSprintStore(userId);
    const fromUrl = store.sessions.find((item) => item.id === sprintId) ?? null;
    setSession(fromUrl ?? activeSession(store.sessions));
  }, [userId, sprintId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session) return;
    const next = tickSprint(session, now);
    if (next !== session && (next.status !== session.status || next.elapsedMs !== session.elapsedMs)) {
      setSession(upsertSprintSession(next, userId).sessions.find((item) => item.id === next.id) ?? next);
    }
  }, [now, session, userId]);

  useEffect(() => {
    if (!session) return;
    if (quizCompleted && !session.quizLinked) {
      setSession(upsertSprintSession(markQuizLinked(session), userId).sessions.find((item) => item.id === session.id) ?? session);
    }
    if (notesSaved && !session.notesLinked) {
      setSession(upsertSprintSession(markNotesLinked(session), userId).sessions.find((item) => item.id === session.id) ?? session);
    }
  }, [notesSaved, quizCompleted, session, userId]);

  if (!session || session.status === "completed") return null;

  return (
    <div
      data-testid="sprint-dock"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2 text-xs"
    >
      <span className="font-medium text-heading">StudySprint</span>
      <span data-testid="sprint-dock-clock" className="text-heading">
        {session.status === "break" ? "Break" : formatSprintClock(session, now)}
      </span>
      <span className="truncate text-muted">{session.goal}</span>
      {session.status === "running" ? (
        <button
          type="button"
          data-testid="sprint-dock-pause"
          className="btn-ghost px-2 text-[11px]"
          onClick={() => setSession(upsertSprintSession(pauseSprint(session, Date.now()), userId).sessions.find((item) => item.id === session.id) ?? session)}
        >
          Pause
        </button>
      ) : (
        <button
          type="button"
          data-testid="sprint-dock-resume"
          className="btn-ghost px-2 text-[11px]"
          onClick={() => setSession(upsertSprintSession(resumeSprint(session, Date.now()), userId).sessions.find((item) => item.id === session.id) ?? session)}
        >
          Resume
        </button>
      )}
      <Link href={quizHref(session)} className="btn-ghost px-2 text-[11px]" data-testid="sprint-dock-quiz">
        Quiz
      </Link>
      <Link href="/companion" className="btn-ghost px-2 text-[11px]">
        Companion
      </Link>
      <Link href="/sprint" className="btn-ghost px-2 text-[11px]">
        Sprint
      </Link>
    </div>
  );
}
