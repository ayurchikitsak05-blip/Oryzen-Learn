"use client";

import React from "react";
import type { CompanionCharacter } from "@/lib/companion";

export function CompanionFigure({
  character,
  className = "",
  still = false,
}: {
  character: CompanionCharacter;
  className?: string;
  still?: boolean;
}) {
  const motion = still ? "" : "oryzen-companion-float";
  return (
    <div
      data-testid={`companion-figure-${character}`}
      aria-hidden
      className={`oryzen-companion-figure relative h-20 w-20 ${className}`}
    >
      <svg viewBox="0 0 80 80" className="h-full w-full">
        {character === "leaf" ? (
          <g className={motion}>
            <ellipse cx="40" cy="62" rx="18" ry="5" fill="var(--beige-2, #efe6d6)" />
            <path d="M40 58c0-16 10-28 10-38 0 12 8 20 8 32 0 8-8 12-18 12s-18-4-18-12c0-12 8-20 8-32 0 10 10 22 10 38z" fill="var(--beige-primary)" stroke="var(--heading)" strokeWidth="1.4" />
            <path d="M40 24v32" stroke="var(--heading)" strokeWidth="1.1" />
            <path d="M40 34c6 2 8 6 8 6M40 42c-6 2-8 6-8 6" fill="none" stroke="var(--heading)" strokeWidth="1" />
          </g>
        ) : null}
        {character === "lamp" ? (
          <g className={still ? "" : "oryzen-companion-glow"}>
            <ellipse cx="40" cy="30" rx="16" ry="8" fill="var(--selected)" opacity="0.85" />
            <path d="M26 36h28l-4 14H30z" fill="var(--beige-primary)" stroke="var(--heading)" strokeWidth="1.4" />
            <rect x="37" y="50" width="6" height="10" rx="1" fill="var(--heading)" />
            <path d="M28 62h24" stroke="var(--heading)" strokeWidth="2" strokeLinecap="round" />
            <path d="M40 22v6M24 26l4 4M56 26l-4 4" stroke="var(--accent, #C86428)" strokeWidth="1.4" strokeLinecap="round" />
          </g>
        ) : null}
        {character === "stone" ? (
          <g className={still ? "" : "oryzen-companion-pulse"}>
            <ellipse cx="40" cy="64" rx="20" ry="4" fill="var(--beige-2, #efe6d6)" />
            <path d="M18 48c2-14 10-22 22-22s20 8 22 22c1 8-8 14-22 14S17 56 18 48z" fill="var(--beige-primary)" stroke="var(--heading)" strokeWidth="1.4" />
            <path d="M28 44c6-6 16-6 24 0" fill="none" stroke="var(--heading)" strokeWidth="1" opacity="0.7" />
            <circle cx="34" cy="40" r="1.4" fill="var(--heading)" />
          </g>
        ) : null}
        {character === "kite" ? (
          <g className={still ? "" : "oryzen-companion-sway"}>
            <path d="M40 14l18 22-18 26L22 36z" fill="var(--beige-primary)" stroke="var(--heading)" strokeWidth="1.4" />
            <path d="M40 16v44M24 36h32" stroke="var(--heading)" strokeWidth="1" />
            <path d="M40 60c6 6 4 12 10 16" fill="none" stroke="var(--accent, #C86428)" strokeWidth="1.3" />
            <path d="M48 72l4 4-6 1z" fill="var(--selected)" />
          </g>
        ) : null}
      </svg>
    </div>
  );
}
