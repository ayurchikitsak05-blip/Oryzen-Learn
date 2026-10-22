"use client";

import React from "react";
import { ui } from "@/components/ui/classes";
import { ACTION_LABELS, COACH_VOICE_META, type CoachMessage } from "@/lib/coach/types";

export default function CoachCard({
  message,
  onAction,
  onHelpful,
  onTryAnother,
  confirmSimplify,
  onConfirmSimplify,
  onCancelSimplify,
  restNoted,
  compact,
}: {
  message: CoachMessage;
  onAction: () => void;
  onHelpful: () => void;
  onTryAnother: () => void;
  confirmSimplify?: boolean;
  onConfirmSimplify?: () => void;
  onCancelSimplify?: () => void;
  restNoted?: boolean;
  compact?: boolean;
}) {
  const meta = COACH_VOICE_META[message.style];
  return (
    <section
      data-testid="coach-card"
      data-message-id={message.id}
      data-coach-style={message.style}
      data-coach-trigger={message.trigger}
      data-coach-action={message.recommendedAction}
      className={`${ui.card} ${compact ? "p-4" : ""}`}
    >
      <p className={ui.eyebrow}>Study Coach · {meta.label}</p>
      <p className={`${ui.heading} mt-2 text-base leading-relaxed`}>{message.text}</p>
      {restNoted ? (
        <p className="mt-3 text-sm text-muted" data-testid="coach-break-ack">
          Rest noted. Encouragement will wait until you are ready.
        </p>
      ) : confirmSimplify ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted">
            Keep one or two priority sessions today and move the extras later. Sleep stays protected.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="coach-simplify-confirm"
              className={ui.primary}
              onClick={onConfirmSimplify}
            >
              Yes, simplify today
            </button>
            <button type="button" className={ui.ghost} onClick={onCancelSimplify}>
              Keep today as it is
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" data-testid="coach-cta" className={ui.primary} onClick={onAction}>
            {ACTION_LABELS[message.recommendedAction]}
          </button>
          <button type="button" data-testid="coach-helpful" className={ui.secondary} onClick={onHelpful}>
            Helpful
          </button>
          <button type="button" data-testid="coach-try-another" className={ui.ghost} onClick={onTryAnother}>
            Try another
          </button>
        </div>
      )}
    </section>
  );
}
