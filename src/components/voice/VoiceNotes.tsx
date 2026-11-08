"use client";

import React, { useEffect, useRef, useState } from "react";
import { Mic, Play, Square, Trash2 } from "lucide-react";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { ui } from "@/components/ui/classes";
import { usePrivateReady } from "@/lib/privacy/use-private-ready";
import {
  deleteVoiceNote,
  listVoiceNotes,
  MAX_RECORD_SECONDS,
  pickAudioType,
  saveVoiceNote,
  VOICE_NOTES_EVENT,
  voiceNoteAudio,
  voiceNotesSupported,
  type VoiceNoteMeta,
} from "@/lib/voice-notes/store";

/** Plays one saved voice note. The audio is unlocked only when the student taps Play. */
export function VoiceNotePlayer({ id, userId }: { id: string; userId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "missing">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const made = useRef<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setState("idle");
    setUrl(null);
    return () => {
      alive.current = false;
      if (made.current) URL.revokeObjectURL(made.current);
      made.current = null;
    };
  }, [id, userId]);

  const load = async () => {
    setState("loading");
    const blob = await voiceNoteAudio(id, userId);
    if (!alive.current) return;
    if (!blob) {
      setState("missing");
      return;
    }
    made.current = URL.createObjectURL(blob);
    setUrl(made.current);
    setState("ready");
  };

  if (state === "ready" && url) {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <audio controls autoPlay src={url} className="w-full" data-testid="voice-note-audio" />;
  }
  if (state === "missing") {
    return <p className="text-xs text-muted">This recording isn&apos;t on this phone.</p>;
  }
  return (
    <button
      type="button"
      className={ui.secondary}
      onClick={() => void load()}
      disabled={state === "loading"}
      data-testid="voice-note-play"
    >
      <Play className="h-4 w-4" aria-hidden="true" />
      {state === "loading" ? "Opening…" : "Play"}
    </button>
  );
}

