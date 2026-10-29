"use client";

import React from "react";
import type { CompanionCharacter } from "@/lib/companion";

const PORTRAITS: Record<CompanionCharacter, { src: string; name: string }> = {
  leaf: { src: "/companions/leaf.jpg", name: "Aarav" },
  stone: { src: "/companions/stone.jpg", name: "Meera" },
  lamp: { src: "/companions/lamp.jpg", name: "Kabir" },
  kite: { src: "/companions/kite.jpg", name: "Tara" },
};

export function CompanionFigure({
  character,
  className = "",
  still = false,
}: {
  character: CompanionCharacter;
  className?: string;
  still?: boolean;
}) {
  const portrait = PORTRAITS[character];
  const sized = /(?:^|\s)(?:h|w)-/.test(className);
  return (
    <div
      data-testid={`companion-figure-${character}`}
      data-still={still ? "true" : "false"}
      className={`oryzen-companion-figure relative overflow-hidden rounded-full bg-beige-2 ${sized ? "" : "h-20 w-20"} ${className}`}
    >
      <img
        src={portrait.src}
        alt=""
        className="h-full w-full object-cover"
      />
      <span className="sr-only">{portrait.name}</span>
    </div>
  );
}
