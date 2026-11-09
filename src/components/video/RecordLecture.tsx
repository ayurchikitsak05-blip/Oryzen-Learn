"use client";

import React, { useEffect, useRef, useState } from "react";
import { Download, FileAudio, Mic, Square, Trash2 } from "lucide-react";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { ListenButton } from "@/components/speech/ListenButton";
import { ui } from "@/components/ui/classes";
import { createClient } from "@/lib/supabase/client";
import { usePrivateReady } from "@/lib/privacy/use-private-ready";
import { notebookSaveMessage, saveToNotebook } from "@/lib/notes/save-to-notebook";
import { pickAudioType } from "@/lib/voice-notes/store";
import { LECTURE_MAX_SECONDS, type LectureAllowance } from "@/lib/video/lecture-notes";
import type { TimestampedLectureNote } from "@/lib/video/sync-engine";
import { audioFormatFor, RECORDING_BITS_PER_SECOND, RECORDING_BUCKET, RECORDING_MAX_BYTES } from "@/lib/video/recording";
import {
  addRecordedLecture,
  readRecordedLectures,
  recordedLectureAsText,
  removeRecordedLecture,
  type RecordedLecture,
} from "@/lib/video/recorded-lectures";

type Audio = { blob: Blob; name: string; seconds: number | null };
type Busy = null | "uploading" | "reading";

