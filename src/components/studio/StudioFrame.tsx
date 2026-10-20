"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";
import type { Dosha } from "@/lib/prakriti/config";

const BODY_TYPE_OPTIONS: readonly { dosha: Dosha; label: string }[] = [
  { dosha: "Vata", label: "Spark & Sprint (Vata)" },
  { dosha: "Pitta", label: "Laser & Logic (Pitta)" },
  { dosha: "Kapha", label: "Anchor & Endurance (Kapha)" },
];

export interface StudioFrameProps {
  title: string;
  eyebrow: string;
  activeDosha: Dosha;
  onChangeDosha: (dosha: Dosha) => void;
  children: React.ReactNode;
}

export default function StudioFrame({
  title,
  eyebrow,
  activeDosha,
  onChangeDosha,
  children,
}: StudioFrameProps) {
  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2C221E]">
      <header className="sticky top-0 z-30 px-4 pt-4 md:px-8">
        <div className="mx-auto max-w-7xl rounded-3xl border border-amber-200/50 bg-[#FDFBF7]/90 px-4 py-3 shadow-lg shadow-amber-900/10 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/hub"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-[#645147] transition-all hover:text-[#C2410C] active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="whitespace-nowrap">Study hub</span>
            </Link>

            <OryzenLearnBrand />

            <label className="shrink-0">
              <span className="sr-only">Body Type Profile</span>
              <select
                aria-label="Body Type Profile"
                value={activeDosha}
                onChange={(event) => onChangeDosha(event.target.value as Dosha)}
                className="min-h-[44px] max-w-[10.5rem] cursor-pointer rounded-full border border-amber-200/50 bg-[#FAF7F0] px-3 text-xs font-medium text-[#2C221E] sm:max-w-none sm:px-4"
              >
                {BODY_TYPE_OPTIONS.map((option) => (
                  <option key={option.dosha} value={option.dosha}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="px-1 pb-1 pt-2 text-center">
            <p className="text-[11px] font-medium tracking-wide text-[#645147]">
              {eyebrow}
            </p>
            <h1 className="text-lg font-semibold tracking-tight text-[#2C221E]">
              {title}
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
        {children}
      </main>
    </div>
  );
}
