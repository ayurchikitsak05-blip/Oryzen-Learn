import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculatePrakritiProfile,
  type CalculatedPrakritiProfile,
  type DoshaScores,
} from "@/lib/prakriti/config";
import { readPrivateString, writePrivateString } from "@/lib/privacy/account-vault";
import { scopedReaderStorageKey } from "@/lib/reader/local-scope";
import type {
  CognitiveDnaCardJson,
  ProfileRow,
  StoredPrakritiProfilePayload,
} from "./types";

export const LOCAL_PRAKRITI_STORAGE_KEY =
  "prakriti_study_ai_onboarding_profile_v1";

export type LocalPrakritiRecord = StoredPrakritiProfilePayload & {
  userId?: string | null;
  fullName?: string | null;
  cognitiveDna?: CognitiveDnaCardJson;
};

export function localPrakritiStorageKey(userId?: string | null): string {
  return scopedReaderStorageKey(LOCAL_PRAKRITI_STORAGE_KEY, userId);
}

export function unclaimedLegacyPrakritiExists(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(LOCAL_PRAKRITI_STORAGE_KEY));
}

export function readLocalPrakritiProfile(
  userId?: string | null
): LocalPrakritiRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readPrivateString(LOCAL_PRAKRITI_STORAGE_KEY, userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalPrakritiRecord;
    if (parsed.userId && userId && parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLocalPrakritiProfile(
  payload: LocalPrakritiRecord,
  userId?: string | null
): void {
  if (typeof window === "undefined") return;
  writePrivateString(LOCAL_PRAKRITI_STORAGE_KEY, JSON.stringify(payload), userId);
}

/**
 * Builds the initial 200-word-bounded Student Cognitive DNA Card from the calculated Prakriti profile
 * for storage in `student_cognitive_memory`.
 */
export function buildInitialCognitiveDnaSummary(
  calculated: CalculatedPrakritiProfile
): CognitiveDnaCardJson {
  const {
    classification,
    primaryDosha,
    secondaryDosha,
    activeConfiguration,
    isDwandwaja,
  } = calculated;

  const summarySentences = [
    `Student Cognitive DNA (${classification}, ${
      isDwandwaja ? "Dwandwaja Dual-Dosha" : "Single-Dosha Dominant"
    }): Primary cognitive grasping (Dhee) and retention (Smriti) follow ${primaryDosha} pedagogy.`,
    `Default AI explanation lens is ${activeConfiguration.defaultHighlightLens} using ${activeConfiguration.aiPedagogyDefaults.join(
      ", "
    )}.`,
    `Reader UI is configured to ${activeConfiguration.readerLayoutLabel} with ${activeConfiguration.theme.name} theme (${activeConfiguration.theme.backgroundHex}).`,
    `Study endurance (Dhriti) and ocular protection (Alochaka Pitta) follow a ${
      activeConfiguration.pomodoro.studySprintMinutes
    }-minute sprint and ${
      activeConfiguration.pomodoro.breakMinutes
    }-minute break cadence${
      secondaryDosha ? ` governed by secondary ${secondaryDosha}` : ""
    }.`,
    `Prescribed Dinacharya break: ${activeConfiguration.dinacharyaBreak.summary}`,
  ];

  const summaryText = summarySentences.join(" ");
  const words = summaryText.trim().split(/\s+/);
  const boundedText =
    words.length <= 200 ? summaryText : words.slice(0, 200).join(" ");

  return {
    summary_text: boundedText,
    word_count: Math.min(words.length, 200),
    primary_dosha: primaryDosha,
    classification,
    preferred_lens: activeConfiguration.defaultHighlightLens,
    signals: {
      detail_additions: 0,
      simplifications: 0,
      illustrative_requests: 0,
      video_rewind_count: 0,
    },
    generated_at: new Date().toISOString(),
  };
}

/**
 * Constructs the canonical `StoredPrakritiProfilePayload` stored in `profiles.prakriti_profile`.
 */
export function buildStoredPrakritiPayload(
  basicScores: DoshaScores,
  readingScores: DoshaScores
): StoredPrakritiProfilePayload {
  const calculated = calculatePrakritiProfile(basicScores, readingScores);
  return {
    version: 1,
    completedAt: new Date().toISOString(),
    basicScores: calculated.basicScoresNormalized,
    readingScores: calculated.readingScoresNormalized,
    calculated,
    themePreference: calculated.activeConfiguration.theme.cssVariable,
  };
}

/**
 * Persists the student's Prakriti Onboarding result to the Supabase `profiles` table
 * (`prakriti_profile` JSONB column) and initializes `student_cognitive_memory`.
 */
export async function savePrakritiProfileToDatabase(
  supabase: SupabaseClient,
  params: {
    userId: string;
    email: string;
    fullName?: string | null;
    organizationId?: string | null;
    basicScores: DoshaScores;
    readingScores: DoshaScores;
  }
): Promise<{
  profile: ProfileRow;
  payload: StoredPrakritiProfilePayload;
  cognitiveDna: CognitiveDnaCardJson;
}> {
  if (!params.userId || !params.email) {
    throw new Error(
      "userId and email are required to save the Prakriti profile."
    );
  }

  const payload = buildStoredPrakritiPayload(
    params.basicScores,
    params.readingScores
  );
  const cognitiveDna = buildInitialCognitiveDnaSummary(payload.calculated);
  const nowIso = new Date().toISOString();

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: params.userId,
        email: params.email,
        full_name: params.fullName ?? null,
        organization_id: params.organizationId ?? null,
        prakriti_profile: payload,
        updated_at: nowIso,
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (profileError || !profileData) {
    throw new Error(
      `Failed to save prakriti_profile to profiles table: ${
        profileError?.message ?? "No profile row returned"
      }`
    );
  }

  const { error: memoryError } = await supabase
    .from("student_cognitive_memory")
    .upsert(
      {
        user_id: params.userId,
        cognitive_dna_summary: cognitiveDna,
        updated_at: nowIso,
      },
      { onConflict: "user_id" }
    );

  if (memoryError) {
    throw new Error(
      `Failed to initialize student_cognitive_memory: ${memoryError.message}`
    );
  }

  return {
    profile: profileData as ProfileRow,
    payload,
    cognitiveDna,
  };
}
