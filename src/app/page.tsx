"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Moon, Sun } from "lucide-react";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";

export default function MinimalistStudyStudioDashboard() {
  const [isDarkAppearance, setIsDarkAppearance] = useState<boolean>(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkAppearance);
  }, [isDarkAppearance]);

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDarkAppearance ? "dark bg-zinc-950 text-zinc-100" : "bg-zinc-50 text-zinc-900"
      }`}
    >
      <header className="sticky top-0 z-30 px-4 pt-5 md:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-full border border-zinc-800 bg-zinc-900/80 px-5 py-2.5 shadow-xl shadow-black/20 backdrop-blur-xl">
          <OryzenLearnBrand subtitle="Adaptive Intelligence & Focus Reader" />
          <button
            type="button"
            aria-label="Toggle Dark or Light Mode"
            onClick={() => setIsDarkAppearance((prev) => !prev)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 p-2.5 text-zinc-200 transition-all hover:bg-zinc-800 active:scale-95"
          >
            {isDarkAppearance ? (
              <Sun className="h-4 w-4 text-zinc-200" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center md:px-8">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
          Oryzen Learn
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Read in a way that fits you
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-zinc-400">
          Start with a short body-type reading, or go straight to your study tools.
        </p>

        <div className="mt-10 flex w-full max-w-sm flex-col items-stretch gap-3">
          <Link
            href="/body-type"
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-base font-medium text-zinc-950 transition-all hover:bg-zinc-200 active:scale-95"
          >
            Find Your Body Type
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/hub"
            className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 px-6 py-3 text-base font-medium text-zinc-100 transition-all hover:bg-zinc-800 active:scale-95"
          >
            Skip &amp; Continue
          </Link>
        </div>
      </main>
    </div>
  );
}
