"use client";

import React, { useEffect, useRef, useState } from "react";
import { Highlighter, X } from "lucide-react";
import type { AiGatewayExecutionResult } from "@/lib/ai/gateway";
import {
  LENS_FEEDBACK_ACTIONS,
  mapFeedbackToMemoryEvent,
  recordLensFeedback,
  type LensFeedbackKind,
} from "@/lib/ai/lens-feedback";
import type { HighlightLensType } from "@/lib/prakriti/config";
import { StudyLensOutput } from "@/components/reader/StudyLensOutput";

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
  lens: HighlightLensType | null;
  selectedMcqOptions: Record<number, number>;
  selectedText?: string;
  onPickMcq: (questionIndex: number, optionIndex: number) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const [width, setWidth] = useState(420);
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
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">Study response</p>
          <h3 className="mt-1 flex items-center gap-2 font-display text-lg text-heading">
            <Highlighter className="h-4 w-4 shrink-0" />
            <span className="truncate">{title}</span>
          </h3>
          {pageRef ? <p className="mt-1 text-xs text-muted">{pageRef}</p> : null}
        </div>
        <button
          type="button"
          data-testid="back-to-reading"
          onClick={onClose}
          className="btn-secondary text-xs"
        >
          Back to Reading
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {loading ? (
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

        {error && !loading ? (
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

        {result && !loading ? (
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
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-beige-2"
          aria-label="Close study response"
        >
          <X className="h-4 w-4" />
        </button>
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
            setWidth(Math.min(640, Math.max(300, next)));
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
