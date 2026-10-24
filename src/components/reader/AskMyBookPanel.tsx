"use client";

import React from "react";
import type { AskBookThreadTurn } from "@/lib/ai/ask-my-book";
import { StudyMarkdown } from "@/components/reader/StudyMarkdown";

export function AskMyBookPanel({
  passageExcerpt,
  draft,
  turns,
  loading,
  error,
  emptyHint,
  disabled,
  onDraftChange,
  onAsk,
  onRetry,
}: {
  passageExcerpt: string;
  draft: string;
  turns: readonly AskBookThreadTurn[];
  loading: boolean;
  error: string | null;
  emptyHint: string | null;
  disabled?: boolean;
  onDraftChange: (value: string) => void;
  onAsk: () => void;
  onRetry: () => void;
}) {
  const canAsk = !loading && !disabled;
  return (
    <div data-testid="ask-my-book-panel" className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3">
      <p className="text-xs leading-relaxed text-muted">
        Ask about this passage only. Answers stay inside the open document.
      </p>
      {passageExcerpt ? (
        <blockquote
          data-testid="ask-my-book-passage"
          className="rounded-2xl bg-beige-2 px-3 py-2 text-xs leading-relaxed text-ink"
        >
          {passageExcerpt}
        </blockquote>
      ) : (
        <p data-testid="ask-my-book-no-passage" className="text-sm text-danger">
          Select a passage, or open a page with text, before asking.
        </p>
      )}

      <ol data-testid="ask-my-book-thread" className="space-y-3">
        {turns.map((turn, index) => (
          <li
            key={`${index}-${turn.question}`}
            data-testid={`ask-my-book-turn-${index}`}
            className="space-y-2 rounded-2xl border border-line px-3 py-3"
          >
            <p className="text-xs font-medium text-muted">You asked</p>
            <p className="text-sm text-heading">{turn.question}</p>
            {turn.sufficientSource ? (
              <div
                className="text-sm leading-relaxed text-ink [&_p]:whitespace-pre-wrap [&_p]:break-words"
                data-testid={`ask-my-book-answer-${index}`}
              >
                <StudyMarkdown markdown={turn.answer} />
              </div>
            ) : (
              <p
                role="status"
                data-testid={`ask-my-book-insufficient-${index}`}
                className="whitespace-pre-wrap break-words rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger"
              >
                {turn.answer}
              </p>
            )}
            {turn.citations.length > 0 ? (
              <p className="text-xs text-muted" data-testid={`ask-my-book-citations-${index}`}>
                {turn.citations
                  .map((item) => item.label || `p. ${item.page_number} · ${item.section_heading}`)
                  .join(" · ")}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      {loading ? (
        <div
          data-testid="ask-my-book-loading"
          role="status"
          aria-label="Looking in this passage..."
          className="animate-pulse space-y-3 rounded-2xl bg-beige-2 p-4"
        >
          <div className="h-4 w-2/3 rounded-full bg-beige" />
          <div className="h-3 w-full rounded-full bg-beige" />
        </div>
      ) : null}

      {error && !loading ? (
        <div
          data-testid="ask-my-book-error"
          role="alert"
          className="rounded-2xl border border-line bg-danger-bg p-4 text-sm text-danger"
        >
          <p>{error}</p>
          <button type="button" onClick={onRetry} className="btn-primary mt-3 text-xs">
            Try again
          </button>
        </div>
      ) : null}

      </div>
      <form
        data-testid="ask-my-book-form"
        className="shrink-0 space-y-2 border-t border-line bg-surface pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canAsk) onAsk();
        }}
      >
        <label htmlFor="ask-my-book-input" className="text-xs font-medium text-muted">
          {turns.length > 0 ? "Ask a follow-up" : "Your question"}
        </label>
        <textarea
          id="ask-my-book-input"
          data-testid="ask-my-book-input"
          value={draft}
          disabled={loading || disabled}
          rows={3}
          placeholder={
            turns.length > 0
              ? "Ask a follow-up about the same lines"
              : "What does this page claim?"
          }
          onChange={(event) => onDraftChange(event.target.value)}
          className="field-input min-h-[4.5rem] w-full resize-y text-sm"
        />
        {emptyHint ? (
          <p data-testid="ask-my-book-empty" className="text-xs text-danger">
            {emptyHint}
          </p>
        ) : null}
        <button
          type="submit"
          data-testid="ask-my-book-submit"
          disabled={!canAsk}
          className="btn-primary text-xs"
        >
          {turns.length > 0 ? "Ask follow-up" : "Ask this passage"}
        </button>
      </form>
    </div>
  );
}
