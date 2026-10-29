"use client";

import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import { ui } from "@/components/ui/classes";
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
    <AppChrome
      subtitle={title}
      maxWidthClass="max-w-7xl"
      actions={
        <div className="flex items-center gap-2">
          <label className="shrink-0">
            <span className="sr-only">Your Learning Profile</span>
            <select
              aria-label="Your Learning Profile"
              value={activeDosha}
              onChange={(event) => onChangeDosha(event.target.value as Dosha)}
              className={`${ui.input} max-w-[10.5rem] cursor-pointer text-xs sm:max-w-none`}
            >
              {BODY_TYPE_OPTIONS.map((option) => (
                <option key={option.dosha} value={option.dosha}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
    >
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-5">
          <p className={ui.eyebrow}>{eyebrow}</p>
          <h1 className={`${ui.heading} mt-1 text-2xl md:text-3xl`}>{title}</h1>
        </div>
        {children}
      </main>
    </AppChrome>
  );
}
