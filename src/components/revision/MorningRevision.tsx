"use client";

import { FormattedNoteView } from "@/components/notes/NoteFormats";
import { cornellCardId, cornellCards, noteFormatOf, noteTextForReading } from "@/lib/notes/formats";
import { VoiceNotePlayer } from "@/components/voice/VoiceNotes";
import { listVoiceNotes } from "@/lib/voice-notes/store";
import { ListenButton } from "@/components/speech/ListenButton";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { ui } from "@/components/ui/classes";
import { ensureAccountVault } from "@/lib/privacy/account-vault";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { localIsoDate } from "@/lib/roadmap/time";
import {
  googleCalendarReminderUrl,
  markRevisionDone,
  revisionDoneToday,
  gradeCard,
  pickTodayCards,
  readRevisionState,
  strengthsAndWeakSpots,
  subjectProgress,
  type SubjectProgress,
  readRevisionTime,
  revisionReminderIcs,
  writeRevisionState,
  writeRevisionTime,
  type RevisionNote,
  type RevisionState,
} from "@/lib/revision/cards";

type Load =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "error"; text: string }
  | {
      kind: "ready";
      cards: RevisionNote[];
      notes: RevisionNote[];
      userId: string;
      hasNotes: boolean;
      doneToday: boolean;
      locked: boolean;
    };

interface ApiNotes {
  subjects?: Array<{ id: string; title: string }>;
  notes?: Array<{ id: string; subject_id: string; title: string; body: string | null; updated_at: string }>;
  error?: string;
}

export function toRevisionNotes(data: ApiNotes): RevisionNote[] {
  const subjects = new Map((data.subjects ?? []).map((subject) => [subject.id, subject.title]));
  return (data.notes ?? []).flatMap((note) => {
    const base = {
      subject: subjects.get(note.subject_id) ?? "",
      updatedAt: note.updated_at ?? "",
    };
    // A Cornell note gives one card per question: question on the front, answer on the back.
    if (noteFormatOf(note.body) === "cornell") {
      const pairs = cornellCards(note.body ?? "");
      // Questions not answered yet: the whole note is one card until they are.
      if (pairs.length > 0) {
        return pairs.map((pair, index) => ({
          ...base,
          id: cornellCardId(note.id, index),
          title: `${note.title ?? ""}: ${pair.q}`.replace(/^: /, ""),
          body: pair.a,
        }));
      }
    }
    return [{ ...base, id: note.id, title: note.title ?? "", body: note.body ?? "" }];
  });
}

