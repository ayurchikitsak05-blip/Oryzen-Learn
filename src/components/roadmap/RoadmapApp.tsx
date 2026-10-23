"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Map } from "lucide-react";
import AppChrome from "@/components/layout/AppChrome";
import StudyRhythmButton from "@/components/rhythm/StudyRhythmButton";
import { ui } from "@/components/ui/classes";
import { defaultIntake } from "@/lib/roadmap/defaults";
import { emptyStudyRhythmHook } from "@/lib/roadmap/hooks";
import {
  clearLocalRoadmap,
  createRoadmapRecord,
  downloadRoadmapCopy,
  fetchRemoteRoadmap,
  readLocalRoadmap,
  saveRemoteRoadmap,
  snapshotLocalRoadmap,
  writeLocalRoadmap,
  type RemoteFetchResult,
} from "@/lib/roadmap/persist";
import { decideHydrate } from "@/lib/roadmap/sync";
import { addDays, localIsoDate } from "@/lib/roadmap/time";
import type { RoadmapIntake, RoadmapRecord } from "@/lib/roadmap/types";
import { fetchSignedInUser } from "@/lib/supabase/session";
import RoadmapOnboarding from "./RoadmapOnboarding";
import {
  RoadmapConflictDialog,
  RoadmapImportDialog,
  RoadmapSyncNotice,
} from "./RoadmapSyncDialog";
import RoadmapStudio from "./RoadmapStudio";

type SyncPhase = "idle" | "pending-import" | "opted-out" | "conflict" | "synced";

