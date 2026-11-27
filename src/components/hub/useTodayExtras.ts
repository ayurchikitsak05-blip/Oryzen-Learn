"use client";

import { useEffect, useState } from "react";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { toRevisionNotes } from "@/components/revision/MorningRevision";
import { usePrivateReady } from "@/lib/privacy/use-private-ready";
import { buildTodayMix, type MixItem } from "@/lib/hub/today-mix";
import { tipForToday } from "@/lib/motivation/tips";
import { countDueToday, readRevisionState } from "@/lib/revision/cards";
import { readSprintStore } from "@/lib/sprint/persist";
import { todayKey } from "@/lib/sprint/plan";
import { currentStreak, minutesByDay, readStudyDays, weekStamps, type WeekStamp } from "@/lib/streak/study-days";
import { readStudyProfile } from "@/lib/study/style-quiz";
import { readVideoCaptionNotes } from "@/lib/video/caption-notes-store";

export interface TodayExtras {
  /** False until the student's private record has been read. */
  loaded: boolean;
  stamps: WeekStamp[];
  streak: number;
  todayMinutes: number;
  revisionDue: number | null;
  mix: MixItem[];
}

const today = () => todayKey();

/** Week stamps, streak and Today's mix: all from the student's own data, no AI. */
export function useTodayExtras(): TodayExtras {
  const userId = useSignedInScope();
  const ready = usePrivateReady(userId);
  const [extras, setExtras] = useState<TodayExtras>(() => ({
    loaded: false,
    stamps: weekStamps(today(), {}),
    streak: 0,
    todayMinutes: 0,
    revisionDue: null,
    mix: buildTodayMix({ today: today(), revisionDue: null, noteCount: 0, lastLecture: null, notes: [], fallbackTip: tipForToday(null) }),
  }));

  useEffect(() => {
    if (!ready || !userId) return;
    let cancelled = false;
    const day = today();
    const days = minutesByDay(readSprintStore(userId).sessions, readStudyDays(userId));
    const lectures = readVideoCaptionNotes(userId);
    const last = lectures.at(-1) ?? null;
    const lastLecture = last ? { videoId: last.videoId, title: last.title, topics: last.notes.length } : null;
    const tip = tipForToday(readStudyProfile(userId)?.profileId ?? null);
    const publish = (revisionDue: number | null, notes: Array<{ title: string; body: string | null }>, noteCount: number) => {
      if (cancelled) return;
      setExtras({
        loaded: true,
        stamps: weekStamps(day, days),
        streak: currentStreak(day, days),
        todayMinutes: days[day] ?? 0,
        revisionDue,
        mix: buildTodayMix({ today: day, revisionDue, noteCount, lastLecture, notes, fallbackTip: tip }),
      });
    };
    publish(null, [], 0);
    void fetch("/api/notes", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { notes?: Array<{ title: string; body: string | null }> } | null) => {
        if (!data) return;
        const cards = toRevisionNotes(data as Parameters<typeof toRevisionNotes>[0]);
        publish(countDueToday(cards, readRevisionState(userId), day), data.notes ?? [], cards.length);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, userId]);

  return extras;
}
