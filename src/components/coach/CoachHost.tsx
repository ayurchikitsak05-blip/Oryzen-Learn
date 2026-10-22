"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CoachCard from "@/components/coach/CoachCard";
import {
  actionHref,
  breakUntilIso,
  firstIncompleteSession,
  previewSimplifyToday,
} from "@/lib/coach/actions";
import { detectCoachTrigger } from "@/lib/coach/detect";
import { readForcedTrigger, setPendingCoachAction } from "@/lib/coach/pending";
import {
  cacheKey,
  patchCoachPrefs,
  readCoachPrefs,
  recordFeedback,
  recordPostpone,
} from "@/lib/coach/persist";
import { selectAndRemember } from "@/lib/coach/selector";
import { voiceFromRhythmStyle } from "@/lib/coach/styles";
import type { CoachMessage, CoachPrefs, CoachTrigger } from "@/lib/coach/types";
import { readLocalRoadmap, writeLocalRoadmap } from "@/lib/roadmap/persist";
import { localIsoDate } from "@/lib/roadmap/time";
import type { RoadmapRecord } from "@/lib/roadmap/types";
import { readAllQuizProgress } from "@/lib/reader/quiz-progress";
import { readRhythmPrefs } from "@/lib/rhythm/persist";
import { fetchSignedInUser } from "@/lib/supabase/session";

export interface CoachInspectSnapshot {
  messageId: string | null;
  trigger: CoachTrigger | null;
  style: string | null;
  hidden: boolean;
}

declare global {
  interface Window {
    __oryzenCoachInspect?: () => CoachInspectSnapshot;
    __oryzenCoachForceTrigger?: (trigger: CoachTrigger | null) => void;
    __oryzenCoachRefresh?: () => void;
  }
}

