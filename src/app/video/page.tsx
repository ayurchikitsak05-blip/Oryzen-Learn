"use client";

import React, { useEffect, useRef, useState } from "react";
import VideoPlayer from "@/components/video/VideoPlayer";
import ParallelNotes from "@/components/video/ParallelNotes";
import StudySidePanel from "@/components/study/StudySidePanel";
import StudioFrame from "@/components/studio/StudioFrame";
import {
  calculatePrakritiProfile,
  type Dosha,
} from "@/lib/prakriti/config";
import {
  createStudentLecture,
  DEFAULT_VIDEO_LECTURES,
  formatTimestampBadge,
  type VideoLectureRecord,
} from "@/lib/video/sync-engine";
import {
  applyOneTapNoteModification,
  recordCognitiveTelemetryEvent,
  type NoteModificationAction,
} from "@/lib/ai/adaptive-memory";
import { notebookSaveMessage, saveToNotebook } from "@/lib/notes/save-to-notebook";
import type { TimestampedLectureNote } from "@/lib/video/sync-engine";
import { captionFailureCopy } from "@/lib/video/public-captions";
import { readVideoCaptionNotes, writeVideoCaptionNotes } from "@/lib/video/caption-notes-store";
import { fetchSignedInUser } from "@/lib/supabase/session";

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
  const [captionNotice, setCaptionNotice] = useState<{ lectureId: string; text: string } | null>(
    null
  );
  const ownerIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchSignedInUser().then((user) => {
      if (!active || !user?.userId) return;
      ownerIdRef.current = user.userId;
      const saved = readVideoCaptionNotes(user.userId);
      if (saved.length === 0) return;
      setLectures((prev) => {
        const known = new Set(prev.map((row) => row.youtubeVideoId));
        const restored = saved
          .filter((item) => !known.has(item.videoId))
          .map((item) => ({
            ...createStudentLecture({
              sourceType: "youtube" as const,
              youtubeVideoId: item.videoId,
              youtubeUrl: item.url,
              title: item.title,
            }),
            notes: item.notes,
          }));
        return restored.length > 0 ? [...prev, ...restored] : prev;
      });
    });
    return () => {
      active = false;
    };
  }, []);

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

  const handleSaveNote = async (note: TimestampedLectureNote) => {
    const result = await saveToNotebook({
      subjectTitle: activeLecture.title,
      title: `${activeLecture.title} · ${note.timestampBadge}`,
      noteBody: [
        note.heading,
        "",
        note.timestampBadge,
        note.speakerTranscript ? `Spoken: ${note.speakerTranscript}` : "",
        "",
        note.studyNoteMarkdown,
        note.highYieldKeyPoint,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    setTelemetryToast(notebookSaveMessage(result));
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
      title="Learn from Videos"
      eyebrow="Video notes"
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
              className="field-input w-full cursor-pointer text-sm"
            >
              {lectures.map((lecture) => (
                <option key={lecture.id} value={lecture.id}>
                  {lecture.title}
                </option>
              ))}
            </select>
          </label>
          <p className="px-2 text-xs text-muted">
            <span className="mr-2 rounded-full bg-beige-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
              Demo
            </span>
            {activeLecture.facultyName}
          </p>
        </div>

        {telemetryToast && (
          <p className="text-center text-xs text-muted">{telemetryToast}</p>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <VideoPlayer
            youtubeUrlOrId={activeLecture.youtubeUrl}
            currentTimeSeconds={currentTimeSeconds}
            durationSeconds={activeLecture.durationSeconds}
            onTimeUpdate={setCurrentTimeSeconds}
            onRewindFriction={handleRewindFriction}
            onChangeYouTubeUrl={(url, videoId) => {
              const lecture = createStudentLecture({
                sourceType: "youtube",
                youtubeVideoId: videoId,
                youtubeUrl: url,
                title: "Your lecture",
              });
              setLectures((prev) =>
                prev.some((row) => row.id === lecture.id) ? prev : [...prev, lecture]
              );
              setActiveLectureId(lecture.id);
              void fetch(`/api/video/captions?v=${encodeURIComponent(videoId)}`)
                .then(async (response) => {
                  if (!response.ok) throw new Error("caption_http");
                  return response.json() as Promise<{
                    notes?: VideoLectureRecord["notes"];
                    reason?: "ok" | "no_public_captions" | "unsupported";
                  }>;
                })
                .then(async (payload) => {
                  const notes = payload.notes ?? [];
                  if (notes.length === 0) {
                    const text = captionFailureCopy(payload.reason ?? "no_public_captions");
                    setCaptionNotice({ lectureId: lecture.id, text });
                    setTelemetryToast(text);
                    return;
                  }
                  setCaptionNotice(null);
                  setLectures((prev) =>
                    prev.map((row) => (row.id === lecture.id ? { ...row, notes } : row))
                  );
                  const ownerId =
                    ownerIdRef.current ?? (await fetchSignedInUser())?.userId ?? null;
                  if (ownerId) {
                    ownerIdRef.current = ownerId;
                    writeVideoCaptionNotes(ownerId, {
                      videoId,
                      url,
                      title: lecture.title,
                      notes,
                    });
                  }
                  setTelemetryToast(
                    ownerId
                      ? "Public captions were attached as timed notes."
                      : "Public captions are on this screen. Sign in to keep them after a refresh."
                  );
                })
                .catch(() => {
                  const text = captionFailureCopy("unavailable");
                  setCaptionNotice({ lectureId: lecture.id, text });
                  setTelemetryToast(text);
                });
            }}
            onLocalFileSelected={(fileName) => {
              const lecture = createStudentLecture({
                sourceType: "local_mp4",
                localFileName: fileName,
                title: fileName,
              });
              setLectures((prev) => [
                ...prev.filter((row) => row.id !== lecture.id),
                lecture,
              ]);
              setActiveLectureId(lecture.id);
            }}
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
            onSaveNote={(note) => void handleSaveNote(note)}
            emptyMessage={
              captionNotice?.lectureId === activeLecture.id ? captionNotice.text : null
            }
            theme={theme}
          />
        </div>
      </div>
        <StudySidePanel dosha={activeDosha} />
      </div>
    </StudioFrame>
  );
}