function ReminderSetup() {
  const [time, setTime] = useState("07:00");
  const [message, setMessage] = useState("");
  useEffect(() => setTime(readRevisionTime()), []);

  const download = () => {
    writeRevisionTime(time);
    const ics = revisionReminderIcs({
      time,
      startDay: localIsoDate(),
      url: `${window.location.origin}/revise`,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "oryzen-morning-revision.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Open the downloaded file and tap Add to Calendar. On Android, use the Google Calendar button instead.");
  };
  const google = () => {
    writeRevisionTime(time);
    window.open(
      googleCalendarReminderUrl({ time, startDay: localIsoDate(), url: `${window.location.origin}/revise` }),
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4" data-testid="revision-reminder">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-beige-2">
          <BellRing className="h-5 w-5 text-accent" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold text-heading">Daily reminder</h2>
          <p className="text-sm text-muted">Your phone&apos;s calendar reminds you, even when the app is closed.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className={ui.label}>Time</span>
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className={ui.input}
            data-testid="revision-time"
          />
        </label>
        <button type="button" onClick={download} className={`${ui.secondary} min-h-11`} data-testid="revision-add-calendar">
          iPhone / other calendar
        </button>
        <button type="button" onClick={google} className={`${ui.secondary} min-h-11`} data-testid="revision-add-google">
          Google Calendar (Android)
        </button>
      </div>
      {message ? <p className="text-sm text-success">{message}</p> : null}
    </section>
  );
}

const STAGE_COLS: Array<[keyof SubjectProgress, string]> = [
  ["memorised", "Memorised"],
  ["learning", "Learning"],
  ["notYet", "Not yet"],
  ["fresh", "New"],
];

/** Memorisation tracker and strengths / weak spots, from the student's own answers. */
function RevisionProgress({ notes, state }: { notes: RevisionNote[]; state: RevisionState }) {
  const rows = subjectProgress(notes, state);
  const { strong, weak } = strengthsAndWeakSpots(rows);
  const memorised = rows.reduce((sum, row) => sum + row.memorised, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4" data-testid="revision-progress">
      <div>
        <h2 className="font-semibold text-heading">Memorised so far</h2>
        <p className="text-sm text-muted" data-testid="revision-memorised">
          {memorised} of {total} cards memorised (remembered three times in a row).
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 pr-2 font-medium">Subject</th>
              {STAGE_COLS.map(([, label]) => (
                <th key={label} className="px-2 py-1 text-right font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.subject} className="border-t border-line">
                <td className="py-1.5 pr-2 font-medium text-heading">{row.subject}</td>
                {STAGE_COLS.map(([key, label]) => (
                  <td key={label} className="px-2 py-1.5 text-right text-ink">{row[key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {strong.length || weak.length ? (
        <div className="grid gap-2 sm:grid-cols-2" data-testid="revision-strengths">
          <div className="rounded-xl bg-beige-2 p-3 text-sm">
            <p className="text-xs text-muted">Strong</p>
            <p className="font-semibold text-heading">{strong.join(", ") || "Keep revising to find out"}</p>
          </div>
          <div className="rounded-xl bg-beige-2 p-3 text-sm">
            <p className="text-xs text-muted">Needs more revision</p>
            <p className="font-semibold text-heading">{weak.join(", ") || "Nothing yet"}</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">Strengths and weak spots appear after you revise a few cards in each subject.</p>
      )}
    </section>
  );
}

/** Five quick cards from the student's own notes. No AI. */
export function MorningRevision() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [remembered, setRemembered] = useState(0);
  const [state, setState] = useState<RevisionState>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await fetchSignedInUser().catch(() => null);
      if (!user?.userId) {
        if (!cancelled) setLoad({ kind: "signed-out" });
        return;
      }
      const opened = await ensureAccountVault().catch(() => false);
      const response = await fetch("/api/notes", { credentials: "same-origin" }).catch(() => null);
      const data = (response ? await response.json().catch(() => ({})) : {}) as ApiNotes;
      if (cancelled) return;
      if (!response || !response.ok) {
        setLoad({ kind: "error", text: data.error ?? "Your notes couldn't be opened just now." });
        return;
      }
      const saved = readRevisionState(user.userId);
      setState(saved);
      const voice = await listVoiceNotes(user.userId);
      const notes = [
        ...toRevisionNotes(data),
        ...voice.map((note) => ({
          id: note.id,
          title: note.title,
          body: "Your voice note",
          subject: "Voice notes",
          updatedAt: note.createdAt,
          audioId: note.id,
        })),
      ];
      const today = localIsoDate();
      setLoad({
        kind: "ready",
        userId: user.userId,
        cards: pickTodayCards(notes, saved, today),
        notes,
        hasNotes: notes.some((note) => !note.audioId && note.title.trim() && note.body.trim()),
        doneToday: revisionDoneToday(user.userId, today),
        locked: !opened,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const grade = (yes: boolean) => {
    if (load.kind !== "ready") return;
    const card = load.cards[index];
    const next = gradeCard(state, card.id, yes, localIsoDate());
    setState(next);
    writeRevisionState(next, load.userId);
    if (yes) setRemembered((count) => count + 1);
    setShown(false);
    if (index + 1 >= load.cards.length) markRevisionDone(load.userId, localIsoDate());
    setIndex((value) => value + 1);
  };

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10" data-testid="morning-revision">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Revise</p>
        <h1 className="font-display mt-1 text-3xl text-heading">Morning revision</h1>
        <p className="mt-2 text-sm text-muted">Quick cards from your own notes, about 3 minutes. Uses no AI help.</p>
      </header>

      {load.kind === "loading" ? <p className={ui.loading}>Opening your notes…</p> : null}
      {load.kind === "signed-out" ? (
        <p className={ui.notice}>
          <Link href="/auth?form=1" className="font-medium text-accent underline">Sign in</Link> to revise your notes.
        </p>
      ) : null}
      {load.kind === "error" ? <p className={ui.alert}>{load.text}</p> : null}

      {load.kind === "ready" && load.locked ? (
        <p className={ui.notice}>Your private study record is locked on this device, so today&apos;s answers won&apos;t be remembered.</p>
      ) : null}

      {load.kind === "ready" && load.doneToday && index === 0 ? (
        <section className={ui.empty} data-testid="revision-done-today">
          You&apos;ve done today&apos;s revision. New cards come tomorrow.
          {load.cards.length > 0 ? (
            <button type="button" className={`${ui.ghost} mt-2`} onClick={() => setLoad({ ...load, doneToday: false })}>
              Revise a few more anyway
            </button>
          ) : null}
        </section>
      ) : null}

      {load.kind === "ready" && !load.doneToday && load.cards.length === 0 ? (
        <section className={ui.empty} data-testid="revision-empty">
          {load.hasNotes
            ? "Nothing is due today. Cards you remembered come back in a few days."
            : "Nothing to revise yet. Save notes from your books or lectures (\"Save to My Notes\") and they become revision cards here."}
        </section>
      ) : null}

      {load.kind === "ready" && !load.doneToday && load.cards.length > 0 && index < load.cards.length ? (
        <section className={`${ui.cardPad} space-y-4`} data-testid="revision-card">
          <p className={ui.eyebrow}>
            Card {index + 1} of {load.cards.length}
            {load.cards[index].subject ? ` · ${load.cards[index].subject}` : ""}
          </p>
          <h2 className={`${ui.heading} text-xl`}>{load.cards[index].title}</h2>
          <ListenButton
            key={`${index}-${shown}`}
            text={
              shown && !load.cards[index].audioId
                ? noteTextForReading(load.cards[index].title, load.cards[index].body)
                : load.cards[index].title
            }
          />
          <p className="text-sm text-muted">Say the answer in your head first.</p>
          {shown ? (
            <>
              {load.cards[index].audioId ? (
                <VoiceNotePlayer id={load.cards[index].audioId as string} userId={load.userId} />
              ) : (
                <div className="rounded-xl bg-beige-2 p-3 text-sm leading-relaxed text-ink" data-testid="revision-answer">
                  {noteFormatOf(load.cards[index].body) === "plain" ? (
                    <p className="whitespace-pre-line">{load.cards[index].body}</p>
                  ) : (
                    <FormattedNoteView title={load.cards[index].title} body={load.cards[index].body} />
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={`${ui.primary} min-h-12`} onClick={() => grade(true)} data-testid="revision-yes">
                  I remembered
                </button>
                <button type="button" className={`${ui.secondary} min-h-12`} onClick={() => grade(false)} data-testid="revision-no">
                  Not yet
                </button>
              </div>
            </>
          ) : (
            <button type="button" className={`${ui.primary} min-h-12 w-full`} onClick={() => setShown(true)} data-testid="revision-show">
              Show answer
            </button>
          )}
        </section>
      ) : null}

      {load.kind === "ready" && load.cards.length > 0 && index >= load.cards.length ? (
        <section className={`${ui.cardPad} space-y-3`} data-testid="revision-done">
          <h2 className={`${ui.heading} text-2xl`}>Done for today</h2>
          <p className="text-sm text-ink">
            You remembered {remembered} of {load.cards.length}. Cards you didn&apos;t remember come back tomorrow.
          </p>
          <Link href="/hub" className={`${ui.primary} min-h-12 w-full`}>
            Back to Today
          </Link>
        </section>
      ) : null}

      {load.kind === "ready" && load.hasNotes && !load.locked ? <RevisionProgress notes={load.notes} state={state} /> : null}

      <ReminderSetup />
    </main>
  );
}