export default function CoachHost({
  surface,
  record,
  today,
  userId,
  onRoadmapChange,
  compact,
}: {
  surface: "hub" | "roadmap";
  record?: RoadmapRecord | null;
  today?: string;
  userId?: string;
  onRoadmapChange?: (next: RoadmapRecord) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<CoachMessage | null>(null);
  const [confirmSimplify, setConfirmSimplify] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [restNoted, setRestNoted] = useState(false);
  const messageRef = React.useRef<CoachMessage | null>(null);
  messageRef.current = message;

  const refresh = useCallback(
    (rotate = false) => {
      const scope = userId ?? "local-anonymous";
      const day = today ?? localIsoDate();
      const rhythm = readRhythmPrefs();
      const prefs = readCoachPrefs(scope);
      const roadmap = record ?? readLocalRoadmap(scope);
      const trigger = detectCoachTrigger({
        today: day,
        record: roadmap,
        quizEntries: readAllQuizProgress(scope),
        prefs,
        frequency: prefs.frequency,
        encouragementOff: rhythm.encouragementOff,
        styleOff: rhythm.coachStyle === "off",
        forcedTrigger: readForcedTrigger(),
      });
      if (!trigger) {
        setMessage(null);
        return;
      }
      const style = voiceFromRhythmStyle(rhythm.coachStyle);
      const currentId = messageRef.current?.id;
      const next = selectAndRemember({
        style,
        trigger,
        userId: scope,
        day,
        recentIds: prefs.recentIds,
        cachedId: rotate ? undefined : prefs.shownByKey[cacheKey(scope, trigger, day)],
        rotate,
        excludeIds: rotate && currentId ? [currentId] : [],
      });
      setMessage(next);
      setConfirmSimplify(false);
      setHidden(false);
      setRestNoted(false);
    },
    [record, today, userId]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => refresh(false), 0);
    const onChange = () => refresh(false);
    window.addEventListener("oryzen-coach-changed", onChange);
    window.__oryzenCoachRefresh = () => refresh(false);
    window.__oryzenCoachForceTrigger = (trigger) => {
      if (typeof window === "undefined") return;
      if (trigger) window.sessionStorage.setItem("oryzen_coach_force_trigger", trigger);
      else window.sessionStorage.removeItem("oryzen_coach_force_trigger");
      refresh(true);
    };
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("oryzen-coach-changed", onChange);
    };
  }, [refresh]);

  useEffect(() => {
    window.__oryzenCoachInspect = () => ({
      messageId: message?.id ?? null,
      trigger: (message?.trigger ?? null) as CoachTrigger | null,
      style: message?.style ?? null,
      hidden: hidden || !message,
    });
  }, [hidden, message]);

  const persistRoadmap = (next: RoadmapRecord) => {
    const scope = userId ?? next.userId;
    writeLocalRoadmap(next, scope);
    onRoadmapChange?.(next);
  };

  const runAction = () => {
    if (!message) return;
    const scope = userId ?? "local-anonymous";
    const day = today ?? localIsoDate();
    const roadmap = record ?? readLocalRoadmap(scope);
    const action = message.recommendedAction;
    patchCoachPrefs({ lastAction: action, lastActionAt: new Date().toISOString() }, scope);

    if (action === "simplify_day") {
      setConfirmSimplify(true);
      return;
    }
    if (action === "take_break") {
      patchCoachPrefs(
        {
          snoozeUntil: breakUntilIso(),
          breakNotedAt: new Date().toISOString(),
          lastAction: "take_break",
          lastActionAt: new Date().toISOString(),
        },
        scope
      );
      window.dispatchEvent(new Event("oryzen-coach-break"));
      setRestNoted(true);
      return;
    }
    if (action === "none") {
      setHidden(true);
      return;
    }
    if (action === "start_studying") {
      const session = firstIncompleteSession(roadmap, day);
      if (session) {
        patchCoachPrefs(
          {
            focusedSessionId: session.id,
            inProgressSessionId: session.id,
            studyStartedAt: new Date().toISOString(),
          },
          scope
        );
        setPendingCoachAction({ kind: "focus", sessionId: session.id });
        window.dispatchEvent(new CustomEvent("oryzen-coach-focus", { detail: { sessionId: session.id } }));
      }
    }
    if (action === "replan") {
      setPendingCoachAction({ kind: "action", action: "replan" });
      window.dispatchEvent(new Event("oryzen-open-replan"));
    }
    if (action === "continue_roadmap") {
      setPendingCoachAction({ kind: "action", action: "continue_roadmap" });
      window.dispatchEvent(new Event("oryzen-coach-focus-today"));
    }
    const href = actionHref(action, roadmap, day);
    if (action === "start_studying" && surface === "roadmap") {
      return;
    }
    if (href) {
      if (surface === "roadmap" && href.startsWith("/roadmap") && action !== "revise_weak") {
        return;
      }
      router.push(href);
    }
  };

  const applySimplify = () => {
    const scope = userId ?? "local-anonymous";
    const day = today ?? localIsoDate();
    const roadmap = record ?? readLocalRoadmap(scope);
    if (!roadmap) {
      setConfirmSimplify(false);
      return;
    }
    const result = previewSimplifyToday(roadmap, day);
    result.moved.forEach((session) => recordPostpone(session.id, scope));
    persistRoadmap(result.record);
    patchCoachPrefs({ lastAction: "simplify_day", lastActionAt: new Date().toISOString() }, scope);
    setConfirmSimplify(false);
    window.dispatchEvent(new Event("oryzen-coach-simplified"));
  };

  if (hidden || !message) return null;

  return (
    <div className="mt-6" data-testid={`coach-host-${surface}`}>
      <CoachCard
        message={message}
        compact={compact}
        confirmSimplify={confirmSimplify}
        restNoted={restNoted}
        onAction={runAction}
        onHelpful={() => {
          recordFeedback(message.id, "helpful", userId);
        }}
        onTryAnother={() => refresh(true)}
        onConfirmSimplify={applySimplify}
        onCancelSimplify={() => setConfirmSimplify(false)}
      />
    </div>
  );
}

export function CoachOverwhelmedButton({
  userId,
  onMarked,
}: {
  userId?: string;
  onMarked?: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="coach-overwhelmed"
      className="btn-ghost text-sm"
      onClick={() => {
        patchCoachPrefs({ explicitOverwhelmedAt: new Date().toISOString() }, userId);
        setPendingCoachAction({ kind: "overwhelmed" });
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("oryzen_coach_force_trigger", "overwhelmed");
          window.dispatchEvent(new Event("oryzen-coach-changed"));
          window.__oryzenCoachRefresh?.();
        }
        onMarked?.();
      }}
    >
      I&apos;m feeling overwhelmed
    </button>
  );
}

export function useSignedInScope(): string {
  const [scope, setScope] = useState("local-anonymous");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchSignedInUser()
        .then((user) => setScope(user?.userId ?? "local-anonymous"))
        .catch(() => setScope("local-anonymous"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return scope;
}

export function readFreshCoachPrefs(userId?: string | null): CoachPrefs {
  return readCoachPrefs(userId);
}
