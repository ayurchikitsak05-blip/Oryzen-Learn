"use client";

import React, { useEffect, useState } from "react";
import AppChrome from "@/components/layout/AppChrome";
import AccountMenu from "@/components/auth/AccountMenu";
import { TodayHome } from "@/components/hub/TodayHome";
import type { HomeContinuation } from "@/lib/hub/continuation";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { readHomeContinuation } from "@/lib/hub/continuation";
import { ensureAccountVault, isAccountVaultUnlocked } from "@/lib/privacy/account-vault";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { getLocalPdfDocument } from "@/lib/reader/storage";
import { readLastReaderDocumentId } from "@/lib/reader/fit";
import { todayKey } from "@/lib/sprint/plan";

const EMPTY_CONTINUATION: HomeContinuation = {
  bookTitle: null,
  sprintLabel: null,
  nextBlock: null,
  studiedMinutes: null,
  dailyGoal: null,
};

export default function StudyHubPage() {
  const [continuation, setContinuation] = useState<HomeContinuation>(EMPTY_CONTINUATION);
  const [record, setRecord] = useState<"loading" | "opening" | "locked" | "ready">("loading");
  const [vaultAttempt, setVaultAttempt] = useState(0);
  const coachScope = useSignedInScope();

  useEffect(() => {
    let cancelled = false;
    setRecord("loading");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const user = await fetchSignedInUser();
          const userId = user?.userId ?? null;
          if (cancelled) return;
          if (!userId) {
            const date = todayKey();
            const documentId = readLastReaderDocumentId(userId);
            const document = documentId ? await getLocalPdfDocument(documentId) : null;
            if (cancelled) return;
            setContinuation(readHomeContinuation(userId, date, document?.title ?? null));
            setRecord("ready");
            return;
          }
          const slow = window.setTimeout(() => {
            if (!cancelled) setRecord((current) => (current === "loading" ? "opening" : current));
          }, 4000);
          const opened = await ensureAccountVault().catch(() => false);
          window.clearTimeout(slow);
          if (cancelled) return;
          if (!opened || !isAccountVaultUnlocked()) {
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
          setContinuation(EMPTY_CONTINUATION);
          setRecord("locked");
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [coachScope, vaultAttempt]);

  return (
    <AppChrome subtitle="Today" actions={<AccountMenu />}>
      <main className="w-full px-4 py-6 md:px-8 md:py-10">
        <TodayHome
          continuation={continuation}
          record={record}
          onRetry={record === "locked" ? () => setVaultAttempt((current) => current + 1) : undefined}
        />
      </main>
    </AppChrome>
  );
}
