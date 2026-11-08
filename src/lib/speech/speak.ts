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

let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesHooked = false;

function voices(): SpeechSynthesisVoice[] {
  if (!voicesHooked && speechSupported()) {
    voicesHooked = true;
    // Chrome loads voices a moment later; keep the list fresh.
    window.speechSynthesis.addEventListener?.("voiceschanged", () => {
      cachedVoices = window.speechSynthesis.getVoices();
    });
  }
  const now = window.speechSynthesis.getVoices();
  if (now.length) cachedVoices = now;
  return cachedVoices;
}

/** Splits long text at sentence ends into pieces Chrome will finish (it stops ~15 s into one piece). */
export function speechChunks(text: string, max = 220): string[] {
  const sentences = text.match(/[^.!?।]+[.!?।]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > max && current) {
      chunks.push(current.trim());
      current = "";
    }
    if (sentence.length > max) {
      for (let i = 0; i < sentence.length; i += max) chunks.push(sentence.slice(i, i + max).trim());
      continue;
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const list = voices();
  return (
    list.find((voice) => voice.lang === lang) ??
    list.find((voice) => voice.lang.startsWith(lang.slice(0, 2)) && voice.lang.endsWith("IN")) ??
    list.find((voice) => voice.lang.startsWith(lang.slice(0, 2)))
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
  const synth = window.speechSynthesis;
  const busy = synth.speaking || synth.pending;
  synth.cancel();
  const lang = languageFor(clean);
  const voice = pickVoice(lang);
  const pieces = speechChunks(clean);
  speakingId = id;
  announce();
  const queue = () => {
    if (speakingId !== id) return;
    pieces.forEach((piece, index) => {
      const utterance = new window.SpeechSynthesisUtterance(piece);
      utterance.lang = lang;
      if (voice) utterance.voice = voice;
      utterance.rate = rate;
      if (index === pieces.length - 1) {
        utterance.onend = () => {
          if (speakingId === id) {
            speakingId = null;
            announce();
          }
        };
        utterance.onerror = utterance.onend;
      }
      synth.speak(utterance);
    });
  };
  // Android Chrome can drop speech queued straight after cancel(); give it a moment.
  if (busy) window.setTimeout(queue, 80);
  else queue();
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
