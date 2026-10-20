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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 px-4 pt-4 md:px-8">
        <div className="mx-auto max-w-7xl rounded-3xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 shadow-xl shadow-black/20 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/hub"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-zinc-400 transition-all hover:text-zinc-100 active:scale-95"
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
                className="min-h-[44px] max-w-[10.5rem] cursor-pointer rounded-full border border-zinc-700 bg-zinc-950 px-3 text-xs font-medium text-zinc-100 sm:max-w-none sm:px-4"
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
            <p className="text-[11px] font-medium tracking-wide text-zinc-400">
              {eyebrow}
            </p>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
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
