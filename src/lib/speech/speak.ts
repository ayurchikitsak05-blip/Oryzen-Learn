/**
 * Read text aloud with the phone's or computer's own voice (Web Speech API). Free: no AI,
 * no network. Indian English is preferred; Hindi when the text is mostly Devanagari.
 */

export const VOICE_GUIDE_KEY = "oryzen_voice_guide_v1";
export const SPEECH_EVENT = "oryzen-speech-changed";

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

/** Markdown and symbols out, so the voice doesn't read "asterisk" or "hash". */
export function plainForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_`>|~]/g, " ")
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

export function languageFor(text: string): "hi-IN" | "en-IN" {
  const devanagari = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const letters = (text.match(/[A-Za-zऀ-ॿ]/g) ?? []).length;
  return letters > 0 && devanagari / letters > 0.4 ? "hi-IN" : "en-IN";
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang === lang) ??
    voices.find((voice) => voice.lang.startsWith(lang.slice(0, 2)) && voice.lang.endsWith("IN")) ??
    voices.find((voice) => voice.lang.startsWith(lang.slice(0, 2)))
  );
}

let speakingId: string | null = null;

export function currentSpeechId(): string | null {
  return speakingId;
}

function announce() {
  window.dispatchEvent(new Event(SPEECH_EVENT));
}

export function stopSpeaking(): void {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  speakingId = null;
  announce();
}

/** Speaks `text`; a new call stops whatever was playing. Returns false when speech isn't available. */
export function speak(text: string, id = "speech", rate = 0.95): boolean {
  if (!speechSupported()) return false;
  const clean = plainForSpeech(text);
  if (!clean) return false;
  window.speechSynthesis.cancel();
  const utterance = new window.SpeechSynthesisUtterance(clean);
  const lang = languageFor(clean);
  utterance.lang = lang;
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;
  utterance.rate = rate;
  utterance.onend = () => {
    if (speakingId === id) {
      speakingId = null;
      announce();
    }
  };
  utterance.onerror = utterance.onend;
  speakingId = id;
  window.speechSynthesis.speak(utterance);
  announce();
  return true;
}

/** "Read each step aloud" (Personalize). Off unless the student turns it on. */
export function voiceGuideOn(): boolean {
  try {
    return window.localStorage.getItem(VOICE_GUIDE_KEY) === "on";
  } catch {
    return false;
  }
}

export function setVoiceGuide(on: boolean): void {
  try {
    window.localStorage.setItem(VOICE_GUIDE_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}
