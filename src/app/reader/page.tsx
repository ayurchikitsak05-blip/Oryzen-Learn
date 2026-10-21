"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PdfViewer from "@/components/reader/PdfViewer";
import StudySidePanel from "@/components/study/StudySidePanel";
import StudioFrame from "@/components/studio/StudioFrame";
import {
  calculatePrakritiProfile,
  type Dosha,
} from "@/lib/prakriti/config";
import { LOCAL_PRAKRITI_STORAGE_KEY } from "@/lib/supabase/profile-sync";
import type { StoredPrakritiProfilePayload } from "@/lib/supabase/types";

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
    <StudioFrame
      title="Your Reading Space"
      eyebrow="Read & Explore"
      activeDosha={activeDosha}
      onChangeDosha={setActiveDosha}
    >
      <div className="space-y-6">
        <PdfViewer
          theme={profile.activeConfiguration.theme}
          promptUpload={searchParams.get("upload") === "1"}
        />
        <div className="max-w-xl">
          <StudySidePanel dosha={activeDosha} />
        </div>
      </div>
    </StudioFrame>
  );
}