function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function sizeLabel(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LectureNotesView({ lecture }: { lecture: RecordedLecture }) {
  return (
    <ol className="space-y-3" data-testid="recorded-notes">
      {lecture.notes.map((note) => (
        <li key={note.id} className="rounded-xl border border-line bg-canvas p-3 text-sm">
          <p className="font-semibold text-heading">
            <span className="mr-2 font-mono text-xs text-muted">{note.timestampBadge}</span>
            {note.heading}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink">
            {note.studyNoteMarkdown
              .split("\n")
              .map((line) => line.replace(/^-\s*/, "").trim())
              .filter(Boolean)
              .map((line) => (
                <li key={line}>{line}</li>
              ))}
          </ul>
          {note.highYieldKeyPoint ? (
            <p className="mt-1 text-ink">
              <span className="font-semibold text-accent">Exam point: </span>
              {note.highYieldKeyPoint}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Record a class (or upload a recording) and get timed notes, like a YouTube lecture. */
export function RecordLecture() {
  const userId = useSignedInScope();
  const ready = usePrivateReady(userId);
  const [allowance, setAllowance] = useState<LectureAllowance | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState<Audio | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState("");
  const [lectures, setLectures] = useState<RecordedLecture[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const ticker = useRef<number | undefined>(undefined);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const unmounted = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
    void fetch("/api/video/recording", { credentials: "same-origin" })
      .then((response) => response.json().then((json) => ({ response, json })))
      .then(({ response, json }) => {
        if (unmounted.current) return;
        if (response.ok) {
          setAllowance(json.allowance ?? null);
          setEnabled(json.enabled !== false);
        } else if (response.status === 503) {
          setEnabled(false);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLectures(ready ? readRecordedLectures(userId) : []);
  }, [ready, userId]);

  useEffect(() => {
    if (!audio) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audio.blob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);

  // Warn before closing the page while a class is being recorded or sent.
  useEffect(() => {
    if (!recording && !busy && !audio) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recording, busy, audio]);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      window.clearInterval(ticker.current);
      const current = recorder.current;
      if (current && current.state !== "inactive") current.stop();
      current?.stream.getTracks().forEach((track) => track.stop());
      void wakeLock.current?.release().catch(() => undefined);
    };
  }, []);

  const stop = () => {
    window.clearInterval(ticker.current);
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  };

  const startRecording = async () => {
    if (starting || recording) return;
    setMessage("");
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
      if (unmounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const type = pickAudioType((t) => MediaRecorder.isTypeSupported(t));
      const options: MediaRecorderOptions = { audioBitsPerSecond: RECORDING_BITS_PER_SECOND };
      if (type) options.mimeType = type;
      const next = new MediaRecorder(stream, options);
      chunks.current = [];
      next.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void wakeLock.current?.release().catch(() => undefined);
        wakeLock.current = null;
        recorder.current = null;
        if (unmounted.current) return;
        setRecording(false);
        const blob = new Blob(chunks.current, { type: next.mimeType || type || "audio/webm" });
        if (blob.size === 0) {
          setMessage("Nothing was recorded. Check that the microphone is allowed and try again.");
          return;
        }
        const ext = audioFormatFor(blob.type)?.ext ?? "webm";
        setAudio({
          blob,
          name: `class-${new Date().toISOString().slice(0, 10)}.${ext}`,
          seconds: Math.round((Date.now() - started.current) / 1000),
        });
      };
      recorder.current = next;
      started.current = Date.now();
      setSeconds(0);
      // A chunk every 10 seconds, so a long class isn't lost if the phone stops recording later.
      next.start(10_000);
      setRecording(true);
      try {
        const lock = await (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen");
        wakeLock.current = lock ?? null;
      } catch {
        wakeLock.current = null;
      }
      ticker.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - started.current) / 1000);
        setSeconds(elapsed);
        if (elapsed >= LECTURE_MAX_SECONDS) stop();
      }, 1000);
    } catch {
      if (!unmounted.current) setMessage("Microphone permission is needed. Allow it in your browser settings and try again.");
    } finally {
      if (!unmounted.current) setStarting(false);
    }
  };

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    setMessage("");
    if (!audioFormatFor(file.type, file.name)) {
      setMessage("This file type can't be used. Choose an audio recording (m4a, mp3, webm, ogg, wav or aac).");
      return;
    }
    if (file.size > RECORDING_MAX_BYTES) {
      setMessage("This recording is bigger than 60 MB. Record each class separately (up to 90 minutes).");
      return;
    }
    setAudio({ blob: file, name: file.name, seconds: null });
  };

  const discard = () => {
    setAudio(null);
    setMessage("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const makeNotes = async () => {
    if (!audio || busy) return;
    setMessage("");
    setBusy("uploading");
    try {
      const prepared = await fetch("/api/video/recording", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare", mimeType: audio.blob.type, fileName: audio.name, sizeBytes: audio.blob.size }),
      });
      const upload = (await prepared.json().catch(() => ({}))) as {
        recordingId?: string;
        path?: string;
        token?: string;
        ext?: string;
        contentType?: string;
        error?: string;
        allowance?: LectureAllowance;
      };
      if (!prepared.ok || !upload.recordingId || !upload.path || !upload.token || !upload.ext) {
        if (upload.allowance) setAllowance(upload.allowance);
        setMessage(prepared.status === 401 ? "Sign in to make notes from your classes." : upload.error ?? "The recording couldn't be sent just now.");
        return;
      }
      const { error: uploadError } = await createClient()
        .storage.from(RECORDING_BUCKET)
        .uploadToSignedUrl(upload.path, upload.token, audio.blob, { contentType: upload.contentType ?? "audio/webm" });
      if (uploadError) {
        setMessage("The upload didn't finish (the connection may have dropped). Nothing was counted. Your recording is still here; try again.");
        return;
      }
      if (unmounted.current) return;
      setBusy("reading");
      const made = await fetch("/api/video/recording", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "make", recordingId: upload.recordingId, ext: upload.ext }),
      });
      const json = (await made.json().catch(() => ({}))) as {
        ok?: boolean;
        title?: string;
        notes?: TimestampedLectureNote[];
        allowance?: LectureAllowance;
        error?: string;
        reference?: string;
      };
      if (json.allowance) setAllowance(json.allowance);
      if (!made.ok || !json.ok || !Array.isArray(json.notes)) {
        const reference = json.reference ? ` (${json.reference})` : made.ok ? "" : ` (H${made.status})`;
        setMessage(`${json.error ?? "Notes couldn't be made just now."}${reference}`);
        return;
      }
      const lecture: RecordedLecture = {
        id: upload.recordingId,
        title: json.title || "My class",
        createdAt: new Date().toISOString(),
        notes: json.notes,
      };
      setLectures(addRecordedLecture(lecture, userId));
      setOpenId(lecture.id);
      setAudio(null);
      setMessage("Notes are ready below. Save them to My Notes to revise later.");
    } catch {
      setMessage("No connection. Your recording is still here; try again when you're online.");
    } finally {
      if (!unmounted.current) setBusy(null);
    }
  };

  const saveLecture = async (lecture: RecordedLecture) => {
    setSaved((current) => ({ ...current, [lecture.id]: "Saving…" }));
    try {
      const result = await saveToNotebook({
        subjectTitle: "Recorded lectures",
        title: `${lecture.title} (${new Date(lecture.createdAt).toLocaleDateString("en-IN")})`.slice(0, 120),
        noteBody: recordedLectureAsText(lecture),
      });
      setSaved((current) => ({ ...current, [lecture.id]: notebookSaveMessage(result) }));
    } catch {
      setSaved((current) => ({ ...current, [lecture.id]: "No connection. Try saving again when you're online." }));
    }
  };

  const left = allowance ? allowance.left : null;

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10" data-testid="record-lecture">
      <header>
        <h1 className={`${ui.heading} text-3xl`}>Record a lecture</h1>
        <p className="mt-2 text-sm text-muted">
          Record your class (up to 90 minutes) or upload a recording from your phone. You get notes with times, like a
          YouTube lecture. The audio is deleted as soon as the notes are made, and the notes are only yours.
        </p>
        {allowance ? (
          <p className="mt-2 text-sm text-heading" data-testid="record-allowance">
            {allowance.left} of {allowance.limit} lecture{allowance.limit === 1 ? "" : "s"} left this month (YouTube and recordings together).
          </p>
        ) : null}
      </header>

      {!enabled ? <p className={ui.notice}>Lecture recording isn&apos;t switched on yet.</p> : null}

      {enabled && !audio ? (
        <section className={`${ui.cardPad} space-y-3`}>
          {recording ? (
            <>
              <p className="text-center font-mono text-4xl text-heading" data-testid="record-clock" aria-live="off">
                {clock(seconds)}
              </p>
              <p className="text-center text-sm text-muted">
                Keep this screen open and the phone near the teacher. Plug in the charger for long classes.
              </p>
              <button type="button" className={`${ui.primary} min-h-12 w-full`} onClick={stop} data-testid="record-stop">
                <Square className="h-4 w-4" aria-hidden="true" /> Stop recording
              </button>
            </>
          ) : (
            <>
              {supported ? (
                <button
                  type="button"
                  className={`${ui.primary} min-h-12 w-full`}
                  onClick={() => void startRecording()}
                  disabled={starting || left === 0}
                  data-testid="record-start"
                >
                  <Mic className="h-4 w-4" aria-hidden="true" /> {starting ? "Starting…" : "Start recording"}
                </button>
              ) : (
                <p className="text-sm text-muted">This browser can&apos;t record. You can still upload a recording.</p>
              )}
              <button
                type="button"
                className={`${ui.secondary} min-h-12 w-full`}
                onClick={() => fileInput.current?.click()}
                disabled={left === 0}
                data-testid="record-upload"
              >
                <FileAudio className="h-4 w-4" aria-hidden="true" /> Upload a recording
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="audio/*,.m4a,.mp3,.aac,.ogg,.opus,.wav,.webm"
                className="sr-only"
                aria-label="Choose a class recording"
                onChange={(event) => chooseFile(event.target.files?.[0])}
                data-testid="record-file"
              />
              {left === 0 ? (
                <p className="text-sm text-muted">You&apos;ve used this month&apos;s lectures. New ones arrive on the 1st.</p>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {audio ? (
        <section className={`${ui.cardPad} space-y-3`} data-testid="record-ready">
          <p className="font-semibold text-heading">
            {audio.seconds !== null ? `Recorded ${clock(audio.seconds)}` : audio.name} · {sizeLabel(audio.blob.size)}
          </p>
          {audioUrl ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio controls src={audioUrl} className="w-full" />
          ) : null}
          <button
            type="button"
            className={`${ui.primary} min-h-12 w-full`}
            onClick={() => void makeNotes()}
            disabled={Boolean(busy)}
            data-testid="record-make"
          >
            {busy === "uploading"
              ? "Uploading… keep this page open"
              : busy === "reading"
                ? "Making notes… this takes 1–3 minutes"
                : "Make notes (uses 1 lecture)"}
          </button>
          <div className="flex flex-wrap gap-2">
            {audioUrl ? (
              <a href={audioUrl} download={audio.name} className={ui.secondary}>
                <Download className="h-4 w-4" aria-hidden="true" /> Save recording to phone
              </a>
            ) : null}
            <button type="button" className={ui.ghost} onClick={discard} disabled={Boolean(busy)}>
              Discard
            </button>
          </div>
        </section>
      ) : null}

      {message ? (
        <p className={ui.notice} role="status" data-testid="record-message">
          {message}
        </p>
      ) : null}

      <section className="space-y-2" aria-label="Your recorded lectures">
        <h2 className="font-semibold text-heading">Your recorded lectures</h2>
        {userId !== "local-anonymous" && !ready ? <p className={ui.empty}>Opening your private notes…</p> : null}
        {ready && lectures.length === 0 ? <p className={ui.empty}>Notes from your recorded classes will appear here.</p> : null}
        {lectures.map((lecture) => (
          <article key={lecture.id} className="space-y-2 rounded-2xl border border-line bg-surface p-3" data-testid="recorded-lecture">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                aria-expanded={openId === lecture.id}
                onClick={() => setOpenId(openId === lecture.id ? null : lecture.id)}
              >
                <span className="block font-semibold text-heading">{lecture.title}</span>
                <span className="block text-xs text-muted">
                  {new Date(lecture.createdAt).toLocaleDateString("en-IN")} · {lecture.notes.length} sections
                </span>
              </button>
              <button
                type="button"
                className={ui.iconBtn}
                aria-label={`Remove ${lecture.title}`}
                onClick={() => setLectures(removeRecordedLecture(lecture.id, userId))}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {openId === lecture.id ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={ui.secondary} onClick={() => void saveLecture(lecture)} data-testid="recorded-save">
                    Save to My Notes
                  </button>
                  <ListenButton text={recordedLectureAsText(lecture)} speechId={`rec-${lecture.id}`} />
                  {saved[lecture.id] ? (
                    <span className="text-sm text-muted" role="status">
                      {saved[lecture.id]}
                    </span>
                  ) : null}
                </div>
                <LectureNotesView lecture={lecture} />
              </>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
