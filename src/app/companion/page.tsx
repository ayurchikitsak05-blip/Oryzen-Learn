"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppChrome from "@/components/layout/AppChrome";
import { CompanionChat } from "@/components/companion/CompanionChat";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { ui } from "@/components/ui/classes";

export default function CompanionPage() {
  return (
    <Suspense fallback={null}>
      <CompanionPageBody />
    </Suspense>
  );
}

function CompanionPageBody() {
  const userId = useSignedInScope();
  const fromOnboarding = useSearchParams().get("from") === "onboarding";
  return (
    <AppChrome subtitle="Study Companion">
      <main className={ui.mainNarrow}>
        <CompanionChat userId={userId} fromOnboarding={fromOnboarding} />
      </main>
    </AppChrome>
  );
}
