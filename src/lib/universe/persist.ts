import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";
import { scopedReaderStorageKey } from "@/lib/reader/local-scope";
import { isThemeId } from "@/lib/rhythm/themes";
import { nearestDuration } from "@/lib/sprint/plan";
import { COMPANION_STYLES, type CompanionStyle } from "@/lib/companion/types";
import { isUniverseProfileId } from "./presets";
import {
  DEFAULT_UNIVERSE_PREFS,
  EXPLANATION_FORMATS,
  FOCUS_SOUND_IDS,
  NOTE_STYLES,
  REMINDER_FREQUENCIES,
  REMINDER_TONES,
  UNIVERSE_PLAN_STORAGE_KEY,
  UNIVERSE_STORAGE_KEY,
  type DayPlan,
  type DayPlanBlock,
  type DayPlanKind,
  type ExplanationFormat,
  type FocusSoundId,
  type ReminderFrequency,
  type ReminderTone,
  type UniverseNoteStyle,
  type UniversePrefs,
} from "./types";

/**
 * CROSS-DEVICE MIGRATION (NOT APPLIED)
 *
 * Reliable signed-in sync would need a per-student table, for example:
 *
 *   create table public.student_universe_prefs (
 *     user_id uuid primary key references auth.users (id) on delete cascade,
 *     prefs jsonb not null default '{}'::jsonb,
 *     day_plan jsonb,
 *     updated_at timestamptz not null default now()
 *   );
 *   alter table public.student_universe_prefs enable row level security;
 *   create policy "student reads own universe"
 *     on public.student_universe_prefs for all
 *     using (auth.uid() = user_id)
 *     with check (auth.uid() = user_id);
 *
 * No live database migration has been applied. This store is local and scoped
 * per student so existing isolation is not changed. Do not copy unscoped keys.
 */
export function universeStorageKey(userId?: string | null): string {
  return scopedReaderStorageKey(UNIVERSE_STORAGE_KEY, userId);
}

export function universePlanStorageKey(userId?: string | null): string {
  return scopedReaderStorageKey(UNIVERSE_PLAN_STORAGE_KEY, userId);
}

