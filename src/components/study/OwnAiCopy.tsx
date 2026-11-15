"use client";

import React, { useState } from "react";
import { Copy } from "lucide-react";
import { ui } from "@/components/ui/classes";
import type { RoadmapRecord } from "@/lib/roadmap/types";
import { OWN_AI_APPS, OWN_AI_GOALS, ownAiPrompt, type OwnAiGoal } from "@/lib/study/own-ai-prompt";

/** "Ask your own AI": copy progress as a question for ChatGPT or Gemini. Free; nothing is sent by ORYZEN. */
export default function OwnAiCopy({ record, today }: { record: RoadmapRecord; today: string }) {
  const [goal, setGoal] = useState<OwnAiGoal>("plan");
  const [message, setMessage] = useState("");
  const [shownText, setShownText] = useState<string | null>(null);

  const copy = async () => {
    const text = ownAiPrompt(record, today, goal);
    try {
      await navigator.clipboard.writeText(text);
      setShownText(null);
      setMessage("Copied. Open ChatGPT or Gemini and paste it in.");
    } catch {
      // Clipboard not allowed (some browsers): show the text to copy by hand.
      setShownText(text);
      setMessage("Copy the text below, then paste it into ChatGPT or Gemini.");
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border border-line px-4 py-3" data-testid="own-ai">
      <p className="text-sm font-semibold text-heading">Ask your own AI (free)</p>
      <p className="text-xs text-muted">
        Copies your chapter ratings and exam date as a question to paste into ChatGPT or Gemini. No name or email is
        included, and it doesn&apos;t use your AI helps.
      </p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What to ask">
        {OWN_AI_GOALS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={goal === option.id}
            onClick={() => setGoal(option.id)}
            className={`min-h-[36px] rounded-full border px-3 text-xs font-medium ${goal === option.id ? ui.selected : ui.idle}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`${ui.secondary} min-h-11`} onClick={() => void copy()} data-testid="own-ai-copy">
          <Copy className="h-4 w-4" aria-hidden="true" /> Copy question
        </button>
        {OWN_AI_APPS.map((app) => (
          <a
            key={app.name}
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-accent underline-offset-4 hover:underline"
          >
            Open {app.name}
          </a>
        ))}
      </div>
      {message ? (
        <p className="text-xs text-success" role="status">
          {message}
        </p>
      ) : null}
      {shownText ? (
        <textarea
          readOnly
          value={shownText}
          rows={6}
          className={`${ui.input} text-xs`}
          aria-label="Question to copy"
          onFocus={(event) => event.currentTarget.select()}
        />
      ) : null}
    </div>
  );
}
