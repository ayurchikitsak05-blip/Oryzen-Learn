"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppChrome from "@/components/layout/AppChrome";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { UniverseStudio } from "@/components/universe/UniverseStudio";
import { ui } from "@/components/ui/classes";

export default function UniversePage() {
  return (
    <Suspense fallback={null}>
      <UniversePageBody />
    </Suspense>
  );
}

function UniversePageBody() {
  const userId = useSignedInScope();
  const fromOnboarding = useSearchParams().get("from") === "onboarding";
  return (
    <AppChrome subtitle="My Study Universe">
      <main className={ui.mainNarrow}>
        <UniverseStudio userId={userId} fromOnboarding={fromOnboarding} />
      </main>
    </AppChrome>
  );
}
