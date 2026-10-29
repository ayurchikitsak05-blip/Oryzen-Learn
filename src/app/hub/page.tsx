"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Compass } from "lucide-react";
import AppChrome from "@/components/layout/AppChrome";
import AccountMenu from "@/components/auth/AccountMenu";
import { HubExperienceSection } from "@/components/experience/LearningStudio";
import { StudyHome } from "@/components/hub/StudyHome";
import type { HomeContinuation } from "@/lib/hub/continuation";
import SchedulerDialog from "@/components/study/SchedulerDialog";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { modernProfileHeadline, readSavedBodyType, type SavedBodyType } from "@/lib/study/body-type";
import { readHomeContinuation } from "@/lib/hub/continuation";
import { ensureAccountVault, isAccountVaultUnlocked } from "@/lib/privacy/account-vault";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { getLocalPdfDocument } from "@/lib/reader/storage";
import { readLastReaderDocumentId } from "@/lib/reader/fit";
import { todayKey } from "@/lib/sprint/plan";
import { ui } from "@/components/ui/classes";

const EMPTY_CONTINUATION: HomeContinuation = {
  bookTitle: null,
  sprintLabel: null,
  nextBlock: null,
  studiedMinutes: null,
  dailyGoal: null,
};

export default function StudyHubPage() {
  const [saved, setSaved] = useState<SavedBodyType | null>(null);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [continuation, setContinuation] = useState<HomeContinuation>(EMPTY_CONTINUATION);
  const [record, setRecord] = useState<"loading" | "locked" | "ready">("loading");
  const coachScope = useSignedInScope();

  useEffect(() => {
    let cancelled = false;
    setRecord("loading");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const user = await fetchSignedInUser();
          const userId = user?.userId ?? null;
          if (userId) await ensureAccountVault();
          if (cancelled) return;
          setSaved(readSavedBodyType(userId));
          if (userId && !isAccountVaultUnlocked()) {
            setContinuation(EMPTY_CONTINUATION);
            setRecord("locked");
            return;
          }
          const date = todayKey();
          const documentId = readLastReaderDocumentId(userId);
          const document = documentId ? await getLocalPdfDocument(documentId) : null;
          if (cancelled) return;
          setContinuation(readHomeContinuation(userId, date, document?.title ?? null));
          setRecord("ready");
        } catch {
          if (cancelled) return;
          setSaved(null);
          setContinuation(EMPTY_CONTINUATION);
          setRecord("ready");
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [coachScope]);

  return (
    <AppChrome
      subtitle="My Learning Space"
      actions={
        <div className="flex max-w-full flex-wrap items-center justify-end gap-1">
          <AccountMenu />
          <button
            type="button"
            aria-label="Plan your study time"
            aria-expanded={schedulerOpen}
            onClick={() => setSchedulerOpen((open) => !open)}
            className={`${ui.secondary} inline-flex whitespace-nowrap`}
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Plan time
          </button>
        </div>
      }
    >
      <main className={ui.main}>
        <HubExperienceSection
          studiedMinutes={continuation.studiedMinutes}
          dailyGoal={continuation.dailyGoal}
          nextBlock={continuation.nextBlock}
        />
        <div className="mt-4">
          <StudyHome continuation={continuation} userId={coachScope} record={record} />
        </div>

        {saved ? (
          <section
            data-testid="hub-constitution"
            className={`${ui.card} flex flex-col gap-4 md:flex-row md:items-center md:justify-between`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className={ui.chip}>
                <Compass className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-ui text-lg text-heading">Your Learning Insights</h2>
                <p className="mt-1 text-sm font-medium text-heading">
                  {modernProfileHeadline(saved.displayProfileTitle)}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {saved.cognitiveSummary} These are optional strategies to try—not a measure of ability.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Link href="/personalize" className={`${ui.secondary} shrink-0`}>
                Personalize
              </Link>
              <Link href="/body-type" className={`${ui.secondary} shrink-0`}>
                Explore My Learning Profile
              </Link>
            </div>
          </section>
        ) : (
          <section
            data-testid="hub-general"
            className={`${ui.card} flex flex-col gap-4 md:flex-row md:items-center md:justify-between`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className={ui.chip}>
                <Compass className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-ui text-lg text-heading">Make learning more personal</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Optional preferences for theme, session length, and explanation style. Not a measure of ability.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Link href="/personalize" className={`${ui.secondary} shrink-0`}>
                Personalize your space
              </Link>
            </div>
          </section>
        )}
      </main>
      <SchedulerDialog open={schedulerOpen} onClose={() => setSchedulerOpen(false)} />
    </AppChrome>
  );
}
