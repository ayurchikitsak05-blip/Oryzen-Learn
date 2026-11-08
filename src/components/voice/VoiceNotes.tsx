"use client";

import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { ui } from "@/components/ui/classes";
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

/** Plays one saved voice note (loads the audio from this device). */
export function VoiceNotePlayer({ id, userId }: { id: string; userId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let cancelled = false;
    void voiceNoteAudio(id, userId).then((blob) => {
      if (!blob || cancelled) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id, userId]);
  if (!url) return <p className="text-xs text-muted">This voice note is on another device.</p>;
  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <audio controls src={url} className="w-full" data-testid="voice-note-audio" />;
}

export function VoiceNotes() {
  const userId = useSignedInScope();
  const [notes, setNotes] = useState<VoiceNoteMeta[]>([]);
  const [title, setTitle] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [supported, setSupported] = useState(true);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const ticker = useRef<number | undefined>(undefined);

  useEffect(() => {
    setSupported(voiceNotesSupported());
    const load = () => void listVoiceNotes(userId).then(setNotes);
    load();
    window.addEventListener(VOICE_NOTES_EVENT, load);
    return () => window.removeEventListener(VOICE_NOTES_EVENT, load);
  }, [userId]);

  useEffect(
    () => () => {
      window.clearInterval(ticker.current);
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    },
    []
  );

  const stop = () => {
    window.clearInterval(ticker.current);
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  };

  const start = async () => {
    setMessage("");
    if (userId === "local-anonymous") {
      setMessage("Sign in to keep voice notes.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = pickAudioType((t) => MediaRecorder.isTypeSupported(t));
      const next = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      chunks.current = [];
      next.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunks.current, { type: next.mimeType || type || "audio/webm" });
        const length = (Date.now() - started.current) / 1000;
        if (blob.size === 0) return;
        void saveVoiceNote({ userId, title: title || `Voice note ${new Date().toLocaleDateString("en-IN")}`, seconds: length, type: blob.type, blob })
          .then(() => {
            setTitle("");
            setMessage("Saved on this phone. It will come up in Morning revision.");
          })
          .catch(() => setMessage("This browser couldn't save the recording."));
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
      setMessage("Microphone permission is needed. Allow it in your browser and try again.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6 md:py-10" data-testid="voice-notes">
      <header>
        <h1 className={`${ui.heading} text-3xl`}>Voice notes</h1>
        <p className="mt-2 text-sm text-muted">
          Say a formula, a definition or a list in your own voice (up to 2 minutes). Hearing yourself is a strong way
          to revise. Saved only on this phone; they come up in Morning revision.
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
            <button type="button" className={`${ui.primary} min-h-12 w-full`} onClick={() => void start()} data-testid="voice-record">
              <Mic className="h-4 w-4" aria-hidden="true" /> Record
            </button>
          )}
          {message ? <p className="text-sm text-muted" role="status">{message}</p> : null}
        </section>
      )}

      <section className="space-y-2" aria-label="Saved voice notes">
        {notes.length === 0 ? <p className={ui.empty}>No voice notes yet.</p> : null}
        {notes.map((note) => (
          <article key={note.id} className="space-y-2 rounded-2xl border border-line bg-surface p-3" data-testid="voice-note">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-heading">{note.title}</h2>
                <p className="text-xs text-muted">
                  {Math.round(note.seconds)}s · {new Date(note.createdAt).toLocaleDateString("en-IN")}
                </p>
              </div>
              <button
                type="button"
                className={ui.iconBtn}
                aria-label={`Delete ${note.title}`}
                onClick={() => void deleteVoiceNote(note.id, userId)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <VoiceNotePlayer id={note.id} userId={userId} />
          </article>
        ))}
      </section>
    </main>
  );
}
