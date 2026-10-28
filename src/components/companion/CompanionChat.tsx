"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CompanionFigure } from "@/components/companion/CompanionFigure";
import { CompanionSetup } from "@/components/companion/CompanionSetup";
import { ui } from "@/components/ui/classes";
import {
  COMPANION_MOCK_NOTICE,
  DEFAULT_COMPANION_PREFS,
  activateCompanionStyle,
  companionReply,
  createCompanionMember,
  forgetCompanionTurns,
  openingCompanionTurn,
  readCompanionStore,
  retainCompanionTurns,
  STYLE_COPY,
  switchCompanion,
  writeCompanionPrefs,
  writeCompanionStore,
  type CompanionPrefs,
  type CompanionStore,
  type CompanionStyle,
} from "@/lib/companion";
import { ensureAccountVault, privateAccessAllowed } from "@/lib/privacy/account-vault";
import { ANONYMOUS_READER_SCOPE, isAnonymousScope } from "@/lib/reader/local-scope";
import { activeSession, quizHref, readSprintStore, saveSprintNote } from "@/lib/sprint";

const EMPTY_COMPANION_STORE: CompanionStore = {
  version: 1,
  prefs: { ...DEFAULT_COMPANION_PREFS },
  turns: [],
  collection: [],
  activeId: "",
};

const USER_INPUT_TYPES = new Set([
  "insertText",
  "insertFromPaste",
  "insertFromDrop",
  "insertLineBreak",
  "insertCompositionText",
  "insertFromYank",
  "deleteContentBackward",
  "deleteContentForward",
  "deleteByCut",
  "deleteByDrag",
  "historyUndo",
  "historyRedo",
]);

let studentTurnSerial = 0;

function normalizeQuestion(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function CompanionChat({
  userId,
  fromOnboarding,
  initialStyle = null,
}: {
  userId: string;
  fromOnboarding?: boolean;
  initialStyle?: CompanionStyle | null;
}) {
  const [store, setStore] = useState<CompanionStore>(EMPTY_COMPANION_STORE);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(true);
  const [adding, setAdding] = useState(false);
  const [noteStatus, setNoteStatus] = useState("");
  const settledScopeRef = useRef(userId);
  const scopeRef = useRef(userId);
  const storeRef = useRef(store);
  const sessionTurnIds = useRef(new Set<string>());
  const submitGuard = useRef({ busy: false, needsEdit: false, lastQuestion: "" });
  scopeRef.current = userId;
  storeRef.current = store;
  const unfinished = useMemo(
    () => activeSession(readSprintStore(userId).sessions),
    [userId, store.turns.length]
  );

  useEffect(() => {
    const previousScope = settledScopeRef.current;
    const resolvingAccount = isAnonymousScope(previousScope) && !isAnonymousScope(userId);
    const switchingAccount = !isAnonymousScope(previousScope) && previousScope !== userId;
    if (switchingAccount) {
      sessionTurnIds.current.clear();
      submitGuard.current = { busy: false, needsEdit: false, lastQuestion: "" };
    }

    let next = initialStyle ? activateCompanionStyle(initialStyle, userId) : readCompanionStore(userId);
    if (resolvingAccount && sessionTurnIds.current.size > 0) {
      const carried = storeRef.current.turns.filter((turn) => sessionTurnIds.current.has(turn.id));
      if (privateAccessAllowed(userId)) {
        next = retainCompanionTurns(next, carried, userId);
        forgetCompanionTurns(sessionTurnIds.current, ANONYMOUS_READER_SCOPE);
        sessionTurnIds.current.clear();
      } else {
        const known = new Set(next.turns.map((turn) => turn.id));
        const missing = carried.filter((turn) => !known.has(turn.id));
        if (missing.length > 0) next = { ...next, turns: [...next.turns, ...missing] };
        const pendingScope = userId;
        void ensureAccountVault().then((opened) => {
          if (!opened || settledScopeRef.current !== pendingScope) return;
          if (!privateAccessAllowed(pendingScope) || sessionTurnIds.current.size === 0) return;
          setStore((current) => {
            if (settledScopeRef.current !== pendingScope || sessionTurnIds.current.size === 0) return current;
            const still = current.turns.filter((turn) => sessionTurnIds.current.has(turn.id));
            const base = initialStyle
              ? activateCompanionStyle(initialStyle, pendingScope)
              : readCompanionStore(pendingScope);
            const saved = retainCompanionTurns(base, still, pendingScope);
            forgetCompanionTurns(sessionTurnIds.current, ANONYMOUS_READER_SCOPE);
            sessionTurnIds.current.clear();
            return saved;
          });
        });
      }
    }

    settledScopeRef.current = userId;
    setStore(next);
    setEditing((wasEditing) =>
      wasEditing && !next.prefs.onboarded ? true : !next.prefs.onboarded
    );
  }, [userId, initialStyle]);

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
    const question = normalizeQuestion(draft);
    if (question.length < 2) return;
    if (submitGuard.current.busy || submitGuard.current.needsEdit) return;
    submitGuard.current.busy = true;
    submitGuard.current.needsEdit = true;
    submitGuard.current.lastQuestion = question;
    try {
      studentTurnSerial += 1;
      const student = {
        id: `student-${Date.now().toString(36)}-${studentTurnSerial.toString(36)}`,
        role: "student" as const,
        text: question,
        mocked: false,
        createdAt: new Date().toISOString(),
      };
      const reply = companionReply({
        question,
        prefs: store.prefs,
        unfinished,
      });
      if (isAnonymousScope(scopeRef.current)) {
        sessionTurnIds.current.add(student.id);
        sessionTurnIds.current.add(reply.id);
      }
      setStore((current) => {
        if (current.turns.some((turn) => turn.id === student.id)) return current;
        return writeCompanionStore(
          { ...current, turns: [...current.turns, student, reply] },
          scopeRef.current
        );
      });
      setDraft("");
    } catch (error) {
      submitGuard.current.needsEdit = false;
      submitGuard.current.lastQuestion = "";
      throw error;
    } finally {
      submitGuard.current.busy = false;
    }
  };

  const editDraft = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    const inputType = event.nativeEvent instanceof InputEvent ? event.nativeEvent.inputType : "";
    const restoredLastQuestion =
      submitGuard.current.needsEdit &&
      normalizeQuestion(next) === submitGuard.current.lastQuestion &&
      !USER_INPUT_TYPES.has(inputType);
    if (restoredLastQuestion) return;
    submitGuard.current.needsEdit = false;
    setDraft(next);
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
          <p className={ui.eyebrow}>Take My Study</p>
          <h2 className={`${ui.heading} text-xl`}>{store.prefs.name}</h2>
          <p className="text-xs text-muted">{STYLE_COPY[store.prefs.style].label} · text only</p>
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
            className={`font-reading rounded-2xl px-3 py-2 ${
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
          autoComplete="off"
          className={ui.textarea}
          placeholder="Ask for a plan, an explanation, a break, or a quiz."
          onChange={editDraft}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            ask();
          }}
        />
        <button
          type="submit"
          data-testid="companion-ask"
          className={ui.primary}
          disabled={normalizeQuestion(draft).length < 2}
        >
          Send
        </button>
      </form>
    </div>
  );
}