export default function RoadmapApp() {
  const [userId, setUserId] = useState<string>("local-anonymous");
  const [today, setToday] = useState("2026-11-02");
  const [intake, setIntake] = useState<RoadmapIntake>(() => defaultIntake("2026-12-31"));
  const [record, setRecord] = useState<RoadmapRecord | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [persistMode, setPersistMode] = useState<"server" | "local">("local");
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [importLocal, setImportLocal] = useState<RoadmapRecord | null>(null);
  const [conflictLocal, setConflictLocal] = useState<RoadmapRecord | null>(null);
  const [conflictRemote, setConflictRemote] = useState<RoadmapRecord | null>(null);
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncRetry, setSyncRetry] = useState<"hydrate" | "save" | null>(null);

  const applyLocal = useCallback(
    (next: RoadmapRecord, scope = userId) => {
      const scoped = writeLocalRoadmap(next, scope);
      setRecord(scoped);
      return scoped;
    },
    [userId]
  );

  const hydrate = useCallback(async () => {
    const user = await fetchSignedInUser().catch(() => null);
    const scope = user?.userId ?? "local-anonymous";
    setUserId(scope);
    const local = readLocalRoadmap(scope);
    const remote = await fetchRemoteRoadmap().catch(
      (): RemoteFetchResult => ({
        record: null,
        persist: "local",
        code: "offline",
        error: "Your plan is saved on this device. Try again when you are back online.",
      })
    );
    const decision = decideHydrate({
      local,
      remote: remote.record,
      persist: remote.persist,
      code: remote.code,
      error: remote.error,
    });
    setPersistMode(remote.persist);
    setImportLocal(null);
    setConflictLocal(null);
    setConflictRemote(null);
    setSyncRetry(null);

    if (decision.kind === "offline") {
      if (decision.local) setRecord(decision.local);
      setSyncPhase("idle");
      setSyncMessage(decision.error);
      setSyncRetry("hydrate");
      setLoading(false);
      return;
    }

    if (decision.kind === "local-only") {
      setRecord(decision.record);
      setSyncPhase("idle");
      setServerUpdatedAt(null);
      setSyncMessage(null);
      setLoading(false);
      return;
    }

    if (decision.kind === "empty") {
      setRecord(null);
      setSyncPhase("idle");
      setServerUpdatedAt(null);
      setSyncMessage(null);
      setLoading(false);
      return;
    }

    if (decision.kind === "import-prompt") {
      setRecord(decision.local);
      setImportLocal(decision.local);
      setSyncPhase("pending-import");
      setServerUpdatedAt(null);
      setSyncMessage(null);
      setLoading(false);
      return;
    }

    if (decision.kind === "conflict") {
      setRecord(decision.local);
      setConflictLocal(decision.local);
      setConflictRemote(decision.remote);
      setSyncPhase("conflict");
      setServerUpdatedAt(decision.remote.updatedAt);
      setSyncMessage(null);
      setLoading(false);
      return;
    }

    const scoped = writeLocalRoadmap(decision.record, scope);
    setRecord(scoped);
    setSyncPhase("synced");
    setServerUpdatedAt(decision.record.updatedAt);
    setSyncMessage(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = localIsoDate();
      setToday(now);
      setIntake((current) =>
        current.examDate > now ? current : { ...current, examDate: addDays(now, 60), rhythm: emptyStudyRhythmHook() }
      );
      void hydrate();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrate]);

  const pushRemote = useCallback(
    async (next: RoadmapRecord, expectedUpdatedAt: string | null) => {
      const result = await saveRemoteRoadmap(next, { expectedUpdatedAt });
      if (result.code === "conflict" && result.record) {
        setConflictLocal(next);
        setConflictRemote(result.record);
        setSyncPhase("conflict");
        setServerUpdatedAt(result.record.updatedAt);
        setPersistMode("server");
        setSyncMessage(null);
        return;
      }
      if (result.persist === "server" && result.record) {
        setPersistMode("server");
        setSyncPhase("synced");
        setServerUpdatedAt(result.record.updatedAt);
        applyLocal({ ...next, updatedAt: result.record.updatedAt, id: result.record.id || next.id });
        setSyncMessage(null);
        setSyncRetry(null);
        return;
      }
      if (result.persist === "server") {
        setPersistMode("server");
        setSyncPhase("synced");
        setServerUpdatedAt(next.updatedAt);
        setSyncMessage(null);
        setSyncRetry(null);
        return;
      }
      if (result.code === "table_missing") {
        setPersistMode("local");
        setSyncMessage(null);
        setSyncRetry(null);
        return;
      }
      setSyncMessage(
        result.error || "Your plan is saved on this device. The account copy could not be reached just now."
      );
      setSyncRetry("save");
    },
    [applyLocal]
  );

  const persist = (next: RoadmapRecord) => {
    const scoped = applyLocal(next);
    const allowRemote =
      persistMode === "server" &&
      syncPhase !== "pending-import" &&
      syncPhase !== "opted-out" &&
      syncPhase !== "conflict";
    if (!allowRemote) return;
    void pushRemote(scoped, serverUpdatedAt);
  };

  const generate = () => {
    persist(
      createRoadmapRecord({
        userId,
        intake: { ...intake, rhythm: intake.rhythm ?? emptyStudyRhythmHook() },
        today,
      })
    );
  };

  const reset = () => {
    clearLocalRoadmap(userId);
    setRecord(null);
    setStep(0);
    setIntake({
      ...defaultIntake(addDays(today, 60)),
      rhythm: emptyStudyRhythmHook(),
    });
    setSyncPhase("idle");
    setServerUpdatedAt(null);
    setImportLocal(null);
    setConflictLocal(null);
    setConflictRemote(null);
    void fetch("/api/roadmap", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete" }),
    }).catch(() => undefined);
  };

  const keepImportedPlan = () => {
    if (!importLocal && !record) return;
    const local = importLocal ?? record;
    if (!local) return;
    setSyncPhase("idle");
    setImportLocal(null);
    void pushRemote(local, null);
  };

  const keepOnDeviceOnly = () => {
    setSyncPhase("opted-out");
    setImportLocal(null);
  };

  const keepDevicePlan = () => {
    const local = conflictLocal ?? record;
    const remote = conflictRemote;
    if (!local || !remote) return;
    setSyncPhase("idle");
    setConflictLocal(null);
    setConflictRemote(null);
    void pushRemote(local, remote.updatedAt);
  };

  const keepAccountPlan = () => {
    const remote = conflictRemote;
    if (!remote) return;
    applyLocal(remote);
    setSyncPhase("synced");
    setServerUpdatedAt(remote.updatedAt);
    setConflictLocal(null);
    setConflictRemote(null);
    setPersistMode("server");
  };

  const keepBothPlans = () => {
    const local = conflictLocal ?? record;
    const remote = conflictRemote;
    if (!local || !remote) return;
    snapshotLocalRoadmap(local, userId);
    downloadRoadmapCopy(local);
    applyLocal(remote);
    setSyncPhase("synced");
    setServerUpdatedAt(remote.updatedAt);
    setConflictLocal(null);
    setConflictRemote(null);
    setPersistMode("server");
  };

  const persistCaption =
    persistMode === "server" && (syncPhase === "synced" || syncPhase === "idle")
      ? "Saved on this device and in your account."
      : persistMode === "server" && syncPhase === "pending-import"
        ? "Saved on this device. Your account copy waits until you choose."
        : persistMode === "server" && syncPhase === "opted-out"
          ? "Saved on this device. Your account was left unchanged."
          : persistMode === "server" && syncPhase === "conflict"
            ? "Saved on this device until you choose which copy to keep."
            : "Saved on this device for this local demo.";

  return (
    <AppChrome subtitle="My Study Roadmap" actions={<StudyRhythmButton label="Rhythm" />}>
      <main className={ui.main}>
        <p className={ui.eyebrow}>My Study Roadmap</p>
        <div className="mt-3 flex items-start gap-3">
          <span className={ui.chip}>
            <Map className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className={`${ui.heading} text-4xl`}>Plan the days you still have.</h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
              A deterministic study calendar — daily, weekly, monthly, and custom — built from your exam, syllabus, and real hours. No paid chat. Sleep hours stay protected.
            </p>
            <p className="mt-2 text-xs text-muted" data-testid="roadmap-persist-mode" data-persist={persistMode} data-sync={syncPhase}>
              {persistCaption}
            </p>
            {syncPhase === "opted-out" && persistMode === "server" && record && (
              <button
                type="button"
                className={`${ui.ghost} mt-2`}
                data-testid="roadmap-save-to-account"
                onClick={() => {
                  setSyncPhase("idle");
                  void pushRemote(record, serverUpdatedAt);
                }}
              >
                Save to my account
              </button>
            )}
          </div>
        </div>

        {loading && <p className={`${ui.loading} mt-8`}>Opening your roadmap...</p>}

        {!loading && syncMessage && (
          <RoadmapSyncNotice
            message={syncMessage}
            onRetry={
              syncRetry === "hydrate"
                ? () => {
                    setLoading(true);
                    void hydrate();
                  }
                : syncRetry === "save" && record
                  ? () => void pushRemote(record, serverUpdatedAt)
                  : undefined
            }
          />
        )}

        {!loading && !record && (
          <RoadmapOnboarding
            intake={intake}
            onChange={setIntake}
            onGenerate={generate}
            step={step}
            onStepChange={setStep}
            today={today}
          />
        )}

        {!loading && record && (
          <RoadmapStudio
            record={record}
            today={today}
            userId={userId}
            onChange={persist}
            onReset={reset}
          />
        )}
      </main>

      {syncPhase === "pending-import" && importLocal && (
        <RoadmapImportDialog
          local={importLocal}
          onKeepAccount={keepImportedPlan}
          onKeepDevice={keepOnDeviceOnly}
        />
      )}

      {syncPhase === "conflict" && conflictLocal && conflictRemote && (
        <RoadmapConflictDialog
          local={conflictLocal}
          remote={conflictRemote}
          onKeepDevice={keepDevicePlan}
          onKeepAccount={keepAccountPlan}
          onKeepBoth={keepBothPlans}
        />
      )}
    </AppChrome>
  );
}
