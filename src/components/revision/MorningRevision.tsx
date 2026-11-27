"use client";

import { FormattedNoteView } from "@/components/notes/NoteFormats";
import { cornellCardId, cornellCards, noteFormatOf, noteTextForReading } from "@/lib/notes/formats";
import { VoiceNotePlayer } from "@/components/voice/VoiceNotes";
import { listVoiceNotes } from "@/lib/voice-notes/store";
import { ListenButton } from "@/components/speech/ListenButton";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { cardView, matchRound, type MatchRound } from "@/lib/revision/card-kinds";
import type { Rating } from "@/lib/revision/fsrs";
import { ChoiceFace, ClozeFace, ForecastStrip, MatchGame, RatingButtons } from "@/components/revision/CardFaces";
import { ui } from "@/components/ui/classes";
import { AnkiImport } from "@/components/import/AnkiImport";
import { ensureAccountVault } from "@/lib/privacy/account-vault";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { localIsoDate } from "@/lib/roadmap/time";
import {
  googleCalendarReminderUrl,
  markRevisionDone,
  revisionDoneToday,
  dueForecast,
  pickTodayCards,
  previewDays,
  rateCard,
  weakCards,
  practiceCards,
  PRACTICE_ROUND_SIZE,
  readRevisionState,
  shuffleCards,
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
    <section id="reminder" className="space-y-3 rounded-2xl border border-line bg-surface p-4" data-testid="revision-reminder">
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
  // "today": the daily round (answers move cards along). "practice": free flipping, any time,
  // which never changes when cards come back.
  const [mode, setMode] = useState<"today" | "practice">("today");
  const [round, setRound] = useState<RevisionNote[]>([]);
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  // Fill-the-gap / multiple choice: the answer is out, with the rating it suggests.
  const [suggested, setSuggested] = useState<Rating | null>(null);
  const [match, setMatch] = useState<MatchRound | null>(null);

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
      const cards = pickTodayCards(notes, saved, today);
      const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const linkedSubject = params?.get("subject")?.trim().toLowerCase() ?? "";
      if (params?.get("weak") === "1") {
        const weakRound = shuffleCards(
          weakCards(notes, saved).filter((note) => !linkedSubject || note.subject.toLowerCase() === linkedSubject)
        ).slice(0, PRACTICE_ROUND_SIZE);
        if (weakRound.length > 0) {
          setMode("practice");
          setRound(weakRound);
          setLoad({
            kind: "ready",
            userId: user.userId,
            cards,
            notes,
            hasNotes: true,
            doneToday: false,
            locked: !opened,
          });
          return;
        }
      }
      setRound(cards);
      setLoad({
        kind: "ready",
        userId: user.userId,
        cards,
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

  const goTo = (next: number) => {
    setShown(false);
    setSuggested(null);
    setIndex(Math.max(0, Math.min(next, round.length)));
  };

  const rate = (rating: Rating) => {
    if (load.kind !== "ready") return;
    const card = round[index];
    if (!card) return;
    const yes = rating > 1;
    if (mode === "today" && answered[card.id] === undefined) {
      const next = rateCard(state, card.id, rating, localIsoDate());
      setState(next);
      writeRevisionState(next, load.userId);
    }
    if (answered[card.id] === undefined && yes) setRemembered((count) => count + 1);
    if (answered[card.id] === true && !yes) setRemembered((count) => Math.max(0, count - 1));
    if (answered[card.id] === false && yes) setRemembered((count) => count + 1);
    setAnswered((current) => ({ ...current, [card.id]: yes }));
    if (mode === "today" && index + 1 >= round.length) markRevisionDone(load.userId, localIsoDate());
    goTo(index + 1);
  };
  const grade = (yes: boolean) => rate(yes ? 3 : 1);

  const startWeak = () => {
    if (load.kind !== "ready") return;
    const cards = shuffleCards(weakCards(load.notes, state)).slice(0, PRACTICE_ROUND_SIZE);
    setMode("practice");
    setRound(cards);
    setAnswered({});
    setRemembered(0);
    setLoad({ ...load, doneToday: false });
    setIndex(0);
    setShown(false);
  };

  const startMatch = (subject?: string | null) => {
    if (load.kind !== "ready") return;
    const pool = load.notes.filter((note) => !subject || note.subject === subject);
    setMatch(matchRound(pool, `${Date.now()}`));
  };

  const startPractice = (subject?: string | null) => {
    if (load.kind !== "ready") return;
    const cards = shuffleCards(practiceCards(load.notes, state, { subject }));
    setMode("practice");
    setRound(cards);
    setAnswered({});
    setRemembered(0);
    setLoad({ ...load, doneToday: false });
    goTo(0);
    setIndex(0);
  };

  const shuffleRest = () => {
    // Shuffles the cards not reached yet; the ones already seen stay where they are.
    setRound((current) => [...current.slice(0, index), ...shuffleCards(current.slice(index))]);
    setShown(false);
  };

  const card = round[index];
  const today = localIsoDate();
  // Practice keeps plain flip cards; the daily round mixes in fill-the-gap and multiple choice.
  const view = card && load.kind === "ready" && mode === "today" ? cardView(card, load.notes, today) : { kind: "flip" as const };
  const days = card && mode === "today" ? previewDays(state, card.id, today) : null;
  const forecast = load.kind === "ready" ? dueForecast(load.notes, state, today) : [];
  const weak = load.kind === "ready" ? weakCards(load.notes, state) : [];
  const subjects =
    load.kind === "ready"
      ? Array.from(new Set(load.notes.filter((note) => note.subject && note.title.trim()).map((note) => note.subject))).slice(0, 8)
      : [];

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10" data-testid="morning-revision">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Revise</p>
        <h1 className="font-display mt-1 text-3xl text-heading">{mode === "practice" ? "Practice" : "Morning revision"}</h1>
        <p className="mt-2 text-sm text-muted">
          {mode === "practice"
            ? "Flip through as many cards as you like. Practice doesn't change when cards come back."
            : "Quick cards from your own notes, about 3 minutes. Uses no AI help."}
        </p>
      </header>

      {load.kind === "ready" && load.hasNotes && mode === "today" ? <ForecastStrip counts={forecast} /> : null}
      {match ? <MatchGame round={match} onClose={() => setMatch(null)} /> : null}

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

      {load.kind === "ready" && mode === "today" && load.doneToday && index === 0 ? (
        <section className={ui.empty} data-testid="revision-done-today">
          You&apos;ve done today&apos;s revision. New cards come tomorrow.
          {load.cards.length > 0 ? (
            <button type="button" className={`${ui.ghost} mt-2`} onClick={() => setLoad({ ...load, doneToday: false })}>
              Revise today&apos;s cards again
            </button>
          ) : null}
        </section>
      ) : null}

      {load.kind === "ready" && mode === "today" && !load.doneToday && load.cards.length === 0 ? (
        <section className={ui.empty} data-testid="revision-empty">
          {load.hasNotes
            ? "Nothing is due today. Cards you remembered come back in a few days. You can still practise below."
            : "Nothing to revise yet. Save notes from your books or lectures (\"Save to My Notes\") and they become revision cards here."}
        </section>
      ) : null}

      {load.kind === "ready" && card && !(mode === "today" && load.doneToday) ? (
        <section className={`${ui.cardPad} space-y-4`} data-testid="revision-card">
          <div className="flex items-center justify-between gap-2">
            <p className={ui.eyebrow}>
              Card {index + 1} of {round.length}
              {card.subject ? ` · ${card.subject}` : ""}
            </p>
            {round.length - index > 1 ? (
              <button type="button" className="text-xs font-medium text-accent underline-offset-4 hover:underline" onClick={shuffleRest} data-testid="revision-shuffle">
                Shuffle
              </button>
            ) : null}
          </div>
          {view.kind === "flip" ? <h2 className={`${ui.heading} text-xl`}>{card.title}</h2> : null}
          {view.kind === "choice" ? <h2 className={`${ui.heading} text-xl`}>{view.question}</h2> : null}
          {view.kind === "cloze" ? <p className={ui.eyebrow}>Fill the gap</p> : null}
          {view.kind === "flip" ? (
            <>
              <ListenButton
                key={`${index}-${shown}`}
                text={shown && !card.audioId ? noteTextForReading(card.title, card.body) : card.title}
              />
              <p className="text-sm text-muted">Say the answer in your head first.</p>
            </>
          ) : null}
          {view.kind === "cloze" ? (
            <ClozeFace
              key={`cloze-${card.id}-${index}`}
              card={view}
              onRevealed={(correct) => {
                setShown(true);
                setSuggested(correct === null ? null : correct ? 3 : 1);
              }}
            />
          ) : null}
          {view.kind === "choice" ? (
            <ChoiceFace
              key={`choice-${card.id}-${index}`}
              card={view}
              onAnswered={(correct) => {
                setShown(true);
                setSuggested(correct ? 3 : 1);
              }}
            />
          ) : null}
          {shown ? (
            <>
              {view.kind !== "flip" ? null : card.audioId ? (
                <VoiceNotePlayer id={card.audioId} userId={load.userId} />
              ) : (
                <div className="rounded-xl bg-beige-2 p-3 text-sm leading-relaxed text-ink" data-testid="revision-answer">
                  {noteFormatOf(card.body) === "plain" ? (
                    <p className="whitespace-pre-line">{card.body}</p>
                  ) : (
                    <FormattedNoteView title={card.title} body={card.body} />
                  )}
                </div>
              )}
              {view.kind !== "flip" ? (
                <details className="rounded-xl bg-beige-2 p-3 text-sm text-ink">
                  <summary className="cursor-pointer text-muted">Your full note: {card.title}</summary>
                  <p className="mt-2 whitespace-pre-line">{card.body}</p>
                </details>
              ) : null}
              {mode === "today" ? (
                <RatingButtons days={days} suggested={suggested} onRate={rate} />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={`${ui.primary} min-h-12`} onClick={() => grade(true)} data-testid="revision-yes">
                    I remembered
                  </button>
                  <button type="button" className={`${ui.secondary} min-h-12`} onClick={() => grade(false)} data-testid="revision-no">
                    Not yet
                  </button>
                </div>
              )}
            </>
          ) : view.kind === "flip" ? (
            <button type="button" className={`${ui.primary} min-h-12 w-full`} onClick={() => setShown(true)} data-testid="revision-show">
              Show answer
            </button>
          ) : null}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              className={`${ui.ghost} min-h-11`}
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
              data-testid="revision-previous"
            >
              ← Previous
            </button>
            <button type="button" className={`${ui.ghost} min-h-11`} onClick={() => goTo(index + 1)} data-testid="revision-next">
              {mode === "today" ? "Skip for now →" : "Next →"}
            </button>
          </div>
        </section>
      ) : null}

      {load.kind === "ready" && round.length > 0 && index >= round.length ? (
        <section className={`${ui.cardPad} space-y-3`} data-testid="revision-done">
          <h2 className={`${ui.heading} text-2xl`}>{mode === "practice" ? "Round done" : "Done for today"}</h2>
          <p className="text-sm text-ink">
            You remembered {remembered} of {Object.keys(answered).length || round.length}.
            {mode === "today" ? " Cards you didn't remember come back tomorrow." : ""}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className={`${ui.secondary} min-h-12`} onClick={() => goTo(0)} data-testid="revision-again">
              Go through these again
            </button>
            <Link href="/hub" className={`${ui.primary} min-h-12`}>
              Back to Today
            </Link>
          </div>
        </section>
      ) : null}

      {load.kind === "ready" && load.hasNotes ? (
        <section className="space-y-2 rounded-2xl border border-line bg-surface p-4" data-testid="revision-practice">
          <h2 className="font-semibold text-heading">Practise any time</h2>
          <p className="text-sm text-muted">
            No daily limit. Up to {PRACTICE_ROUND_SIZE} cards a round, weakest first, shuffled. Your daily schedule stays as it is.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${ui.secondary} min-h-11`} onClick={() => startPractice(null)} data-testid="revision-practice-all">
              Practise all subjects
            </button>
            {weak.length > 0 ? (
              <button type="button" className={`${ui.secondary} min-h-11`} onClick={() => startWeak()} data-testid="revision-practice-weak">
                Weak cards ({weak.length})
              </button>
            ) : null}
            <button type="button" className={`${ui.secondary} min-h-11`} onClick={() => startMatch(null)} data-testid="revision-match-start">
              Matching game
            </button>
            {subjects.length > 1
              ? subjects.map((subject) => (
                  <button key={subject} type="button" className={`${ui.ghost} min-h-11`} onClick={() => startPractice(subject)}>
                    {subject}
                  </button>
                ))
              : null}
          </div>
        </section>
      ) : null}

      {load.kind === "ready" && load.hasNotes && !load.locked ? <RevisionProgress notes={load.notes} state={state} /> : null}

      {load.kind === "ready" ? <AnkiImport onImported={() => window.setTimeout(() => window.location.reload(), 1500)} /> : null}

      <ReminderSetup />
    </main>
  );
}
