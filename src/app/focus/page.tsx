"use client";

import React, { useEffect, useState } from "react";
import AppChrome from "@/components/layout/AppChrome";
import { StudySchedulerCard } from "@/components/study/StudySidePanel";
import { readSavedBodyType, type SavedBodyType } from "@/lib/study/body-type";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { ui } from "@/components/ui/classes";

/**
 * Focus timer: study and break blocks with End session and Extend (owner, 18 Nov 2026: brought
 * back after the redesign hid it). Study Sprint stays for goal-based sprints.
 */
export default function FocusPage() {
  const userId = useSignedInScope();
  const [saved, setSaved] = useState<SavedBodyType | null>(null);

  useEffect(() => {
    setSaved(readSavedBodyType(userId === "local-anonymous" ? null : userId));
  }, [userId]);

  return (
    <AppChrome subtitle="Focus timer">
      <main className={ui.mainNarrow} data-testid="focus-page">
        <div className="space-y-1 pb-3">
          <p className="text-xs font-medium text-muted">Focus timer</p>
          <h1 className="font-display text-2xl text-heading">Study, then rest</h1>
          <p className="text-sm text-muted">
            Set your study and break lengths. End the session any time and the minutes you studied are saved.
          </p>
        </div>
        <StudySchedulerCard dosha={saved?.primaryDosha ?? null} saved={saved} />
      </main>
    </AppChrome>
  );
}
