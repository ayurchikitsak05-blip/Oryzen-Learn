import {
  openingCompanionTurn,
  readCompanionStore,
  STARTER_COMPANIONS,
  writeCompanionStore,
  type CompanionMember,
} from "@/lib/companion";
import { applyThemeToDocument, readRhythmPrefs, writeRhythmPrefs } from "@/lib/rhythm/persist";
import { patchSprintPrefs } from "@/lib/sprint/persist";
import { buildDayPlan, rescheduleMissedPlan } from "./plan";
import { prefsFromPreset, suggestUniverseProfile, UNIVERSE_PRESETS } from "./presets";
import { readDayPlan, readUniversePrefs, writeDayPlan, writeUniversePrefs } from "./persist";
import { DEFAULT_UNIVERSE_PREFS, type UniversePrefs, type UniverseProfileId } from "./types";
import { readLocalPrakritiProfile } from "@/lib/supabase/profile-sync";

export function recommendedProfileForStudent(userId?: string | null): UniverseProfileId {
  const profile = readLocalPrakritiProfile(userId);
  return suggestUniverseProfile({
    canonicalType: profile?.calculated?.canonicalType,
    classification: profile?.calculated?.classification,
    scores: profile?.calculated?.basicScoresNormalized ?? profile?.basicScores,
  });
}

function applyTheme(themeId: UniversePrefs["themeId"]): void {
  const next = writeRhythmPrefs({
    ...readRhythmPrefs(),
    themeId,
    suggestionState: "applied",
  });
  applyThemeToDocument(next.themeId);
}

function applyCompanion(prefs: UniversePrefs, userId?: string | null): void {
  const current = readCompanionStore(userId);
  const custom = current.collection.filter(
    (member) => !STARTER_COMPANIONS.some((starter) => starter.id === member.id)
  );
  const collection: CompanionMember[] = [
    ...STARTER_COMPANIONS.map((member) => ({ ...member })),
    ...custom,
  ];
  const active =
    collection.find((member) => member.style === prefs.companionStyle) ?? collection[0];
  writeCompanionStore(
    {
      version: 1,
      prefs: {
        version: 1,
        name: active.name,
        style: active.style,
        character: active.character,
        onboarded: true,
      },
      turns: [
        openingCompanionTurn({
          version: 1,
          name: active.name,
          style: active.style,
          character: active.character,
          onboarded: true,
        }),
      ],
      collection,
      activeId: active.id,
    },
    userId
  );
}

function applySprint(prefs: UniversePrefs, userId?: string | null): void {
  const preset = UNIVERSE_PRESETS[prefs.profileId];
  patchSprintPrefs(
    {
      dailyTargetMinutes: prefs.dailyGoalMinutes,
      preferredDuration: prefs.sessionMinutes,
      preferredBreakMinutes: prefs.breakMinutes,
      rhythm: preset.sprintRhythm,
    },
    userId
  );
}

export function applyUniversePreset(
  profileId: UniverseProfileId,
  userId?: string | null,
  options?: { dailyGoalMinutes?: number; customized?: boolean }
): { prefs: UniversePrefs } {
  const preset = UNIVERSE_PRESETS[profileId];
  const current = readUniversePrefs(userId);
  const prefs = writeUniversePrefs(
    prefsFromPreset(preset, {
      activated: true,
      skipped: false,
      customized: Boolean(options?.customized),
      dailyGoalMinutes: options?.dailyGoalMinutes ?? current.dailyGoalMinutes,
    }),
    userId
  );
  applyTheme(prefs.themeId);
  applySprint(prefs, userId);
  applyCompanion(prefs, userId);
  writeDayPlan(buildDayPlan({ prefs }), userId);
  return { prefs };
}

export function customizeUniverse(
  patch: Partial<UniversePrefs>,
  userId?: string | null
): UniversePrefs {
  const current = readUniversePrefs(userId);
  const prefs = writeUniversePrefs(
    {
      ...current,
      ...patch,
      activated: true,
      skipped: false,
      customized: true,
    },
    userId
  );
  applyTheme(prefs.themeId);
  applySprint(prefs, userId);
  if (patch.companionStyle && patch.companionStyle !== current.companionStyle) {
    applyCompanion(prefs, userId);
  }
  writeDayPlan(buildDayPlan({ prefs }), userId);
  return prefs;
}

export function resetUniversePreset(userId?: string | null): UniversePrefs {
  const current = readUniversePrefs(userId);
  return applyUniversePreset(current.profileId, userId, {
    dailyGoalMinutes: current.dailyGoalMinutes,
    customized: false,
  }).prefs;
}

export function skipUniverse(userId?: string | null): UniversePrefs {
  const prefs = writeUniversePrefs(
    {
      ...DEFAULT_UNIVERSE_PREFS,
      skipped: true,
      activated: false,
    },
    userId
  );
  applyTheme("classic");
  return prefs;
}

export function deactivateUniverse(userId?: string | null): UniversePrefs {
  const current = readUniversePrefs(userId);
  const prefs = writeUniversePrefs(
    {
      ...current,
      activated: false,
      skipped: true,
      soundEnabled: false,
      focusSound: "silence",
    },
    userId
  );
  applyTheme("classic");
  return prefs;
}

export function rebuildUniversePlan(
  userId?: string | null,
  options?: { missed?: boolean }
) {
  const prefs = readUniversePrefs(userId);
  const previous = readDayPlan(userId);
  const plan = options?.missed
    ? rescheduleMissedPlan({ prefs, previous })
    : buildDayPlan({ prefs });
  return writeDayPlan(plan, userId);
}
