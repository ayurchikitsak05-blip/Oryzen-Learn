import type { FocusSoundId, FocusSoundSource } from "./types";

export interface FocusSoundCatalogEntry {
  id: FocusSoundId;
  label: string;
  hint: string;
  source: FocusSoundSource;
}

export const FOCUS_SOUND_CATALOG: FocusSoundCatalogEntry[] = [
  { id: "silence", label: "Silence", hint: "No sound. The default.", source: "generated" },
  { id: "rain", label: "Rain", hint: "Soft generated rain. Not a recording.", source: "generated" },
  {
    id: "water",
    label: "Flowing water",
    hint: "A generated stream. Not a licensed track.",
    source: "generated",
  },
  {
    id: "forest",
    label: "Forest",
    hint: "Gentle generated leaves and air. Not birdsong from a record.",
    source: "generated",
  },
  {
    id: "white",
    label: "Soft white noise",
    hint: "Generated noise. Off until you press play.",
    source: "generated",
  },
];

function fillWhite(data: Float32Array): void {
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
}

function fillBrown(data: Float32Array): void {
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    last = Math.max(-1, Math.min(1, last + (Math.random() * 2 - 1) * 0.02));
    data[i] = last;
  }
}

function noiseBuffer(
  ctx: AudioContext,
  kind: "white" | "brown",
  seconds = 2
): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  if (kind === "brown") fillBrown(data);
  else fillWhite(data);
  return buffer;
}

function loopSource(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.start();
  return source;
}

export class FocusSoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private timers: number[] = [];
  private playing = false;
  private muted = false;
  private volume = 0.35;
  private sound: FocusSoundId = "silence";

  isPlaying(): boolean {
    return this.playing;
  }

  currentSound(): FocusSoundId {
    return this.sound;
  }

  getVolume(): number {
    return this.volume;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  async play(sound: FocusSoundId): Promise<void> {
    if (sound === "silence") {
      this.stop();
      return;
    }
    this.teardownGraph();
    this.sound = sound;
    const ctx = this.ensureContext();
    await ctx.resume();
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.playing = true;
    this.applyGain();
    this.buildGraph(ctx, sound);
  }

  stop(): void {
    this.teardownGraph();
    this.playing = false;
    this.sound = "silence";
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error("Web Audio is not available in this browser.");
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  private applyGain(): void {
    if (!this.master) return;
    this.master.gain.value = this.muted || !this.playing ? 0 : this.volume * 0.22;
  }

  private buildGraph(ctx: AudioContext, sound: FocusSoundId): void {
    const filter = ctx.createBiquadFilter();
    filter.type = sound === "white" ? "lowpass" : sound === "water" ? "lowpass" : "bandpass";
    filter.frequency.value = sound === "rain" ? 1200 : sound === "water" ? 500 : sound === "forest" ? 700 : 1800;
    filter.Q.value = sound === "rain" ? 0.7 : 0.4;
    const source = loopSource(ctx, noiseBuffer(ctx, sound === "white" || sound === "rain" ? "white" : "brown"));
    source.connect(filter);
    filter.connect(this.master as GainNode);
    this.nodes.push(source, filter);

    if (sound === "forest" && this.master) {
      const chirp = () => {
        if (!this.ctx || !this.master || this.sound !== "forest") return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = 1800 + Math.random() * 600;
        gain.gain.value = 0.01;
        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.08);
        this.nodes.push(osc, gain);
      };
      this.timers.push(window.setInterval(chirp, 7000));
    }
  }

  private teardownGraph(): void {
    this.timers.forEach((id) => window.clearInterval(id));
    this.timers = [];
    this.nodes.forEach((node) => {
      try {
        if ("stop" in node && typeof node.stop === "function") node.stop();
        node.disconnect();
      } catch {
        /* already stopped */
      }
    });
    this.nodes = [];
    if (this.master) {
      try {
        this.master.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.master = null;
  }
}

export const focusSounds = new FocusSoundEngine();
