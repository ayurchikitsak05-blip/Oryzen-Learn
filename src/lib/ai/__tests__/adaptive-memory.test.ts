import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyOneTapNoteModification,
  buildRollingCognitiveDnaCard,
  clearLocalAdaptiveMemory,
  MAX_COGNITIVE_DNA_WORDS,
  recordCognitiveTelemetryEvent,
} from "../adaptive-memory";
import {
  DEFAULT_SYNTHESIS_SOURCES,
  DEFAULT_VIDEO_LECTURES,
  synthesizeMasterStudyBook,
} from "@/lib/synthesis/master-book";

describe("Layer 4: Adaptive Note Modification, Cognitive Memory Engine & Multi-Source Synthesis", () => {
  beforeEach(() => {
    clearLocalAdaptiveMemory();
  });

  describe("1. 1-Tap Student Note Modification (`applyOneTapNoteModification`)", () => {
    const baseNote =
      "A net force changes momentum in proportion to mass and acceleration.";

    it("supports all 5 1-tap note modifications while preserving timestamp/page citations", () => {
      const expanded = applyOneTapNoteModification({
        originalText: baseNote,
        action: "add_detail",
        citationBadge: "[04:18]",
        prakritiDosha: "Pitta",
      });
      expect(expanded).toContain("Expanded Study Detail");
      expect(expanded).toContain("[04:18]");

      const simplified = applyOneTapNoteModification({
        originalText: baseNote,
        action: "subtract_detail",
        citationBadge: "[04:18]",
      });
      expect(simplified).toContain("Core High-Yield Essence [04:18]");

      const illustrative = applyOneTapNoteModification({
        originalText: baseNote,
        action: "illustrative_example",
        citationBadge: "[04:18]",
      });
      expect(illustrative).toContain("Illustrative Analogy ([04:18])");

      const ayurvedic = applyOneTapNoteModification({
        originalText: baseNote,
        action: "ayurvedic_lens",
        citationBadge: "[04:18]",
      });
      expect(ayurvedic).toContain("Constitution Correlation ([04:18])");

      const tableFlow = applyOneTapNoteModification({
        originalText: baseNote,
        action: "convert_table_flowchart",
        citationBadge: "[04:18]",
      });
      expect(tableFlow).toContain("Structured Flowchart & Differential View");
      expect(tableFlow).toContain("[04:18]");
    });
  });

  describe("2. Adaptive Cognitive Memory Engine (`student_cognitive_memory`)", () => {
    it("logs note edits and video rewind friction, updates Supabase `student_cognitive_memory`, and enforces <= 200 words", async () => {
      let upsertedMemoryRow: Record<string, unknown> | null = null;
      const supabaseMock = {
        from: vi.fn((table: string) => {
          if (table !== "student_cognitive_memory") {
            throw new Error(`Unexpected table ${table}`);
          }
          return {
            upsert: vi.fn(async (payload: Record<string, unknown>) => {
              upsertedMemoryRow = payload;
              return { data: payload, error: null };
            }),
          };
        }),
      } as unknown as SupabaseClient;

      await recordCognitiveTelemetryEvent({
        userId: "student-dna-01",
        eventType: "convert_table_flowchart",
        prakritiDosha: "Pitta",
        contextLabel: "[03:00]",
        supabase: supabaseMock,
      });

      await recordCognitiveTelemetryEvent({
        userId: "student-dna-01",
        eventType: "convert_table_flowchart",
        prakritiDosha: "Pitta",
        contextLabel: "[04:18]",
        supabase: supabaseMock,
      });

      await recordCognitiveTelemetryEvent({
        userId: "student-dna-01",
        eventType: "video_rewind_friction",
        prakritiDosha: "Pitta",
        contextLabel: "[04:18]",
        supabase: supabaseMock,
      });

      const finalDna = await recordCognitiveTelemetryEvent({
        userId: "student-dna-01",
        eventType: "video_rewind_friction",
        prakritiDosha: "Pitta",
        contextLabel: "[04:18]",
        supabase: supabaseMock,
      });

      expect(finalDna.signals.table_flowchart_conversions).toBe(2);
      expect(finalDna.signals.video_rewind_count).toBe(2);
      expect(finalDna.signals.last_friction_timestamp_label).toBe("[04:18]");
      expect(finalDna.preferred_lens).toBe("high_yield_revision");
      expect(finalDna.word_count).toBeLessThanOrEqual(MAX_COGNITIVE_DNA_WORDS);
      expect(finalDna.summary_text).toContain("VideoRewinds(2)");
      expect(finalDna.summary_text).toContain("[04:18]");
      expect(upsertedMemoryRow).toMatchObject({ user_id: "student-dna-01" });
    });

    it("strictly caps the rolling Cognitive DNA Card at 200 words even with extreme telemetry descriptions", () => {
      const card = buildRollingCognitiveDnaCard({
        prakritiDosha: "Vata",
        classification: "Vata-Pitta",
        signals: {
          detail_additions: 45,
          simplifications: 12,
          illustrative_requests: 80,
          video_rewind_count: 19,
          ayurvedic_lens_requests: 15,
          table_flowchart_conversions: 10,
          last_friction_timestamp_label:
            "[04:18] Extended Mechanics Lecture Segment on Free-Body Diagrams",
        },
      });

      expect(card.word_count).toBeLessThanOrEqual(MAX_COGNITIVE_DNA_WORDS);
      const actualWords = card.summary_text.trim().split(/\s+/);
      expect(actualWords.length).toBeLessThanOrEqual(MAX_COGNITIVE_DNA_WORDS);
    });
  });

  describe("3. Multi-Source Synthesis Studio (`synthesizeMasterStudyBook`)", () => {
    it("merges 2+ saved passages and 2+ video lecture transcripts into a unified Prakriti-formatted Master Study Book with inline citations", () => {
      const book = synthesizeMasterStudyBook({
        sources: DEFAULT_SYNTHESIS_SOURCES.slice(0, 2),
        videoLectures: DEFAULT_VIDEO_LECTURES.slice(0, 2),
        prakritiDosha: "Pitta",
        cognitiveDnaSummary:
          "Student Cognitive DNA Card (Pitta): Prefers differential tables and exact citations.",
      });

      expect(book.selectedSourceCount).toBe(2);
      expect(book.selectedVideoTranscriptCount).toBe(2);
      expect(book.prakritiDosha).toBe("Pitta");
      expect(book.sections.length).toBeGreaterThanOrEqual(3);

      // Verify both [Doc: ..., p. X] and [Video: ..., MM:SS] inline citations exist
      const badges = book.allCitations.map((c) => c.badge);
      expect(badges.some((b) => b.startsWith("[Doc:"))).toBe(true);
      expect(badges.some((b) => b.startsWith("[Video:"))).toBe(true);
    });

    it("rejects synthesis if fewer than 2 sources or fewer than 2 video transcripts are selected", () => {
      expect(() =>
        synthesizeMasterStudyBook({
          sources: DEFAULT_SYNTHESIS_SOURCES.slice(0, 1),
          videoLectures: DEFAULT_VIDEO_LECTURES.slice(0, 2),
          prakritiDosha: "Vata",
        })
      ).toThrow(/at least 2 saved passages/);

      expect(() =>
        synthesizeMasterStudyBook({
          sources: DEFAULT_SYNTHESIS_SOURCES.slice(0, 2),
          videoLectures: DEFAULT_VIDEO_LECTURES.slice(0, 1),
          prakritiDosha: "Vata",
        })
      ).toThrow(/at least 2 video lecture transcripts/);
    });
  });
});
