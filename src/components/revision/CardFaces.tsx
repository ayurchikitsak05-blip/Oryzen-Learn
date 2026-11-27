"use client";

import React, { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { ui } from "@/components/ui/classes";
import { GAP, gapAnswerMatches, type ChoiceCard, type ClozeCard, type MatchRound } from "@/lib/revision/card-kinds";
import type { Rating } from "@/lib/revision/fsrs";

function dayLabel(days: number): string {
  if (days <= 1) return "tomorrow";
  if (days < 30) return `${days} days`;
  const months = Math.round(days / 30);
  return months <= 1 ? "1 month" : `${months} months`;
}

const RATING_TEXT: Record<Rating, string> = { 1: "Not yet", 2: "Hard", 3: "Got it", 4: "Easy" };

/** Again / Hard / Good / Easy, each showing when the card comes back. */
export function RatingButtons({
  days,
  suggested,
  onRate,
}: {
  days: Record<Rating, number> | null;
  suggested?: Rating | null;
  onRate: (rating: Rating) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="revision-ratings">
      {([1, 2, 3, 4] as Rating[]).map((rating) => (
        <button
          key={rating}
          type="button"
          onClick={() => onRate(rating)}
          data-testid={`revision-rate-${rating}`}
          className={`flex min-h-14 flex-col items-center justify-center rounded-xl border px-2 text-sm font-semibold ${
            suggested === rating
              ? "border-accent bg-heading text-canvas"
              : rating === 1
                ? "border-line bg-surface text-heading"
                : "border-line bg-surface text-heading hover:bg-beige-2"
          }`}
        >
          {RATING_TEXT[rating]}
          {days ? <span className="text-[11px] font-normal opacity-75">{dayLabel(days[rating])}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Fill-the-gap: type the missing word, or just reveal it. */
export function ClozeFace({ card, onRevealed }: { card: ClozeCard; onRevealed: (correct: boolean | null) => void }) {
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<boolean | null | undefined>(undefined);
  const [before, after] = card.text.split(GAP);
  const reveal = (value: boolean | null) => {
    setResult(value);
    onRevealed(value);
  };
  return (
    <div className="space-y-3" data-testid="revision-cloze">
      <p className="text-lg leading-relaxed text-heading">
        {before}
        <span className={`mx-1 inline-block min-w-16 rounded-md border-b-2 px-1 text-center font-semibold ${result === undefined ? "border-accent text-transparent" : result ? "border-success text-success" : "border-accent text-accent"}`}>
          {result === undefined ? "____" : card.answer}
        </span>
        {after}
      </p>
      {result === undefined ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            reveal(gapAnswerMatches(typed, card.answer));
          }}
        >
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Type the missing word"
            aria-label="Missing word"
            className="field-input min-h-11 flex-1"
            data-testid="revision-cloze-input"
          />
          <button type="submit" className={`${ui.primary} min-h-11`} disabled={!typed.trim()}>
            Check
          </button>
          <button type="button" className={`${ui.ghost} min-h-11`} onClick={() => reveal(null)} data-testid="revision-cloze-show">
            Show
          </button>
        </form>
      ) : result === null ? null : (
        <p className={`flex items-center gap-1.5 text-sm font-semibold ${result ? "text-success" : "text-accent"}`} role="status">
          {result ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
          {result ? "Right!" : `Not quite: “${typed.trim()}”`}
        </p>
      )}
    </div>
  );
}

/** Multiple choice: pick one; right or wrong shows at once. */
export function ChoiceFace({ card, onAnswered }: { card: ChoiceCard; onAnswered: (correct: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="space-y-2" data-testid="revision-choice" role="group" aria-label="Choose the answer">
      {card.options.map((option, index) => {
        const isRight = index === card.correct;
        const state = picked === null ? "idle" : isRight ? "right" : picked === index ? "wrong" : "dim";
        return (
          <button
            key={`${index}-${option}`}
            type="button"
            disabled={picked !== null}
            onClick={() => {
              setPicked(index);
              onAnswered(isRight);
            }}
            className={`flex w-full items-start gap-2 rounded-xl border px-3 py-3 text-left text-sm leading-snug ${
              state === "right"
                ? "border-success bg-[var(--success-bg)] font-semibold text-success"
                : state === "wrong"
                  ? "border-danger bg-danger-bg text-danger"
                  : state === "dim"
                    ? "border-line bg-surface text-muted"
                    : "border-line bg-surface text-ink hover:bg-beige-2"
            }`}
          >
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-bold">
              {state === "right" ? <Check className="h-3 w-3" aria-hidden="true" /> : state === "wrong" ? <X className="h-3 w-3" aria-hidden="true" /> : String.fromCharCode(65 + index)}
            </span>
            <span>{option}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Matching game: tap a term, then its answer. Doesn't change when cards come back. */
export function MatchGame({ round, onClose }: { round: MatchRound; onClose: () => void }) {
  const [left, setLeft] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const done = matched.size === round.pairs.length;
  const rights = useMemo(() => round.order, [round]);
  return (
    <section className={`${ui.cardPad} space-y-4`} data-testid="revision-match">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-heading">Match the pairs</h2>
        <button type="button" className="text-sm text-muted underline-offset-4 hover:underline" onClick={onClose}>
          Close
        </button>
      </div>
      {done ? (
        <p className="text-sm text-ink" role="status" data-testid="revision-match-done">
          All matched{mistakes === 0 ? " with no mistakes. Excellent!" : ` with ${mistakes} mistake${mistakes === 1 ? "" : "s"}.`}
        </p>
      ) : (
        <p className="text-sm text-muted">Tap a term on the left, then its answer on the right.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          {round.pairs.map((pair, index) => (
            <button
              key={pair.id}
              type="button"
              disabled={matched.has(index)}
              onClick={() => setLeft(index)}
              className={`min-h-14 w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold ${
                matched.has(index) ? "border-success bg-[var(--success-bg)] text-success" : left === index ? "border-accent bg-selected text-heading" : "border-line bg-surface text-heading"
              }`}
            >
              {pair.left}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {rights.map((pairIndex) => (
            <button
              key={round.pairs[pairIndex].id}
              type="button"
              disabled={matched.has(pairIndex) || left === null}
              onClick={() => {
                if (left === null) return;
                if (left === pairIndex) {
                  setMatched((current) => new Set(current).add(pairIndex));
                  setLeft(null);
                } else {
                  setMistakes((count) => count + 1);
                  setWrong(pairIndex);
                  window.setTimeout(() => setWrong(null), 500);
                }
              }}
              className={`min-h-14 w-full rounded-xl border px-3 py-2 text-left text-xs leading-snug ${
                matched.has(pairIndex)
                  ? "border-success bg-[var(--success-bg)] text-success"
                  : wrong === pairIndex
                    ? "border-danger bg-danger-bg text-danger"
                    : "border-line bg-surface text-ink"
              }`}
            >
              {round.pairs[pairIndex].right}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Cards coming back this week. */
export function ForecastStrip({ counts }: { counts: number[] }) {
  const week = counts.reduce((sum, value) => sum + value, 0);
  const labels = ["Today", "Tomorrow"];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted" data-testid="revision-forecast">
      <span>
        Due today: <span className="font-semibold text-heading">{counts[0] ?? 0}</span>
      </span>
      <span>
        {labels[1]}: <span className="font-semibold text-heading">{counts[1] ?? 0}</span>
      </span>
      <span>
        This week: <span className="font-semibold text-heading">{week}</span>
      </span>
    </div>
  );
}
