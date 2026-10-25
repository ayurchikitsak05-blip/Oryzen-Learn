"use client";

import React, { useEffect, useRef, useState } from "react";
import { Highlighter } from "lucide-react";
import type { AiGatewayExecutionResult } from "@/lib/ai/gateway";
import {
  LENS_FEEDBACK_ACTIONS,
  mapFeedbackToMemoryEvent,
  recordLensFeedback,
  type LensFeedbackKind,
} from "@/lib/ai/lens-feedback";
import type { HighlightLensType } from "@/lib/prakriti/config";
import type { AskBookThreadTurn } from "@/lib/ai/ask-my-book";
import { AskMyBookPanel } from "@/components/reader/AskMyBookPanel";
import { StudyLensOutput } from "@/components/reader/StudyLensOutput";
import { ReadingSizeControl } from "@/components/reading/ReadingSizeControl";

export type ReaderStudyLens = HighlightLensType | "ask_my_book";

export function StudyWorkspace({
  open,
  isMobile,
  title,
  pageRef,
  loading,
  error,
  notebookStatus,
  result,
  lens,
  selectedMcqOptions,
  selectedText,
  askDraft = "",
  askTurns = [],
  askEmptyHint = null,
  onAskDraftChange,
  onAsk,
  onPickMcq,
  onRetry,
  onClose,
}: {
  open: boolean;
  isMobile: boolean;
  title: string;
  pageRef: string | null;
  loading: boolean;
  error: string | null;
  notebookStatus: string | null;
  result: AiGatewayExecutionResult | null;
  lens: ReaderStudyLens | null;
  selectedMcqOptions: Record<number, number>;
  selectedText?: string;
  askDraft?: string;
  askTurns?: readonly AskBookThreadTurn[];
  askEmptyHint?: string | null;
  onAskDraftChange?: (value: string) => void;
  onAsk?: () => void;
  onPickMcq: (questionIndex: number, optionIndex: number) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const [width, setWidth] = useState(340);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const body = (
    <div
      data-testid="study-result-workspace"
      className="flex h-full min-h-0 flex-col bg-surface"
    >
      <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted">Study response</p>
          <h3 className="mt-0.5 flex items-center gap-2 font-display text-base text-heading">
            <Highlighter className="h-4 w-4 shrink-0" />
            <span className="truncate">{lens === "ask_my_book" ? "Ask My Book" : title}</span>
          </h3>
          {pageRef ? <p className="mt-1 text-xs text-muted">{pageRef}</p> : null}
          <ReadingSizeControl className="mt-2" />
        </div>
        <button
          type="button"
          data-testid="back-to-reading"
          onClick={onClose}
          className="btn-secondary relative z-20 shrink-0 text-xs"
        >
          Back to Reading
        </button>
      </div>

      <div className={`min-h-0 flex-1 px-4 py-4 ${lens === "ask_my_book" ? "flex flex-col overflow-hidden" : "space-y-4 overflow-y-auto"}`}>
        {lens === "ask_my_book" ? (
          <AskMyBookPanel
            passageExcerpt={selectedText ? selectedText.slice(0, 240) : ""}
            draft={askDraft}
            turns={askTurns}
            loading={loading}
            error={error}
            emptyHint={askEmptyHint}
            disabled={!selectedText?.trim()}
            onDraftChange={onAskDraftChange ?? (() => undefined)}
            onAsk={onAsk ?? (() => undefined)}
            onRetry={onRetry}
          />
        ) : null}

        {lens !== "ask_my_book" && loading ? (
          <div
            data-testid="ai-lens-loading-skeleton"
            role="status"
            aria-label="Exploring this passage..."
            className="animate-pulse space-y-3 rounded-2xl bg-beige-2 p-4"
          >
            <div className="h-4 w-2/3 rounded-full bg-beige" />
            <div className="h-3 w-full rounded-full bg-beige" />
            <div className="h-3 w-5/6 rounded-full bg-beige" />
          </div>
        ) : null}

        {lens !== "ask_my_book" && error && !loading ? (
          <div
            data-testid="ai-lens-error"
            role="alert"
            className="rounded-2xl border border-line bg-danger-bg p-4 text-sm text-danger"
          >
            <p>{error}</p>
            <button type="button" onClick={onRetry} className="btn-primary mt-3 text-xs">
              Try again
            </button>
          </div>
        ) : null}

        {notebookStatus && !error ? (
          <p role="status" className="text-sm text-heading">
            {notebookStatus}
          </p>
        ) : null}

        {lens !== "ask_my_book" && result && !loading ? (
          <div data-testid="ai-lens-response-card" className="space-y-4">
            {result.usedDeterministicFallback ? (
              <p
                data-testid="ai-fallback-banner"
                className="text-xs font-medium text-muted"
              >
                {result.fallbackReason === "wallet_exhausted" || result.budgetBlocked
                  ? "This month's study AI budget is used up. Showing a source-grounded draft so you can keep reading and taking notes."
                  : result.fallbackReason === "missing_gemini_key" ||
                      result.fallbackReason === "missing_api_key"
                    ? "No AI provider is configured. Showing a source-grounded study draft."
                    : result.providerErrorClass === "billing" ||
                        result.geminiErrorClass === "billing"
                      ? "The study model cannot be billed. Showing a source-grounded study draft."
                      : result.providerErrorClass === "quota" ||
                          result.geminiErrorClass === "quota"
                        ? "The study model quota was reached. Showing a source-grounded study draft."
                        : result.fallbackReason === "model_error"
                          ? "The study model did not respond. Showing a source-grounded study draft."
                          : "Model output could not be used. Showing a source-grounded study draft."}
              </p>
            ) : result.usedProviderFallback ? (
              <p
                data-testid="ai-fallback-banner"
                className="text-xs font-medium text-muted"
              >
                Preferred provider was unavailable. Showing a result from the next cheapest configured model.
              </p>
            ) : null}
            <StudyLensOutput
              result={result}
              lens={lens}
              selectedMcqOptions={selectedMcqOptions}
              selectedText={selectedText}
              onPickMcq={onPickMcq}
              onRetry={onRetry}
            />
            {lens && lens !== "save_passage" ? (
              <StudyFeedbackChips
                lens={lens}
                prakritiDosha={result.payload.prakriti_dosha}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
        {body}
      </div>
    );
  }

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l border-line"
      style={{ width }}
    >
      <button
        type="button"
        aria-label="Resize study workspace"
        className="absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize"
        onMouseDown={(event) => {
          dragRef.current = { startX: event.clientX, startWidth: width };
          const onMove = (move: MouseEvent) => {
            if (!dragRef.current) return;
            const next = dragRef.current.startWidth - (move.clientX - dragRef.current.startX);
            setWidth(Math.min(560, Math.max(280, next)));
          };
          const onUp = () => {
            dragRef.current = null;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      />
      {body}
    </aside>
  );
}

function StudyFeedbackChips({
  lens,
  prakritiDosha,
}: {
  lens: HighlightLensType;
  prakritiDosha: string;
}) {
  const [picked, setPicked] = useState<LensFeedbackKind | null>(null);

  const send = (kind: LensFeedbackKind) => {
    recordLensFeedback(lens, kind);
    setPicked(kind);
    const eventType = mapFeedbackToMemoryEvent(kind);
    if (!eventType) return;
    fetch("/api/ai/memory", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        prakritiDosha,
        contextLabel: `reader:${lens}:${kind}`,
      }),
    }).catch(() => undefined);
  };

  return (
    <div data-testid="lens-feedback" className="space-y-2 border-t border-line pt-3">
      <p className="text-xs font-medium text-muted">Was this useful?</p>
      <div className="flex flex-wrap gap-1">
        {LENS_FEEDBACK_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            data-testid={`feedback-${action.id}`}
            onClick={() => send(action.id)}
            className={`inline-flex min-h-10 items-center rounded-xl px-3 text-xs ${
              picked === action.id
                ? "bg-selected text-heading"
                : "text-ink hover:bg-beige-2"
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
