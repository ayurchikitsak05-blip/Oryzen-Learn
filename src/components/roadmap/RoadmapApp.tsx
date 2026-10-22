"use client";

import React, { useEffect, useState } from "react";
import { Map } from "lucide-react";
import AppChrome from "@/components/layout/AppChrome";
import StudyRhythmButton from "@/components/rhythm/StudyRhythmButton";
import { ui } from "@/components/ui/classes";
import { defaultIntake } from "@/lib/roadmap/defaults";
import { emptyStudyRhythmHook } from "@/lib/roadmap/hooks";
import {
  createRoadmapRecord,
  fetchRemoteRoadmap,
  newerRecord,
  readLocalRoadmap,
  saveRemoteRoadmap,
  writeLocalRoadmap,
  clearLocalRoadmap,
} from "@/lib/roadmap/persist";
import { addDays, localIsoDate } from "@/lib/roadmap/time";
import type { RoadmapIntake, RoadmapRecord } from "@/lib/roadmap/types";
import { fetchSignedInUser } from "@/lib/supabase/session";
import RoadmapOnboarding from "./RoadmapOnboarding";
import RoadmapStudio from "./RoadmapStudio";

export default function RoadmapApp() {
  const [userId, setUserId] = useState<string>("local-anonymous");
  const [today, setToday] = useState("2026-11-02");
  const [intake, setIntake] = useState<RoadmapIntake>(() => defaultIntake("2026-12-31"));
  const [record, setRecord] = useState<RoadmapRecord | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [persistMode, setPersistMode] = useState<"server" | "local">("local");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = localIsoDate();
      setToday(now);
      setIntake((current) =>
        current.examDate > now ? current : { ...current, examDate: addDays(now, 60), rhythm: emptyStudyRhythmHook() }
      );
      void (async () => {
        const user = await fetchSignedInUser().catch(() => null);
        const scope = user?.userId ?? "local-anonymous";
        setUserId(scope);
        const local = readLocalRoadmap(scope);
        const remote = await fetchRemoteRoadmap().catch(() => ({
          record: null,
          persist: "local" as const,
        }));
        const chosen = newerRecord(local, remote.record);
        if (chosen) setRecord(chosen);
        setPersistMode(remote.persist);
        setLoading(false);
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const persist = (next: RoadmapRecord) => {
    const scoped = writeLocalRoadmap(next, userId);
    setRecord(scoped);
    void saveRemoteRoadmap(scoped).then((result) => {
      if (result.persist) setPersistMode(result.persist);
    });
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
    void fetch("/api/roadmap", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete" }),
    }).catch(() => undefined);
  };

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
            <p className="mt-2 text-xs text-muted">
              Saved on this device{persistMode === "server" ? " and in your account" : " for this local demo"}.
            </p>
          </div>
        </div>

        {loading && <p className={`${ui.loading} mt-8`}>Opening your roadmap...</p>}

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
    </AppChrome>
  );
}
