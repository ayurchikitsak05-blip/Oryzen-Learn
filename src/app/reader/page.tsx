"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppChrome from "@/components/layout/AppChrome";
import { ui } from "@/components/ui/classes";
import PdfViewer from "@/components/reader/PdfViewer";
import {
  calculatePrakritiProfile,
  type Dosha,
} from "@/lib/prakriti/config";
import { LOCAL_PRAKRITI_STORAGE_KEY } from "@/lib/supabase/profile-sync";
import type { StoredPrakritiProfilePayload } from "@/lib/supabase/types";

const BODY_TYPE_OPTIONS: readonly { dosha: Dosha; label: string }[] = [
  { dosha: "Vata", label: "Spark & Sprint (Vata)" },
  { dosha: "Pitta", label: "Laser & Logic (Pitta)" },
  { dosha: "Kapha", label: "Anchor & Endurance (Kapha)" },
];

function getInitialDoshaTheme(): Dosha {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(LOCAL_PRAKRITI_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredPrakritiProfilePayload & {
          userId?: string;
        };
        if (!parsed.userId) return "Vata";
        const resolved =
          parsed.calculated?.secondaryDosha ?? parsed.calculated?.primaryDosha;
        if (
          resolved === "Vata" ||
          resolved === "Pitta" ||
          resolved === "Kapha"
        ) {
          return resolved;
        }
      }
    } catch {
      // Ignore corrupt local storage
    }
  }
  return "Vata";
}

function scoresFor(dosha: Dosha) {
  if (dosha === "Pitta") return { Vata: 15, Pitta: 70, Kapha: 15 };
  if (dosha === "Kapha") return { Vata: 10, Pitta: 20, Kapha: 70 };
  return { Vata: 70, Pitta: 20, Kapha: 10 };
}

export default function ReaderStudioPage() {
  return (
    <Suspense fallback={null}>
      <ReaderStudio />
    </Suspense>
  );
}

function ReaderStudio() {
  const searchParams = useSearchParams();
  const [activeDosha, setActiveDosha] = useState<Dosha>("Vata");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setActiveDosha(getInitialDoshaTheme());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const scores = scoresFor(activeDosha);
  const profile = calculatePrakritiProfile(scores, scores);

  return (
    <AppChrome
      subtitle="Read"
      maxWidthClass="max-w-none"
      actions={
        <label className="shrink-0">
          <span className="sr-only">Your Learning Profile</span>
          <select
            aria-label="Your Learning Profile"
            value={activeDosha}
            onChange={(event) => setActiveDosha(event.target.value as Dosha)}
            className={`${ui.input} max-w-[10.5rem] cursor-pointer text-xs sm:max-w-none`}
          >
            {BODY_TYPE_OPTIONS.map((option) => (
              <option key={option.dosha} value={option.dosha}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
        <PdfViewer
          theme={profile.activeConfiguration.theme}
          promptUpload={searchParams.get("upload") === "1"}
        />
      </div>
    </AppChrome>
  );
}
