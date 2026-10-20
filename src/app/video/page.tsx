"use client";

import React, { useState } from "react";
import VideoPlayer from "@/components/video/VideoPlayer";
import ParallelNotes from "@/components/video/ParallelNotes";
import StudySidePanel from "@/components/study/StudySidePanel";
import StudioFrame from "@/components/studio/StudioFrame";
import {
  calculatePrakritiProfile,
  type Dosha,
} from "@/lib/prakriti/config";
import {
  DEFAULT_VIDEO_LECTURES,
  formatTimestampBadge,
  type VideoLectureRecord,
} from "@/lib/video/sync-engine";
import {
  applyOneTapNoteModification,
  recordCognitiveTelemetryEvent,
  type NoteModificationAction,
} from "@/lib/ai/adaptive-memory";

export default function ParallelVideoStudioPage() {
  const [activeDosha, setActiveDosha] = useState<Dosha>("Vata");
  const [lectures, setLectures] = useState<VideoLectureRecord[]>(
    () => DEFAULT_VIDEO_LECTURES
  );
  const [activeLectureId, setActiveLectureId] = useState<string>(
    DEFAULT_VIDEO_LECTURES[0].id
  );
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState<number>(258);
  const [telemetryToast, setTelemetryToast] = useState<string | null>(null);

  const profile = calculatePrakritiProfile(
    activeDosha === "Vata"
      ? { Vata: 70, Pitta: 20, Kapha: 10 }
      : activeDosha === "Pitta"
        ? { Vata: 15, Pitta: 70, Kapha: 15 }
        : { Vata: 10, Pitta: 20, Kapha: 70 },
    activeDosha === "Vata"
      ? { Vata: 70, Pitta: 20, Kapha: 10 }
      : activeDosha === "Pitta"
        ? { Vata: 15, Pitta: 70, Kapha: 15 }
        : { Vata: 10, Pitta: 20, Kapha: 70 }
  );
  const theme = profile.activeConfiguration.theme;

  const activeLecture =
    lectures.find((l) => l.id === activeLectureId) ?? lectures[0];

  const handleModifyNote = async (
    noteId: string,
    action: NoteModificationAction
  ) => {
    let targetBadge = "[00:00]";
    setLectures((prev) =>
      prev.map((lec) => {
        if (lec.id !== activeLecture.id) return lec;
        return {
          ...lec,
          notes: lec.notes.map((n) => {
            if (n.id !== noteId) return n;
            targetBadge = n.timestampBadge;
            const modifiedMarkdown = applyOneTapNoteModification({
              originalText: n.studyNoteMarkdown,
              action,
              citationBadge: n.timestampBadge,
              prakritiDosha: activeDosha,
            });
            return {
              ...n,
              studyNoteMarkdown: modifiedMarkdown,
              modificationHistory: [...n.modificationHistory, action],
            };
          }),
        };
      })
    );

    const updatedDna = await recordCognitiveTelemetryEvent({
      userId: "local-student-scholar",
      eventType: action,
      prakritiDosha: activeDosha,
      contextLabel: targetBadge,
    });
    setTelemetryToast(
      `Note updated at ${targetBadge} • Memory refreshed (${updatedDna.word_count} words).`
    );

    fetch("/api/ai/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: action,
        prakritiDosha: activeDosha,
        contextLabel: targetBadge,
      }),
    }).catch(() => {});
  };

  const handleRewindFriction = async (fromSec: number, toSec: number) => {
    const badge = formatTimestampBadge(toSec);
    await recordCognitiveTelemetryEvent({
      userId: "local-student-scholar",
      eventType: "video_rewind_friction",
      prakritiDosha: activeDosha,
      contextLabel: badge,
    });
    setTelemetryToast(
      `Rewound ${formatTimestampBadge(fromSec)} → ${badge}. Pacing adjusted.`
    );
  };

  return (
    <StudioFrame
      title="Synchronized Video Lecture"
      eyebrow="Live timestamped notes"
      activeDosha={activeDosha}
      onChangeDosha={setActiveDosha}
    >
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0 space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Lecture</span>
            <select
              aria-label="Lecture"
              value={activeLecture.id}
              onChange={(event) => {
                setActiveLectureId(event.target.value);
                setCurrentTimeSeconds(0);
              }}
              className="min-h-[44px] w-full cursor-pointer rounded-full border border-zinc-200/60 bg-white/80 px-4 text-sm font-medium text-zinc-900 backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:text-zinc-100"
            >
              {lectures.map((lecture) => (
                <option key={lecture.id} value={lecture.id}>
                  {lecture.title}
                </option>
              ))}
            </select>
          </label>
          <p className="px-2 text-xs text-zinc-500">{activeLecture.facultyName}</p>
        </div>

        {telemetryToast && (
          <p className="text-center text-xs text-zinc-500">{telemetryToast}</p>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <VideoPlayer
            youtubeUrlOrId={activeLecture.youtubeUrl}
            currentTimeSeconds={currentTimeSeconds}
            durationSeconds={activeLecture.durationSeconds}
            onTimeUpdate={setCurrentTimeSeconds}
            onRewindFriction={handleRewindFriction}
            theme={theme}
          />
          <ParallelNotes
            lectureTitle={activeLecture.title}
            notes={activeLecture.notes}
            currentTimeSeconds={currentTimeSeconds}
            onSeekToTimestamp={(sec, badge) => {
              setCurrentTimeSeconds(sec);
              setTelemetryToast(`Jumped to ${badge}.`);
            }}
            onModifyNote={handleModifyNote}
            theme={theme}
          />
        </div>
      </div>
        <StudySidePanel dosha={activeDosha} />
      </div>
    </StudioFrame>
  );
}
