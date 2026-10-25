"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  READING_SIZES,
  READING_SIZE_LABELS,
  applyReadingSize,
  readReadingSize,
  writeReadingSize,
  type ReadingSize,
} from "@/lib/reading/prefs";

export function ReadingSizeControl({ className = "" }: { className?: string }) {
  const [size, setSize] = useState<ReadingSize>("comfortable");
  const [ready, setReady] = useState(false);
  const picked = useRef(false);

  useEffect(() => {
    if (!picked.current) {
      const stored = readReadingSize();
      setSize(stored);
      applyReadingSize(stored);
    }
    setReady(true);
  }, []);

  return (
    <div
      className={`flex flex-wrap items-center gap-1 ${className}`}
      data-testid="reading-size-control"
      data-hydrated={ready ? "1" : "0"}
    >
      <span className="mr-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
        Reading size
      </span>
      {READING_SIZES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={size === option}
          data-testid={`reading-size-${option}`}
          onClick={() => {
            picked.current = true;
            setSize(writeReadingSize(option));
          }}
          className={`inline-flex min-h-11 items-center rounded-xl px-2.5 text-xs ${
            size === option ? "bg-selected text-heading" : "text-muted hover:bg-beige-2 hover:text-heading"
          }`}
        >
          {READING_SIZE_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
