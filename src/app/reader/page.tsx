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
import { readLocalPrakritiProfile } from "@/lib/supabase/profile-sync";
import { fetchSignedInUser } from "@/lib/supabase/session";

const BODY_TYPE_OPTIONS: readonly { dosha: Dosha; label: string }[] = [
  { dosha: "Vata", label: "Spark & Sprint (Vata)" },
  { dosha: "Pitta", label: "Laser & Logic (Pitta)" },
  { dosha: "Kapha", label: "Anchor & Endurance (Kapha)" },
];

function doshaFromProfile(userId?: string | null): Dosha {
  const parsed = readLocalPrakritiProfile(userId);
  const resolved =
    parsed?.calculated?.secondaryDosha ?? parsed?.calculated?.primaryDosha;
  if (resolved === "Vata" || resolved === "Pitta" || resolved === "Kapha") {
    return resolved;
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
    let active = true;
    void fetchSignedInUser()
      .then((user) => {
        if (!active) return;
        setActiveDosha(doshaFromProfile(user?.userId ?? null));
      })
      .catch(() => {
        if (active) setActiveDosha(doshaFromProfile(null));
      });
    return () => {
      active = false;
    };
  }, []);

  const [showExplainTip, setShowExplainTip] = useState(searchParams.get("tip") === "explain");
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
      <div className="flex h-full max-h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        {showExplainTip ? (
          <div
            role="note"
            data-testid="reader-explain-tip"
            className="mx-4 mt-3 flex shrink-0 items-start gap-3 rounded-2xl border border-line bg-beige-2 px-4 py-3 text-sm leading-relaxed text-ink"
          >
            <p className="min-w-0 flex-1">
              <span className="font-semibold text-heading">Your first win:</span> open your book, press and hold any
              line, then tap <span className="font-semibold">Explain</span>. Answers always come from your book.
            </p>
            <button
              type="button"
              onClick={() => {
                setShowExplainTip(false);
                try {
                  const url = new URL(window.location.href);
                  url.searchParams.delete("tip");
                  window.history.replaceState(window.history.state, "", url.toString());
                } catch {
                  /* the tip simply shows again after a refresh */
                }
              }}
              className="shrink-0 font-medium text-accent underline-offset-4 hover:underline"
            >
              Got it
            </button>
          </div>
        ) : null}
        <PdfViewer
          theme={profile.activeConfiguration.theme}
          promptUpload={searchParams.get("upload") === "1"}
          initialLens={searchParams.get("lens")}
          sprintId={searchParams.get("sprint")}
        />
      </div>
    </AppChrome>
  );
}