export function VoiceNotes() {
  const userId = useSignedInScope();
  const ready = usePrivateReady(userId);
  const [notes, setNotes] = useState<VoiceNoteMeta[]>([]);
  const [title, setTitle] = useState("");
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [supported, setSupported] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const ticker = useRef<number | undefined>(undefined);
  const unmounted = useRef(false);
  const discard = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    setSupported(voiceNotesSupported());
    if (!ready) {
      setNotes([]);
      return;
    }
    const load = () => void listVoiceNotes(userId).then((rows) => !unmounted.current && setNotes(rows));
    load();
    window.addEventListener(VOICE_NOTES_EVENT, load);
    return () => window.removeEventListener(VOICE_NOTES_EVENT, load);
  }, [userId, ready]);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      // Leaving the page: throw away a half-made recording and turn the microphone off.
      unmounted.current = true;
      discard.current = true;
      window.clearInterval(ticker.current);
      const current = recorder.current;
      if (current && current.state !== "inactive") current.stop();
      current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stop = () => {
    window.clearInterval(ticker.current);
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  };

  const start = async () => {
    if (busy.current) return;
    setMessage("");
    if (userId === "local-anonymous") {
      setMessage("Sign in to keep voice notes.");
      return;
    }
    if (!ready) {
      setMessage("Your private study record is still opening. Try again in a moment.");
      return;
    }
    busy.current = true;
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (unmounted.current) {
        // The student left while the permission question was showing.
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const type = pickAudioType((t) => MediaRecorder.isTypeSupported(t));
      const next = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      chunks.current = [];
      discard.current = false;
      next.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        busy.current = false;
        recorder.current = null;
        if (discard.current || unmounted.current) return;
        setRecording(false);
        const blob = new Blob(chunks.current, { type: next.mimeType || type || "audio/webm" });
        const length = (Date.now() - started.current) / 1000;
        if (blob.size === 0) return;
        void saveVoiceNote({
          userId,
          title: title || `Voice note ${new Date().toLocaleDateString("en-IN")}`,
          seconds: length,
          type: blob.type,
          blob,
        })
          .then(() => {
            if (unmounted.current) return;
            setTitle("");
            setMessage("Saved on this phone. It will come up in Morning revision.");
          })
          .catch(() => {
            if (!unmounted.current) setMessage("This browser couldn't save the recording.");
          });
      };
      recorder.current = next;
      started.current = Date.now();
      setSeconds(0);
      next.start();
      setRecording(true);
      ticker.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - started.current) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_RECORD_SECONDS) stop();
      }, 500);
    } catch {
      busy.current = false;
      if (!unmounted.current) setMessage("Microphone permission is needed. Allow it in your browser and try again.");
    } finally {
      if (!unmounted.current) setStarting(false);
    }
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    const ok = await deleteVoiceNote(id, userId);
    if (!ok && !unmounted.current) setMessage("That voice note couldn't be deleted. Try again.");
  };

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10" data-testid="voice-notes">
      <header>
        <h1 className={`${ui.heading} text-3xl`}>Voice notes</h1>
        <p className="mt-2 text-sm text-muted">
          Say a formula, a definition or a list in your own voice (up to 2 minutes). Hearing yourself is a strong way
          to revise. Saved only on this phone and locked to your account; they come up in Morning revision.
        </p>
      </header>

      {!supported ? (
        <p className={ui.notice}>This browser can&apos;t record audio. Try Chrome on Android or Safari on iPhone.</p>
      ) : (
        <section className={`${ui.cardPad} space-y-3`}>
          <label className="block">
            <span className={ui.label}>What is it about?</span>
            <input
              className={ui.input}
              value={title}
              maxLength={120}
              placeholder="e.g. Newton's laws, in my words"
              onChange={(event) => setTitle(event.target.value)}
              disabled={recording}
              data-testid="voice-title"
            />
          </label>
          {recording ? (
            <button type="button" className={`${ui.primary} min-h-12 w-full`} onClick={stop} data-testid="voice-stop">
              <Square className="h-4 w-4" aria-hidden="true" /> Stop and save ({seconds}s of {MAX_RECORD_SECONDS}s)
            </button>
          ) : (
            <button
              type="button"
              className={`${ui.primary} min-h-12 w-full`}
              onClick={() => void start()}
              disabled={starting}
              data-testid="voice-record"
            >
              <Mic className="h-4 w-4" aria-hidden="true" /> {starting ? "Starting…" : "Record"}
            </button>
          )}
          {message ? <p className="text-sm text-muted" role="status">{message}</p> : null}
        </section>
      )}

      <section className="space-y-2" aria-label="Saved voice notes">
        {userId !== "local-anonymous" && !ready ? (
          <p className={ui.empty}>Opening your private voice notes…</p>
        ) : notes.length === 0 ? (
          <p className={ui.empty}>No voice notes yet.</p>
        ) : null}
        {notes.map((note) => (
          <article key={note.id} className="space-y-2 rounded-2xl border border-line bg-surface p-3" data-testid="voice-note">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-heading">{note.title}</h2>
                <p className="text-xs text-muted">
                  {Math.round(note.seconds)}s · {new Date(note.createdAt).toLocaleDateString("en-IN")}
                </p>
              </div>
              {confirmDelete === note.id ? (
                <div className="flex gap-1">
                  <button type="button" className={ui.ghost} onClick={() => setConfirmDelete(null)}>
                    Keep
                  </button>
                  <button
                    type="button"
                    className={ui.secondary}
                    onClick={() => void remove(note.id)}
                    data-testid="voice-delete-confirm"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={ui.iconBtn}
                  aria-label={`Delete ${note.title}`}
                  onClick={() => setConfirmDelete(note.id)}
                  data-testid="voice-delete"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <VoiceNotePlayer id={note.id} userId={userId} />
          </article>
        ))}
      </section>
    </main>
  );
}
