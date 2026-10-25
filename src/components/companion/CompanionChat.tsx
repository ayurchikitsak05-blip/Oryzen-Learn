"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CompanionFigure } from "@/components/companion/CompanionFigure";
import { CompanionSetup } from "@/components/companion/CompanionSetup";
import { ui } from "@/components/ui/classes";
import {
  COMPANION_MOCK_NOTICE,
  DEFAULT_COMPANION_PREFS,
  appendCompanionTurn,
  companionReply,
  createCompanionMember,
  openingCompanionTurn,
  readCompanionStore,
  switchCompanion,
  writeCompanionPrefs,
  writeCompanionStore,
  type CompanionPrefs,
  type CompanionStore,
} from "@/lib/companion";
import { activeSession, quizHref, readSprintStore, saveSprintNote } from "@/lib/sprint";

const EMPTY_COMPANION_STORE: CompanionStore = {
  version: 1,
  prefs: { ...DEFAULT_COMPANION_PREFS },
  turns: [],
  collection: [],
  activeId: "",
};

export function CompanionChat({
  userId,
  fromOnboarding,
}: {
  userId: string;
  fromOnboarding?: boolean;
}) {
  const [store, setStore] = useState<CompanionStore>(EMPTY_COMPANION_STORE);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(true);
  const [adding, setAdding] = useState(false);
  const [noteStatus, setNoteStatus] = useState("");
  const unfinished = useMemo(
    () => activeSession(readSprintStore(userId).sessions),
    [userId, store.turns.length]
  );

  useEffect(() => {
    const next = readCompanionStore(userId);
    setStore(next);
    setEditing((wasEditing) =>
      wasEditing && !next.prefs.onboarded ? true : !next.prefs.onboarded
    );
  }, [userId]);

  const savePrefs = (prefs: CompanionPrefs) => {
    if (adding) {
      setStore(createCompanionMember(prefs, userId));
      setAdding(false);
      setEditing(false);
      return;
    }
    const previous = store.prefs;
    const voiceChanged =
      previous.onboarded &&
      (previous.style !== prefs.style || previous.name !== prefs.name);
    const next = writeCompanionPrefs(prefs, userId);
    const opened =
      voiceChanged || next.turns.length === 0
        ? writeCompanionStore(
            { ...next, turns: [openingCompanionTurn(prefs, unfinished)] },
            userId
          )
        : next;
    setStore(opened);
    setEditing(false);
  };

  const ask = () => {
    const question = draft.replace(/\s+/g, " ").trim();
    if (question.length < 2) return;
    appendCompanionTurn(
      {
        id: `student-${Date.now().toString(36)}`,
        role: "student",
        text: question,
        mocked: false,
        createdAt: new Date().toISOString(),
      },
      userId
    );
    const reply = companionReply({
      question,
      prefs: store.prefs,
      unfinished,
    });
    setStore(appendCompanionTurn(reply, userId));
    setDraft("");
  };

  if (editing) {
    return (
      <CompanionSetup
        initial={
          adding
            ? { ...DEFAULT_COMPANION_PREFS, name: "", onboarded: true }
            : store.prefs
        }
        fromOnboarding={fromOnboarding}
        onSave={savePrefs}
      />
    );
  }

  return (
    <div data-testid="companion-chat" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <CompanionFigure character={store.prefs.character} />
        <div>
          <p className={ui.eyebrow}>AI Study Companion</p>
          <h2 className={`${ui.heading} text-xl`}>{store.prefs.name}</h2>
          <p className="text-xs text-muted">{store.prefs.style} · text only</p>
        </div>
        <button
          type="button"
          data-testid="companion-edit"
          className={`${ui.ghost} ml-auto text-xs`}
          onClick={() => {
            setAdding(false);
            setEditing(true);
          }}
        >
          Change
        </button>
        <button
          type="button"
          data-testid="companion-add"
          className={`${ui.ghost} text-xs`}
          onClick={() => {
            setAdding(true);
            setEditing(true);
          }}
        >
          Add another
        </button>
      </div>
      {store.collection.length > 1 ? (
        <div data-testid="companion-collection" className="flex flex-wrap gap-2">
          {store.collection.map((member) => (
            <button
              key={member.id}
              type="button"
              data-testid={`companion-switch-${member.id}`}
              className={member.id === store.activeId ? ui.secondary : ui.ghost}
              onClick={() => setStore(switchCompanion(member.id, userId))}
            >
              {member.name}
            </button>
          ))}
        </div>
      ) : null}
      <p data-testid="companion-mock-notice" className={ui.notice}>
        {COMPANION_MOCK_NOTICE}
      </p>
      {noteStatus ? (
        <p data-testid="companion-note-status" className={ui.success}>
          {noteStatus}
        </p>
      ) : null}
      <ol data-testid="companion-thread" className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {store.turns.map((turn) => (
          <li
            key={turn.id}
            data-testid={`companion-turn-${turn.role}`}
            className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
              turn.role === "student" ? "bg-beige-2 text-heading" : "border border-line text-ink"
            }`}
          >
            {turn.text}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/sprint" className={ui.secondary} data-testid="companion-open-sprint">
          Open StudySprint
        </Link>
        {unfinished ? (
          <Link href={`/reader?sprint=${unfinished.id}`} className={ui.ghost}>
            Return to unfinished work
          </Link>
        ) : null}
        {unfinished ? (
          <Link href={quizHref(unfinished)} className={ui.ghost} data-testid="companion-open-quiz">
            Take quiz
          </Link>
        ) : null}
        <button
          type="button"
          data-testid="companion-save-note"
          className={ui.ghost}
          onClick={() => {
            const last = [...store.turns].reverse().find((turn) => turn.role === "companion");
            if (!last || !unfinished) {
              setNoteStatus("Start a StudySprint first, then save a reply with its book source.");
              return;
            }
            saveSprintNote(
              {
                session: unfinished,
                kind: "companion",
                title: `${store.prefs.name} on ${unfinished.goal}`,
                body: last.text,
                source: `${store.prefs.name} · ${unfinished.documentTitle || unfinished.subject || "StudySprint"}`,
              },
              userId
            );
            setNoteStatus("Saved that study draft to your notebook, with the sprint and book as the source.");
          }}
        >
          Save reply to notebook
        </button>
        {fromOnboarding ? (
          <Link href="/hub" data-testid="companion-continue-hub" className={ui.ghost}>
            Continue to Learning Space
          </Link>
        ) : null}
      </div>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
        <label htmlFor="companion-input" className={ui.label}>
          Ask {store.prefs.name}
        </label>
        <textarea
          id="companion-input"
          data-testid="companion-input"
          value={draft}
          rows={3}
          className={ui.textarea}
          placeholder="Ask for a plan, an explanation, a break, or a quiz."
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" data-testid="companion-ask" className={ui.primary}>
          Send
        </button>
      </form>
    </div>
  );
}
