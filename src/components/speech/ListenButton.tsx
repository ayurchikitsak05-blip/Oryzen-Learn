"use client";

import React, { useEffect, useId, useState } from "react";
import { Square, Volume2 } from "lucide-react";
import { currentSpeechId, speak, SPEECH_EVENT, speechSupported, stopSpeaking, voiceGuideOn } from "@/lib/speech/speak";

/** "Listen" / "Stop" for any text. Hidden where the browser has no voice. */
export function ListenButton({
  text,
  label = "Listen",
  className = "",
  testId = "listen-button",
}: {
  text: string;
  label?: string;
  className?: string;
  testId?: string;
}) {
  const id = useId();
  const [supported, setSupported] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setSupported(speechSupported());
    const sync = () => setPlaying(currentSpeechId() === id);
    window.addEventListener(SPEECH_EVENT, sync);
    return () => {
      window.removeEventListener(SPEECH_EVENT, sync);
      if (currentSpeechId() === id) stopSpeaking();
    };
  }, [id]);

  if (!supported || !text.trim()) return null;
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={playing}
      onClick={() => (playing ? stopSpeaking() : speak(text, id))}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium text-heading hover:bg-beige-2 ${className}`}
    >
      {playing ? <Square className="h-3.5 w-3.5" aria-hidden="true" /> : <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />}
      {playing ? "Stop" : label}
    </button>
  );
}

/**
 * Spoken guidance for a step. Shows "Hear this step"; when "Read each step aloud" is on in
 * Personalize, it also speaks by itself when the step appears (after the student's tap).
 */
export function StepVoice({ text, stepKey }: { text: string; stepKey: string }) {
  useEffect(() => {
    if (!voiceGuideOn() || !speechSupported()) return;
    const timer = window.setTimeout(() => speak(text, `step-${stepKey}`), 150);
    return () => window.clearTimeout(timer);
  }, [text, stepKey]);
  return <ListenButton text={text} label="Hear this step" testId="step-voice" />;
}
