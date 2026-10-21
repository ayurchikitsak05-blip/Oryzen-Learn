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

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

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

  describe("2. Shield 2: Hybrid Model Routing (Flash-Lite preferred, Pro gated)", () => {
    it("routes supported highlight lenses to gemini-2.5-flash-lite and deep synthesis to gemini-2.5-pro when under wallet ceiling", () => {
      for (const lens of [
        "ayurvedic",
        "illustrative",
        "high_yield_revision",
        "save_passage",
        "test_me",
        "explain",
        "story",
      ] as const) {
        const route = resolveShieldedModelRoute({
          lensType: lens,
          currentMonthlySpendInr: 12.5,
          walletCapInr: 70,
        });
        expect(route.requestedModel).toBe("gemini-2.5-flash-lite");
        expect(route.effectiveModel).toBe("gemini-2.5-flash-lite");
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

      const tightPro = resolveShieldedModelRoute({
        lensType: "deep_integrative_synthesis",
        currentMonthlySpendInr: 60,
        walletCapInr: 70,
      });
      expect(tightPro.effectiveModel).toBe("gemini-2.5-flash-lite");
      expect(tightPro.downgradedToFlashLite).toBe(true);
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
      expect(firstCall.usedDeterministicFallback).toBe(false);
      expect(mockGenerator).toHaveBeenCalledTimes(1);

      // 2nd Call, same student, extra whitespace: Cache Hit -> 0 tokens, ₹0.00
      const secondCall = await executeControlledAiGateway({
        userId: "student-cache-01",
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

    it("does not leak a private document cache hit to another student", async () => {
      const mockGenerator = vi.fn(async ({ request }) => ({
        payload: {
          lens_type: request.lensType,
          prakriti_dosha: "Vata" as const,
          title: `Private for ${request.userId}`,
          markdown_body: `Grounded note for ${request.userId} [Page ${request.pageNumber}, Section ${request.sectionHeading}]`,
          key_points: ["private"],
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
        promptTokens: 200,
        completionTokens: 80,
      }));

      const sharedDoc = {
        documentId: "study-companion-vol1",
        documentHash: "same-pdf-hash",
        pageNumber: 1,
        sectionHeading: "CHAPTER 1: ENERGY AND CONSTITUTION",
        selectedText: "Vayu, Pitta, and Kapha are the three Sharira Doshas.",
        lensType: "explain" as const,
        candidateChunks: SAMPLE_CANDIDATE_CHUNKS,
        llmGenerator: mockGenerator,
      };

      const first = await executeControlledAiGateway({
        ...sharedDoc,
        userId: "student-a",
        documentClass: "private_upload",
      });
      const second = await executeControlledAiGateway({
        ...sharedDoc,
        userId: "student-b",
        documentClass: "private_upload",
      });

      expect(first.cacheHit).toBe(false);
      expect(second.cacheHit).toBe(false);
      expect(first.cacheKey).not.toBe(second.cacheKey);
      expect(first.cacheScope).toBe("private");
      expect(second.payload.title).toBe("Private for student-b");
      expect(mockGenerator).toHaveBeenCalledTimes(2);
    });

    it("shares only among institute members with an authorized hash and invalidates on revocation", async () => {
      const mockGenerator = vi.fn(async ({ request }) => ({
        payload: {
          lens_type: request.lensType,
          prakriti_dosha: "Vata" as const,
          title: "Shared syllabus explain",
          markdown_body: `Cohort note [Page ${request.pageNumber}, Section ${request.sectionHeading}]`,
          key_points: ["shared"],
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
        promptTokens: 180,
        completionTokens: 70,
      }));

      const base = {
        documentId: "batch-physics",
        documentHash: "syl-physics-v3",
        pageNumber: 2,
        sectionHeading: "Forces",
        selectedText: "Net force equals mass times acceleration.",
        lensType: "explain" as const,
        documentClass: "institute_authorized_syllabus" as const,
        candidateChunks: SAMPLE_CANDIDATE_CHUNKS,
        llmGenerator: mockGenerator,
      };

      const memberA = await executeControlledAiGateway({
        ...base,
        userId: "member-a",
        instituteMembership: {
          tenantId: "inst-north",
          userId: "member-a",
          authorizedSyllabusHashes: ["syl-physics-v3"],
          revocationEpoch: "2026-10-01",
        },
      });
      const memberB = await executeControlledAiGateway({
        ...base,
        userId: "member-b",
        instituteMembership: {
          tenantId: "inst-north",
          userId: "member-b",
          authorizedSyllabusHashes: ["syl-physics-v3"],
          revocationEpoch: "2026-10-01",
        },
      });
      expect(memberA.cacheHit).toBe(false);
      expect(memberB.cacheHit).toBe(true);
      expect(memberA.cacheKey).toBe(memberB.cacheKey);
      expect(memberA.cacheScope).toBe("institute_authorized");
      expect(mockGenerator).toHaveBeenCalledTimes(1);

      const otherInstitute = await executeControlledAiGateway({
        ...base,
        userId: "member-c",
        instituteMembership: {
          tenantId: "inst-south",
          userId: "member-c",
          authorizedSyllabusHashes: ["syl-physics-v3"],
          revocationEpoch: "2026-10-01",
        },
      });
      expect(otherInstitute.cacheHit).toBe(false);
      expect(otherInstitute.cacheKey).not.toBe(memberA.cacheKey);

      const revoked = await executeControlledAiGateway({
        ...base,
        userId: "member-b",
        instituteMembership: {
          tenantId: "inst-north",
          userId: "member-b",
          authorizedSyllabusHashes: ["syl-physics-v3"],
          revocationEpoch: "2026-10-21",
        },
      });
      expect(revoked.cacheHit).toBe(false);
      expect(revoked.cacheKey).not.toBe(memberA.cacheKey);
    });
  });

  describe("4. Shield 4: Internal Wallet Ledger (`ai_usage_logs`) & ₹70 Hard Cap", () => {
    it("hard-stops paid generation at the ₹70 monthly wallet ceiling and stays deterministic", async () => {
      const userId = "student-power-user";
      const billingMonth = "2026-10";

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

      expect(result.requestedModel).toBe("gemini-2.5-flash-lite");
      expect(result.modelUsed).toBe("deterministic");
      expect(result.usedDeterministicFallback).toBe(true);
      expect(result.budgetBlocked).toBe(true);
      expect(result.fallbackReason).toBe("wallet_exhausted");
      expect(usedModels).toEqual([]);
      expect(result.monthlySpendBeforeInr).toBe(70);
      expect(result.monthlySpendAfterInr).toBe(70);
      expect(result.costInr).toBe(0);
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

  describe("5. Deterministic fallback when GEMINI is missing", () => {
    it("does not call paid adapters when every provider key is empty", async () => {
      const previous = {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
        AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      };
      process.env.GEMINI_API_KEY = "";
      process.env.OPENAI_API_KEY = "";
      process.env.MISTRAL_API_KEY = "";
      process.env.AI_GATEWAY_API_KEY = "";
      const fetchImpl = vi.fn();
      try {
        const result = await executeControlledAiGateway({
          userId: "local-student",
          documentId: "study-companion-vol1",
          documentHash: "no-paid-keys",
          pageNumber: 4,
          sectionHeading: "CHAPTER 4: ACROSS THE FACULTIES",
          selectedText:
            "The same passage tools apply to a physics derivation, a historical argument, a formal proof, or a laboratory method.",
          lensType: "explain",
          candidateChunks: SAMPLE_CANDIDATE_CHUNKS,
          fetchImpl,
        });
        expect(result.usedDeterministicFallback).toBe(true);
        expect(result.providerUsed).toBe("deterministic");
        expect(fetchImpl).not.toHaveBeenCalled();
      } finally {
        restoreEnv(previous);
      }
    });

    it("falls through to the next cheapest mocked provider", async () => {
      const previous = {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
      };
      process.env.GEMINI_API_KEY = "gemini-test";
      process.env.MISTRAL_API_KEY = "mistral-test";
      const fetchImpl = vi.fn(async (url: string) => {
        if (String(url).includes("generativelanguage.googleapis.com")) {
          return new Response("quota exceeded", { status: 429 });
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Explain This Passage",
                    markdown_body:
                      "The same passage tools apply to a physics derivation, a historical argument, a formal proof, or a laboratory method.",
                    key_points: ["physics", "proof"],
                    explain: {
                      simpleExplanation: "The tools stay inside the selected lines.",
                      standardExplanation:
                        "A physics derivation, historical argument, proof, or laboratory method can use the same passage tools.",
                      deeperExplanation: "Stay inside the cited lines.",
                      importantConcepts: ["physics", "proof"],
                      relevantExample: "A laboratory method from these lines.",
                      keyTakeaway: "Do not invent a second chapter.",
                    },
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 40, completion_tokens: 20 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });
      try {
        const result = await executeControlledAiGateway({
          userId: "fallback-student",
          documentId: "study-companion-vol1",
          documentHash: "provider-fallback",
          pageNumber: 4,
          sectionHeading: "CHAPTER 4: ACROSS THE FACULTIES",
          selectedText:
            "The same passage tools apply to a physics derivation, a historical argument, a formal proof, or a laboratory method.",
          lensType: "explain",
          candidateChunks: SAMPLE_CANDIDATE_CHUNKS,
          fetchImpl,
        });
        expect(result.usedDeterministicFallback).toBe(false);
        expect(result.usedProviderFallback).toBe(true);
        expect(result.providerUsed).toBe("mistral");
        expect(result.modelUsed).toBe("ministral-3b-2512");
      } finally {
        restoreEnv(previous);
      }
    });

    it("still returns usable structured output and marks fallback used", async () => {
      const previous = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "";
      try {
        const result = await executeControlledAiGateway({
          userId: "local-student",
          documentId: "study-companion-vol1",
          documentHash: "fallback-hash",
          pageNumber: 4,
          sectionHeading: "CHAPTER 4: ACROSS THE FACULTIES",
          selectedText:
            "The same passage tools apply to a physics derivation, a historical argument, a formal proof, or a laboratory method.",
          lensType: "explain",
          candidateChunks: SAMPLE_CANDIDATE_CHUNKS,
        });
        expect(result.usedDeterministicFallback).toBe(true);
        expect(result.fallbackReason).toBe("missing_gemini_key");
        expect(result.geminiErrorClass).toBe("missing_key");
        expect(result.payload.markdown_body.length).toBeGreaterThan(80);
        expect(result.payload.markdown_body).toMatch(/physics|historical|proof|laboratory/i);
        expect(result.payload.title).toBe("Explain This Passage");
      } finally {
        restoreEnv({ GEMINI_API_KEY: previous });
      }
    });
  });

  describe("6. Bi-Directional Deep-Linked Study Compendium (`passage-store.ts`)", () => {
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
