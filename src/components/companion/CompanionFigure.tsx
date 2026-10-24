"use client";

import React from "react";
import type { CompanionCharacter } from "@/lib/companion";

export function CompanionFigure({
  character,
  className = "",
}: {
  character: CompanionCharacter;
  className?: string;
}) {
  return (
    <div
      data-testid={`companion-figure-${character}`}
      aria-hidden
      className={`oryzen-companion-figure relative h-20 w-20 ${className}`}
    >
      <svg viewBox="0 0 80 80" className="h-full w-full">
        {character === "leaf" ? (
          <g className="oryzen-companion-float">
            <ellipse cx="40" cy="42" rx="16" ry="24" fill="var(--beige-primary)" stroke="var(--heading)" strokeWidth="1.4" />
            <path d="M40 20v40" stroke="var(--heading)" strokeWidth="1.2" />
          </g>
        ) : null}
        {character === "lamp" ? (
          <g className="oryzen-companion-glow">
            <rect x="36" y="48" width="8" height="16" fill="var(--heading)" rx="1" />
            <path d="M24 48h32l-6-16H30z" fill="var(--beige-primary)" stroke="var(--heading)" strokeWidth="1.4" />
            <circle cx="40" cy="28" r="6" fill="var(--selected)" />
          </g>
        ) : null}
        {character === "stone" ? (
          <g className="oryzen-companion-pulse">
            <ellipse cx="40" cy="46" rx="22" ry="14" fill="var(--beige-2, #efe6d6)" stroke="var(--heading)" strokeWidth="1.4" />
            <ellipse cx="40" cy="42" rx="16" ry="9" fill="var(--beige-primary)" />
          </g>
        ) : null}
        {character === "kite" ? (
          <g className="oryzen-companion-sway">
            <path d="M40 16l16 20-16 20L24 36z" fill="var(--beige-primary)" stroke="var(--heading)" strokeWidth="1.4" />
            <path d="M40 56c0 8 8 12 8 18" fill="none" stroke="var(--heading)" strokeWidth="1.2" />
          </g>
        ) : null}
      </svg>
    </div>
  );
}
