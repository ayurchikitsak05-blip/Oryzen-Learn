import { COACH_MESSAGES } from "./messages";
import { rememberShown } from "./persist";
import type { CoachMessage, CoachTrigger, CoachVoiceId } from "./types";

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function messagesFor(style: CoachVoiceId, trigger: CoachTrigger): CoachMessage[] {
  return COACH_MESSAGES.filter((message) => message.style === style && message.trigger === trigger);
}

export function selectCoachMessage(input: {
  style: CoachVoiceId;
  trigger: CoachTrigger;
  recentIds?: string[];
  excludeIds?: string[];
  seed?: string;
  rotate?: boolean;
  cachedId?: string;
}): CoachMessage | null {
  const recent = new Set(input.recentIds ?? []);
  const excluded = new Set(input.excludeIds ?? []);
  if (input.rotate && input.cachedId) excluded.add(input.cachedId);

  if (!input.rotate && input.cachedId) {
    const cached = COACH_MESSAGES.find((message) => message.id === input.cachedId);
    if (cached && cached.style === input.style && cached.trigger === input.trigger) {
      return cached;
    }
  }

  const pickFrom = (style: CoachVoiceId, dropRecent: boolean): CoachMessage | null => {
    const pool = messagesFor(style, input.trigger).filter((message) => {
      if (excluded.has(message.id)) return false;
      if (dropRecent && recent.has(message.id)) return false;
      return true;
    });
    if (pool.length === 0) return null;
    const seed = `${input.seed ?? "oryzen"}::${style}::${input.trigger}::${input.rotate ? "rotate" : "stable"}`;
    const index = hashSeed(seed) % pool.length;
    return pool[index] ?? null;
  };

  const primary = pickFrom(input.style, true) ?? pickFrom(input.style, false);
  if (primary) return primary;
  if (input.style !== "balanced_support") {
    return pickFrom("balanced_support", true) ?? pickFrom("balanced_support", false);
  }
  return null;
}

export function selectAndRemember(input: {
  style: CoachVoiceId;
  trigger: CoachTrigger;
  userId?: string | null;
  day: string;
  recentIds?: string[];
  excludeIds?: string[];
  cachedId?: string;
  rotate?: boolean;
}): CoachMessage | null {
  const message = selectCoachMessage({
    style: input.style,
    trigger: input.trigger,
    recentIds: input.recentIds,
    excludeIds: input.excludeIds,
    seed: `${input.userId ?? "local"}::${input.day}`,
    rotate: input.rotate,
    cachedId: input.cachedId,
  });
  if (message) {
    rememberShown(message.id, input.userId, input.trigger, input.day);
  }
  return message;
}

export function coachSelectorImportsPaidProvider(): boolean {
  return false;
}
