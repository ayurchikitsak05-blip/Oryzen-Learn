import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildShield3CacheKey,
  clearLocalAiGatewayState,
  computeNormalizedSelectionHash,
  executeControlledAiGateway,
  resolveShieldedModelRoute,
  selectPageLevelRagContext,
  setLocalWalletSpendForUser,
  SHIELD_1_MAX_PROMPT_TOKENS,
  SHIELD_4_DEFAULT_WALLET_CAP_INR,
  type AiLensResponsePayload,
} from "../gateway";
import {
  clearSavedPassages,
  listSavedPassages,
  savePassageEntry,
} from "../passage-store";
import type { CitationReadyChunk } from "@/lib/reader/extractor";

const SAMPLE_CANDIDATE_CHUNKS: CitationReadyChunk[] = [
  {
    chunk_id: "c1",
    document_id: "study-companion-vol1",
    page_number: 1,
    section_heading: "CHAPTER 1: ENERGY AND CONSTITUTION",
    text: "Vayu, Pitta, and Kapha are the three Sharira Doshas. Dhee, Dhriti, and Smriti govern cognitive equilibrium.",
    bounding_box: { x: 48, y: 680, width: 460, height: 24 },
    token_estimate: 28,
  },
  {
    chunk_id: "c2",
    document_id: "study-companion-vol1",
    page_number: 2,
    section_heading: "CHAPTER 2: SCREEN ENDURANCE",
    text: "Alochaka Pitta governs visual perception and ocular heat during prolonged reading.",
    bounding_box: { x: 48, y: 640, width: 450, height: 22 },
    token_estimate: 20,
  },
  {
    chunk_id: "c3",
    document_id: "study-companion-vol1",
    page_number: 3,
    section_heading: "CHAPTER 3: PRAKRITI ADAPTIVE STUDY",
    text: "Vata is Shighra-grahi, Pitta is Tikshna-buddhi, and Kapha is Dridha-smriti.",
    bounding_box: { x: 48, y: 620, width: 440, height: 22 },
    token_estimate: 20,
  },
  {
    chunk_id: "c4",
    document_id: "study-companion-vol1",
    page_number: 4,
    section_heading: "CHAPTER 4: ACROSS THE FACULTIES",
    text: "The same passage tools apply to a physics derivation, a historical argument, a proof, or a lab method.",
    bounding_box: { x: 48, y: 600, width: 440, height: 22 },
    token_estimate: 22,
  },
  {
    chunk_id: "c5",
    document_id: "study-companion-vol1",
    page_number: 5,
    section_heading: "CHAPTER 5: HIGH-YIELD REVISION",
    text: "Spaced recall, comparison tables, and short quizzes lock facts across calculus, literature, and laboratory work.",
    bounding_box: { x: 48, y: 580, width: 440, height: 22 },
    token_estimate: 20,
  },
];