function inList<T extends string>(value: unknown, list: readonly T[]): T | null {
  return typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function clampEmphasis(value: unknown, fallback: number): number {
  const next = typeof value === "number" ? value : fallback;
  return Math.min(3, Math.max(0, Math.round(next)));
}

export function sanitizeUniversePrefs(value: unknown): UniversePrefs {
  if (!value || typeof value !== "object") return { ...DEFAULT_UNIVERSE_PREFS };
  const raw = value as Partial<UniversePrefs>;
  return {
    version: 1,
    activated: Boolean(raw.activated),
    customized: Boolean(raw.customized),
    skipped: Boolean(raw.skipped),
    profileId: isUniverseProfileId(raw.profileId) ? raw.profileId : DEFAULT_UNIVERSE_PREFS.profileId,
    themeId: isThemeId(raw.themeId) ? raw.themeId : DEFAULT_UNIVERSE_PREFS.themeId,
    sessionMinutes: nearestDuration(raw.sessionMinutes ?? DEFAULT_UNIVERSE_PREFS.sessionMinutes),
    breakMinutes: Math.min(15, Math.max(3, Math.round(raw.breakMinutes ?? DEFAULT_UNIVERSE_PREFS.breakMinutes))),
    reminderTone: inList<ReminderTone>(raw.reminderTone, REMINDER_TONES) ?? DEFAULT_UNIVERSE_PREFS.reminderTone,
    reminderFrequency:
      inList<ReminderFrequency>(raw.reminderFrequency, REMINDER_FREQUENCIES) ??
      DEFAULT_UNIVERSE_PREFS.reminderFrequency,
    explanationFormat:
      inList<ExplanationFormat>(raw.explanationFormat, EXPLANATION_FORMATS) ??
      DEFAULT_UNIVERSE_PREFS.explanationFormat,
    storyEmphasis: clampEmphasis(raw.storyEmphasis, DEFAULT_UNIVERSE_PREFS.storyEmphasis),
    illustrationEmphasis: clampEmphasis(raw.illustrationEmphasis, DEFAULT_UNIVERSE_PREFS.illustrationEmphasis),
    diagramEmphasis: clampEmphasis(raw.diagramEmphasis, DEFAULT_UNIVERSE_PREFS.diagramEmphasis),
    revisionEmphasis: clampEmphasis(raw.revisionEmphasis, DEFAULT_UNIVERSE_PREFS.revisionEmphasis),
    noteStyle: inList<UniverseNoteStyle>(raw.noteStyle, NOTE_STYLES) ?? DEFAULT_UNIVERSE_PREFS.noteStyle,
    companionStyle:
      inList<CompanionStyle>(raw.companionStyle, COMPANION_STYLES) ?? DEFAULT_UNIVERSE_PREFS.companionStyle,
    focusSound: inList<FocusSoundId>(raw.focusSound, FOCUS_SOUND_IDS) ?? DEFAULT_UNIVERSE_PREFS.focusSound,
    focusVolume: Math.min(1, Math.max(0, Number(raw.focusVolume ?? DEFAULT_UNIVERSE_PREFS.focusVolume))),
    focusMuted: Boolean(raw.focusMuted),
    soundEnabled: Boolean(raw.soundEnabled),
    dailyGoalMinutes: Math.min(360, Math.max(15, Math.round(raw.dailyGoalMinutes ?? DEFAULT_UNIVERSE_PREFS.dailyGoalMinutes))),
  };
}

const PLAN_KINDS: readonly DayPlanKind[] = ["focus", "break", "revision", "quiz", "buffer"];

function sanitizeBlock(value: unknown, index: number): DayPlanBlock | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DayPlanBlock>;
  const kind = inList<DayPlanKind>(raw.kind, PLAN_KINDS);
  if (!kind || typeof raw.minutes !== "number" || raw.minutes < 1) return null;
  return {
    id: typeof raw.id === "string" ? raw.id : `${kind}-${index + 1}`,
    kind,
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : kind,
    minutes: Math.round(raw.minutes),
    startOffsetMinutes: Math.max(0, Math.round(raw.startOffsetMinutes ?? 0)),
  };
}

export function sanitizeDayPlan(value: unknown): DayPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DayPlan>;
  if (typeof raw.date !== "string" || !raw.date) return null;
  const blocks = Array.isArray(raw.blocks)
    ? raw.blocks.map(sanitizeBlock).filter((item): item is DayPlanBlock => Boolean(item))
    : [];
  if (!blocks.length) return null;
  return {
    date: raw.date.slice(0, 10),
    dailyGoalMinutes: Math.min(360, Math.max(15, Math.round(raw.dailyGoalMinutes ?? 90))),
    profileId: isUniverseProfileId(raw.profileId) ? raw.profileId : "balanced",
    blocks,
    nextSuggestedSession:
      typeof raw.nextSuggestedSession === "string"
        ? raw.nextSuggestedSession
        : "Next suggested session: another focus block.",
    missedRescheduled: Boolean(raw.missedRescheduled),
  };
}

export function readUniversePrefs(userId?: string | null): UniversePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_UNIVERSE_PREFS };
  try {
    const raw = readPrivateString(UNIVERSE_STORAGE_KEY, userId);
    if (!raw) return { ...DEFAULT_UNIVERSE_PREFS };
    return sanitizeUniversePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_UNIVERSE_PREFS };
  }
}

export function writeUniversePrefs(prefs: UniversePrefs, userId?: string | null): UniversePrefs {
  const next = sanitizeUniversePrefs(prefs);
  if (typeof window !== "undefined") {
    writePrivateString(UNIVERSE_STORAGE_KEY, JSON.stringify(next), userId);
  }
  return next;
}

export function readDayPlan(userId?: string | null): DayPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readPrivateString(UNIVERSE_PLAN_STORAGE_KEY, userId);
    if (!raw) return null;
    return sanitizeDayPlan(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeDayPlan(plan: DayPlan, userId?: string | null): DayPlan {
  if (typeof window !== "undefined") {
    writePrivateString(UNIVERSE_PLAN_STORAGE_KEY, JSON.stringify(plan), userId);
  }
  return plan;
}
