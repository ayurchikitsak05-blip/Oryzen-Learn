import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BASIC_PHYSICAL_PRAKRITI_QUESTIONS,
  computeScoresFromResponses,
  READING_COGNITIVE_QUESTIONS,
} from "../onboarding-questions";
import type { Dosha } from "../config";
import {
  buildInitialCognitiveDnaSummary,
  savePrakritiProfileToDatabase,
} from "@/lib/supabase/profile-sync";

describe("Layer 1: Prakriti Onboarding Questionnaire & Supabase Profile Sync", () => {
  it("provides 25 Basic Physical Prakriti questions and 20 Reading & Cognitive questions across all 5 cognitive domains", () => {
    expect(BASIC_PHYSICAL_PRAKRITI_QUESTIONS).toHaveLength(25);
    expect(READING_COGNITIVE_QUESTIONS).toHaveLength(20);

    const readingDomains = new Set(
      READING_COGNITIVE_QUESTIONS.map((q) => q.domainId)
    );
    expect(readingDomains).toEqual(
      new Set([
        "dhee_grasping",
        "dhriti_attention",
        "smriti_retention",
        "alochaka_pitta_screen_fatigue",
        "video_lecture_habits",
      ])
    );
  });

  it("computes normalized Dosha percentages from 25 physical and 20 reading question responses", () => {
    const physicalAnswers: Record<string, Dosha> = {};
    // 15 Pitta, 5 Vata, 5 Kapha -> 60% Pitta, 20% Vata, 20% Kapha
    BASIC_PHYSICAL_PRAKRITI_QUESTIONS.forEach((q, idx) => {
      if (idx < 15) physicalAnswers[q.id] = "Pitta";
      else if (idx < 20) physicalAnswers[q.id] = "Vata";
      else physicalAnswers[q.id] = "Kapha";
    });

    const basicScores = computeScoresFromResponses(
      BASIC_PHYSICAL_PRAKRITI_QUESTIONS,
      physicalAnswers
    );
    expect(basicScores).toEqual({
      Vata: 20,
      Pitta: 60,
      Kapha: 20,
    });

    const readingAnswers: Record<string, Dosha> = {};
    // 14 Vata, 4 Pitta, 2 Kapha -> 70% Vata, 20% Pitta, 10% Kapha
    READING_COGNITIVE_QUESTIONS.forEach((q, idx) => {
      if (idx < 14) readingAnswers[q.id] = "Vata";
      else if (idx < 18) readingAnswers[q.id] = "Pitta";
      else readingAnswers[q.id] = "Kapha";
    });

    const readingScores = computeScoresFromResponses(
      READING_COGNITIVE_QUESTIONS,
      readingAnswers
    );
    expect(readingScores).toEqual({
      Vata: 70,
      Pitta: 20,
      Kapha: 10,
    });
  });

  it("persists calculated Prakriti profile to Supabase `profiles.prakriti_profile` and initializes `student_cognitive_memory` (<= 200 words)", async () => {
    let upsertedProfileRow: Record<string, unknown> | null = null;
    let upsertedMemoryRow: Record<string, unknown> | null = null;

    const supabaseMock = {
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            upsert: vi.fn((payload: Record<string, unknown>) => {
              upsertedProfileRow = {
                ...payload,
                created_at: "2026-10-20T10:00:00.000Z",
              };
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: upsertedProfileRow,
                    error: null,
                  })),
                })),
              };
            }),
          };
        }
        if (table === "student_cognitive_memory") {
          return {
            upsert: vi.fn(async (payload: Record<string, unknown>) => {
              upsertedMemoryRow = payload;
              return { data: payload, error: null };
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    const saved = await savePrakritiProfileToDatabase(supabaseMock, {
      userId: "user-pitta-01",
      email: "student@university.edu",
      fullName: "Ananya Rao",
      basicScores: { Vata: 15, Pitta: 70, Kapha: 15 },
      readingScores: { Vata: 20, Pitta: 65, Kapha: 15 },
    });

    expect(saved.payload.calculated.classification).toBe("Pitta");
    expect(saved.payload.themePreference).toBe("--theme-pitta");
    expect(saved.profile.email).toBe("student@university.edu");
    expect(saved.profile.prakriti_profile?.calculated.primaryDosha).toBe(
      "Pitta"
    );

    const dna = buildInitialCognitiveDnaSummary(saved.payload.calculated);
    expect(dna.word_count).toBeGreaterThan(10);
    expect(dna.word_count).toBeLessThanOrEqual(200);
    expect(upsertedMemoryRow).not.toBeNull();
    expect(
      (upsertedMemoryRow?.cognitive_dna_summary as { primary_dosha: string })
        .primary_dosha
    ).toBe("Pitta");
  });
});
