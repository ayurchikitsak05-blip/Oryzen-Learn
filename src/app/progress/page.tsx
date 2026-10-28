"use client";

import React from "react";
import AppChrome from "@/components/layout/AppChrome";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { StudyProgressPanel } from "@/components/progress/StudyProgressPanel";
import { ui } from "@/components/ui/classes";

export default function StudyProgressPage() {
  const userId = useSignedInScope();
  return (
    <AppChrome subtitle="Study Progress">
      <main className={ui.main}>
        <StudyProgressPanel userId={userId} />
      </main>
    </AppChrome>
  );
}