describe("Layer 3: Controlled AI Gateway, 5-Shield Profit Protection & Multi-Lens Highlighting", () => {
  beforeEach(() => {
    clearLocalAiGatewayState();
    clearSavedPassages();
  });

  describe("1. Shield 1: Page-Level RAG (~2,000 Token Context Bounding)", () => {
    it("retrieves at most top 3 matching chunks alongside active page text and enforces the 2,000-token ceiling", () => {
      const rag = selectPageLevelRagContext({
        selectedText:
          "Vayu, Pitta, and Kapha are the three Sharira Doshas and Smriti recall",
        activePageNumber: 1,
        activePageText:
          "Active Page 1 context describing energy constitution and cognitive Dhee Dhriti Smriti.",
        candidateChunks: SAMPLE_CANDIDATE_CHUNKS,
      });

      expect(rag.selectedChunks.length).toBeLessThanOrEqual(3);
      expect(rag.selectedChunks[0].page_number).toBe(1);
      expect(rag.estimatedTokens).toBeLessThanOrEqual(
        SHIELD_1_MAX_PROMPT_TOKENS
      );
      expect(rag.boundedPromptContext).toContain("SELECTED PASSAGE (Page 1):");
      expect(rag.boundedPromptContext).toContain(
        "[Page 1, Section CHAPTER 1: ENERGY AND CONSTITUTION]"
      );
    });
  });

  describe("2. Shield 2: Hybrid Model Routing (90% Flash vs 10% Pro)", () => {
    it("routes all 5 highlight lenses to gemini-2.5-flash and deep synthesis to gemini-2.5-pro when under wallet ceiling", () => {
      for (const lens of [
        "ayurvedic",
        "illustrative",
        "high_yield_revision",
        "save_passage",
        "test_me",
      ] as const) {
        const route = resolveShieldedModelRoute({
          lensType: lens,
          currentMonthlySpendInr: 12.5,
          walletCapInr: 70,
        });
        expect(route.requestedModel).toBe("gemini-2.5-flash");
        expect(route.effectiveModel).toBe("gemini-2.5-flash");
        expect(route.downgradedToFlashLite).toBe(false);
      }

      const proRoute = resolveShieldedModelRoute({
        lensType: "deep_integrative_synthesis",
        currentMonthlySpendInr: 20.0,
        walletCapInr: 70,
      });
      expect(proRoute.requestedModel).toBe("gemini-2.5-pro");
      expect(proRoute.effectiveModel).toBe("gemini-2.5-pro");
      expect(proRoute.downgradedToFlashLite).toBe(false);
    });
  });

  describe("3. Shield 3: Semantic & Selection Caching (`ai_response_cache`)", () => {
    it("normalizes whitespace/casing in selection hashes and serves repeated highlights at 0 tokens and ₹0.00 cost", async () => {
      const hashA = await computeNormalizedSelectionHash(
        "  Vayu, Pitta,   and Kapha  "
      );
      const hashB = await computeNormalizedSelectionHash(
        "vayu, pitta, and kapha"
      );
      expect(hashA).toBe(hashB);

      const keyInfo = await buildShield3CacheKey({
        documentHash: "doc-sha256-001",
        pageNumber: 1,
        selectedText: "Vayu, Pitta, and Kapha",
        lensType: "ayurvedic",
      });
      expect(keyInfo.cacheKey).toHaveLength(64);

      const mockGenerator = vi.fn(async ({ request }) => ({
        payload: {
          lens_type: request.lensType,
          prakriti_dosha: "Pitta" as const,
          title: "🌿 Constitution View",
          markdown_body: `Correlated with [Page ${request.pageNumber}, Section ${request.sectionHeading}]`,
          key_points: ["Tridosha correlation"],
          citations: [
            {
              label: `[Page ${request.pageNumber}, Section ${request.sectionHeading}]`,
              document_id: request.documentId,
              page_number: request.pageNumber,
              section_heading: request.sectionHeading,
              bounding_box: { x: 48, y: 680, width: 460, height: 24 },
            },
          ],
        },
        promptTokens: 420,
        completionTokens: 180,
      }));

      // 1st Call: Cache Miss -> Invokes LLM generator and logs tokens
      const firstCall = await executeControlledAiGateway({
        userId: "student-cache-01",
        documentId: "study-companion-vol1",
        documentHash: "doc-sha256-001",
        pageNumber: 1,
        sectionHeading: "CHAPTER 1: ENERGY AND CONSTITUTION",
        selectedText: "Vayu, Pitta, and Kapha are the three Sharira Doshas.",
        lensType: "ayurvedic",
        prakritiDosha: "Pitta",
        candidateChunks: SAMPLE_CANDIDATE_CHUNKS,
        llmGenerator: mockGenerator,
      });

      expect(firstCall.cacheHit).toBe(false);
      expect(firstCall.totalTokens).toBe(600);
      expect(firstCall.costInr).toBeGreaterThan(0);
      expect(mockGenerator).toHaveBeenCalledTimes(1);

      // 2nd Call with extra whitespace on same passage/page/lens: Cache Hit -> 0 tokens, ₹0.00 cost, generator not called again
      const secondCall = await executeControlledAiGateway({
        userId: "student-cache-02",
        documentId: "study-companion-vol1",
        documentHash: "doc-sha256-001",
        pageNumber: 1,
        sectionHeading: "CHAPTER 1: ENERGY AND CONSTITUTION",
        selectedText:
          "  vayu, pitta,   and kapha are the three sharira doshas.  ",
        lensType: "ayurvedic",
        prakritiDosha: "Pitta",
        candidateChunks: SAMPLE_CANDIDATE_CHUNKS,
        llmGenerator: mockGenerator,
      });

      expect(secondCall.cacheHit).toBe(true);
      expect(secondCall.promptTokens).toBe(0);
      expect(secondCall.completionTokens).toBe(0);
      expect(secondCall.totalTokens).toBe(0);
      expect(secondCall.costInr).toBe(0);
      expect(secondCall.payload.citations[0].label).toBe(
        "[Page 1, Section CHAPTER 1: ENERGY AND CONSTITUTION]"
      );
      expect(mockGenerator).toHaveBeenCalledTimes(1);
    });
  });

  describe("4. Shield 4: Internal Wallet Ledger (`ai_usage_logs`) & ₹70 Hard Cap Fallback", () => {
    it("automatically downgrades to gemini-2.5-flash-lite when a student reaches the ₹70 monthly wallet ceiling", async () => {
      const userId = "student-power-user";
      const billingMonth = "2026-10";

      // Seed user's monthly spend at ₹70.00 (hitting the ₹70 hard cap)
      setLocalWalletSpendForUser(
        userId,
        billingMonth,
        SHIELD_4_DEFAULT_WALLET_CAP_INR
      );

      const usedModels: string[] = [];
      const result = await executeControlledAiGateway({
        userId,
        billingMonth,
        documentId: "study-companion-vol1",
        documentHash: "doc-sha256-cap",
        pageNumber: 3,
        sectionHeading: "CHAPTER 3: PRAKRITI PEDAGOGY",
        selectedText: "Vata is Shighra-grahi, Pitta is Tikshna-buddhi.",
        lensType: "high_yield_revision",
        prakritiDosha: "Pitta",
        walletCapInr: SHIELD_4_DEFAULT_WALLET_CAP_INR,
        candidateChunks: SAMPLE_CANDIDATE_CHUNKS,
        llmGenerator: async ({ model, request }) => {
          usedModels.push(model);
          return {
            payload: {
              lens_type: request.lensType,
              prakriti_dosha: "Pitta",
              title: "⚡ Revision View (Flash-Lite Fallback)",
              markdown_body: `Revision table [Page ${request.pageNumber}, Section ${request.sectionHeading}]`,
              key_points: ["High-yield point"],
              citations: [
                {
                  label: `[Page ${request.pageNumber}, Section ${request.sectionHeading}]`,
                  document_id: request.documentId,
                  page_number: request.pageNumber,
                  section_heading: request.sectionHeading,
                  bounding_box: { x: 48, y: 620, width: 440, height: 22 },
                },
              ],
            },
            promptTokens: 300,
            completionTokens: 120,
          };
        },
      });

      expect(result.requestedModel).toBe("gemini-2.5-flash");
      expect(result.modelUsed).toBe("gemini-2.5-flash-lite");
      expect(result.downgradedToFlashLite).toBe(true);
      expect(usedModels).toEqual(["gemini-2.5-flash-lite"]);
      expect(result.monthlySpendBeforeInr).toBe(70);
      expect(result.monthlySpendAfterInr).toBeGreaterThan(70);
    });

    it("integrates with Supabase `ai_response_cache` and `ai_usage_logs` tables when client is provided", async () => {
      const insertedUsageLogs: Array<Record<string, unknown>> = [];
      let cachedRow: {
        model_used: string;
        response_payload: AiLensResponsePayload;
      } | null = null;

      const supabaseMock = {
        from: vi.fn((table: string) => {
          if (table === "ai_response_cache") {
            return {
              select: vi.fn(() => {
                const chain = {
                  eq: vi.fn(() => chain),
                  maybeSingle: vi.fn(async () => ({
                    data: cachedRow,
                    error: null,
                  })),
                };
                return chain;
              }),
              upsert: vi.fn(async (row: Record<string, unknown>) => {
                cachedRow = {
                  model_used: String(row.model_used),
                  response_payload:
                    row.response_payload as AiLensResponsePayload,
                };
                return { data: row, error: null };
              }),
            };
          }
          if (table === "ai_usage_logs") {
            return {
              select: vi.fn(() => {
                const chain = {
                  eq: vi.fn(() => chain),
                  then: (
                    resolve: (val: {
                      data: Array<{ cost_inr: number }>;
                      error: null;
                    }) => void
                  ) => {
                    resolve({
                      data: insertedUsageLogs.map((l) => ({
                        cost_inr: Number(l.cost_inr ?? 0),
                      })),
                      error: null,
                    });
                  },
                };
                return chain;
              }),
              insert: vi.fn(async (row: Record<string, unknown>) => {
                insertedUsageLogs.push(row);
                return { data: row, error: null };
              }),
            };
          }
          throw new Error(`Unexpected table ${table}`);
        }),
      } as unknown as SupabaseClient;

      const first = await executeControlledAiGateway({
        userId: "supa-user-1",
        billingMonth: "2026-10",
        documentId: "study-companion-vol1",
        documentHash: "supa-doc-hash",
        pageNumber: 2,
        sectionHeading: "CHAPTER 2: SCREEN ENDURANCE",
        selectedText: "Alochaka Pitta governs visual perception.",
        lensType: "test_me",
        prakritiDosha: "Kapha",
        candidateChunks: SAMPLE_CANDIDATE_CHUNKS,
        supabase: supabaseMock,
      });

      expect(first.cacheHit).toBe(false);
      expect(first.payload.mcqs).toBeDefined();
      expect(first.payload.mcqs?.length).toBeGreaterThan(0);
      expect(insertedUsageLogs).toHaveLength(1);
      expect(insertedUsageLogs[0].cache_hit).toBe(false);

      // Second call hits mocked Supabase `ai_response_cache`
      const second = await executeControlledAiGateway({
        userId: "supa-user-1",
        billingMonth: "2026-10",
        documentId: "study-companion-vol1",
        documentHash: "supa-doc-hash",
        pageNumber: 2,
        sectionHeading: "CHAPTER 2: SCREEN ENDURANCE",
        selectedText: "Alochaka Pitta governs visual perception.",
        lensType: "test_me",
        prakritiDosha: "Kapha",
        candidateChunks: SAMPLE_CANDIDATE_CHUNKS,
        supabase: supabaseMock,
      });

      expect(second.cacheHit).toBe(true);
      expect(second.costInr).toBe(0);
      expect(insertedUsageLogs).toHaveLength(2);
      expect(insertedUsageLogs[1].cache_hit).toBe(true);
      expect(insertedUsageLogs[1].total_tokens).toBe(0);
    });
  });

  describe("5. Bi-Directional Deep-Linked Study Compendium (`passage-store.ts`)", () => {
    it("persists compendium entries with exact PDF page number, section heading, and bounding-box coordinates", () => {
      const saved = savePassageEntry({
        documentId: "study-companion-vol1",
        documentTitle: "Energy & Constitution Companion",
        pageNumber: 2,
        sectionHeading: "CHAPTER 2: SCREEN ENDURANCE",
        boundingBox: { x: 48, y: 640, width: 450, height: 22 },
        highlightedText: "Alochaka Pitta governs visual perception.",
        aiSynthesisMarkdown:
          "### Saved Note [Page 2, Section CHAPTER 2: SCREEN ENDURANCE]",
        citations: [
          {
            label: "[Page 2, Section CHAPTER 2: SCREEN ENDURANCE]",
            document_id: "study-companion-vol1",
            page_number: 2,
            section_heading: "CHAPTER 2: SCREEN ENDURANCE",
            bounding_box: { x: 48, y: 640, width: 450, height: 22 },
          },
        ],
      });

      expect(saved.id).toContain("note-");
      const listed = listSavedPassages("study-companion-vol1");
      expect(listed).toHaveLength(1);
      expect(listed[0].pageNumber).toBe(2);
      expect(listed[0].boundingBox).toEqual({
        x: 48,
        y: 640,
        width: 450,
        height: 22,
      });
    });
  });
});
