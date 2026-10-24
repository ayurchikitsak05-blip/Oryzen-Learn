import { composeDeterministicLensPayload } from "./lens-compose";
import { mergeStructuredLensPayload } from "./gemini-structured";
import {
  isGenericExplainTemplate,
  isGenericStudyStory,
  isQualityMcq,
} from "./lens-quality";
import {
  MODEL_CATALOG,
  TYPICAL_LENS_INPUT_TOKENS,
  TYPICAL_LENS_OUTPUT_TOKENS,
  estimateTokensFromChars,
  listPriceUsd,
  usdToInrEstimate,
  type GatewayModelId,
} from "./models";
import {
  callProviderStructuredLens,
  hasAnyPaidProvider,
  hasUsableGoogleKey,
  type FetchLike,
} from "./providers";
import { answerFromTextbook } from "@/lib/vaults/compose";
import {
  executeControlledAiGateway,
  type AiLensResponsePayload,
  type GatewayTaskType,
} from "./gateway";
import type { CitationReadyChunk } from "@/lib/reader/extractor";

export type BenchmarkDomain = "science" | "mathematics" | "humanities" | "business";

export type BenchmarkTaskId =
  | "simple_explanation"
  | "detailed_explanation"
  | "story"
  | "prakriti_adaptation"
  | "structured_flowchart"
  | "mind_map"
  | "revision_guide"
  | "mcq"
  | "source_grounded_qa"
  | "chapter_transformation";

export interface DomainFixture {
  domain: BenchmarkDomain;
  title: string;
  passage: string;
}

export const DOMAIN_FIXTURES: DomainFixture[] = [
  {
    domain: "science",
    title: "Newton's first law",
    passage:
      "Newton's first law says an object keeps a constant velocity unless a net force acts on it. A puck on ice keeps sliding until a stick or friction changes that velocity.",
  },
  {
    domain: "mathematics",
    title: "Linear equations",
    passage:
      "A linear equation in one variable has the form ax + b = 0, where a is not zero. Solving for x gives x = -b / a. The graph of y = ax + b is a straight line.",
  },
  {
    domain: "humanities",
    title: "Ashoka's edicts",
    passage:
      "Ashoka's edicts describe dhamma as ethical conduct after the Kalinga war. The inscriptions ask officials to reduce suffering and to treat people with restraint rather than conquest.",
  },
  {
    domain: "business",
    title: "Landing-page proof",
    passage:
      "A landing page converts when the headline names the customer outcome and the proof section shows one measured result. The call to action should repeat that outcome in one short line.",
  },
];

const TASK_TO_LENS: Record<
  Exclude<BenchmarkTaskId, "source_grounded_qa">,
  "explain" | "story" | "ayurvedic" | "illustrative" | "high_yield_revision" | "test_me"
> = {
  simple_explanation: "explain",
  detailed_explanation: "explain",
  story: "story",
  prakriti_adaptation: "ayurvedic",
  structured_flowchart: "illustrative",
  mind_map: "illustrative",
  revision_guide: "high_yield_revision",
  mcq: "test_me",
  chapter_transformation: "high_yield_revision",
};

export interface TaskScore {
  accuracy: number;
  fidelity: number;
  diagramValid: boolean;
  formatOk: boolean;
  retries: number;
}

export interface BenchmarkRow {
  kind: "ESTIMATE";
  task: BenchmarkTaskId;
  domain: BenchmarkDomain;
  model: GatewayModelId;
  inputTokensEst: number;
  outputTokensEst: number;
  apiCostUsdEst: number;
  latencyMs: "N/A";
  score: TaskScore;
  liveCall: false;
}

function fixtureChunk(fixture: DomainFixture): CitationReadyChunk {
  return {
    chunk_id: `${fixture.domain}-1`,
    document_id: `fixture-${fixture.domain}`,
    page_number: 1,
    section_heading: fixture.title,
    text: fixture.passage,
    bounding_box: { x: 40, y: 80, width: 400, height: 24 },
    token_estimate: estimateTokensFromChars(fixture.passage),
  };
}

function scorePayload(
  task: BenchmarkTaskId,
  fixture: DomainFixture,
  payload: AiLensResponsePayload
): TaskScore {
  const passageTerms = fixture.passage
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4)
    .slice(0, 8);
  const haystack = [
    payload.markdown_body,
    payload.explain?.simpleExplanation ?? "",
    payload.explain?.standardExplanation ?? "",
    payload.story?.opening ?? "",
    payload.revision?.quickSummary ?? "",
    ...(payload.key_points ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const hits = passageTerms.filter((term) => haystack.includes(term)).length;
  const fidelity = passageTerms.length === 0 ? 1 : hits / passageTerms.length;

  const diagram =
    task === "structured_flowchart"
      ? payload.illustrative?.flowchart ?? payload.diagram
      : task === "mind_map"
        ? payload.illustrative?.mindMap ?? payload.diagram
        : payload.diagram;
  const diagramValid = Boolean(
    diagram &&
      diagram.nodes.length >= 2 &&
      diagram.edges.length >= 1 &&
      diagram.edges.every((edge) =>
        diagram.nodes.some((node) => node.id === edge.from) &&
        diagram.nodes.some((node) => node.id === edge.to)
      )
  );

  let formatOk = payload.markdown_body.trim().length >= 40;
  if (task === "simple_explanation" || task === "detailed_explanation") {
    formatOk = Boolean(payload.explain?.simpleExplanation && payload.explain.standardExplanation);
  }
  if (task === "story") formatOk = Boolean(payload.story?.opening && payload.story.close);
  if (task === "mcq") formatOk = Boolean(payload.mcqs && payload.mcqs.length > 0);
  if (task === "revision_guide" || task === "chapter_transformation") {
    formatOk = Boolean(payload.revision?.revisionTable && payload.revision.revisionTable.length >= 2);
  }
  if (task === "structured_flowchart" || task === "mind_map") formatOk = diagramValid;
  if (task === "prakriti_adaptation") formatOk = payload.markdown_body.length > 40;

  const schemaCheck = mergeStructuredLensPayload(payload, payload);
  const accuracy = (fidelity + (formatOk ? 1 : 0) + (schemaCheck.usable ? 1 : 0)) / 3;

  return {
    accuracy,
    fidelity,
    diagramValid,
    formatOk,
    retries: 0,
  };
}

export function runDeterministicBenchmark(): BenchmarkRow[] {
  const rows: BenchmarkRow[] = [];
  const models: GatewayModelId[] = [
    "gemini-3.5-flash-lite",
    "ministral-3b-2512",
    "gpt-6-luna",
    "deterministic",
  ];

  for (const fixture of DOMAIN_FIXTURES) {
    const chunk = fixtureChunk(fixture);
    for (const task of Object.keys(TASK_TO_LENS) as Array<keyof typeof TASK_TO_LENS>) {
      const payload = composeDeterministicLensPayload({
        request: {
          documentId: chunk.document_id,
          pageNumber: 1,
          sectionHeading: fixture.title,
          selectedText: fixture.passage,
          lensType: TASK_TO_LENS[task],
        },
        ragChunks: [chunk],
      }) as AiLensResponsePayload;
      const score = scorePayload(task, fixture, payload);
      const prompt = `${fixture.passage}\n${task}`;
      const output = payload.markdown_body;
      const inputTokensEst = estimateTokensFromChars(prompt);
      const outputTokensEst = estimateTokensFromChars(output);

      for (const model of models) {
        rows.push({
          kind: "ESTIMATE",
          task,
          domain: fixture.domain,
          model,
          inputTokensEst,
          outputTokensEst,
          apiCostUsdEst:
            model === "deterministic"
              ? 0
              : listPriceUsd(model, inputTokensEst, outputTokensEst),
          latencyMs: "N/A",
          score,
          liveCall: false,
        });
      }
    }

    const qa = answerFromTextbook("What does the passage claim?", [
      { title: fixture.title, excerpt: fixture.passage },
    ]);
    const qaScore: TaskScore = {
      accuracy: qa.toLowerCase().includes(fixture.passage.toLowerCase().slice(0, 24)) ? 1 : 0.7,
      fidelity: 1,
      diagramValid: true,
      formatOk: qa.length > 40,
      retries: 0,
    };
    const qaIn = estimateTokensFromChars(fixture.passage + "What does the passage claim?");
    const qaOut = estimateTokensFromChars(qa);
    for (const model of models) {
      rows.push({
        kind: "ESTIMATE",
        task: "source_grounded_qa",
        domain: fixture.domain,
        model,
        inputTokensEst: qaIn,
        outputTokensEst: qaOut,
        apiCostUsdEst:
          model === "deterministic" ? 0 : listPriceUsd(model, qaIn, qaOut),
        latencyMs: "N/A",
        score: qaScore,
        liveCall: false,
      });
    }
  }

  return rows;
}

export function recommendModelPerTask(rows: BenchmarkRow[]): Record<BenchmarkTaskId, GatewayModelId> {
  const tasks = Array.from(new Set(rows.map((row) => row.task)));
  const picks: Record<string, GatewayModelId> = {};
  for (const task of tasks) {
    const scored = rows.filter((row) => row.task === task && row.model !== "deterministic");
    const reliable = scored.filter(
      (row) =>
        MODEL_CATALOG[row.model].structuredOutput &&
        row.score.formatOk &&
        row.score.fidelity >= 0.4
    );
    const pool = reliable.length > 0 ? reliable : scored;
    pool.sort((a, b) => a.apiCostUsdEst - b.apiCostUsdEst);
    const cheapest = pool[0];
    if (!cheapest) {
      picks[task] = "deterministic";
      continue;
    }
    // Gateway catalog does not tag Ministral 3B with structured-output.
    // Prefer Flash-Lite for schema-heavy tasks when costs are close.
    const schemaHeavy =
      task === "mcq" ||
      task === "structured_flowchart" ||
      task === "mind_map" ||
      task === "chapter_transformation" ||
      task === "detailed_explanation";
    if (schemaHeavy && cheapest.model === "ministral-3b-2512") {
      const lite = pool.find((row) => row.model === "gemini-3.5-flash-lite");
      picks[task] = lite?.model ?? cheapest.model;
    } else {
      picks[task] = cheapest.model;
    }
  }
  return picks as Record<BenchmarkTaskId, GatewayModelId>;
}

/** Hard ceiling. Enforced in code before every live attempt, including reserved retries. */
export const CONTROLLED_BENCHMARK_HARD_CAP_USD = 2;
/** Planned 36 + reserved retry pool of 12. */
export const CONTROLLED_BENCHMARK_MAX_CALLS = 48;
export const CONTROLLED_BENCHMARK_PLANNED_CALLS = 36;
export const CONTROLLED_BENCHMARK_RESERVED_RETRIES = 12;
export const CONTROLLED_BENCHMARK_LIVE_FLAG = "ORYZEN_LIVE_BENCHMARK";

/** Official IDs. `ministral-3b-2512` is the snapshot behind `ministral-3b-latest`. */
export const CONTROLLED_BENCHMARK_MODELS = [
  "gemini-3.5-flash-lite",
  "gpt-6-luna",
  "ministral-3b-2512",
] as const;

export const CONTROLLED_BENCHMARK_TASKS = [
  "simple_explanation",
  "detailed_explanation",
  "structured_flowchart",
  "mcq",
  "revision_guide",
  "source_grounded_qa",
] as const;

export const CONTROLLED_BENCHMARK_SUBJECTS = ["science", "mathematics"] as const;

export const CONTROLLED_BENCHMARK_EVAL_CRITERIA: Record<
  (typeof CONTROLLED_BENCHMARK_TASKS)[number],
  string
> = {
  simple_explanation:
    "explain.simpleExplanation present; fidelity to fixture terms ≥ 0.4; schema usable",
  detailed_explanation:
    "explain.standardExplanation + deeperExplanation present; no invented chapter",
  structured_flowchart:
    "diagram/flowchart has ≥2 nodes, ≥1 edge, every edge endpoint exists",
  mcq: "≥1 MCQ with exactly 4 options and a valid correctIndex 0–3",
  revision_guide: "revision.revisionTable has ≥2 topic/remember rows",
  source_grounded_qa: "answer stays inside the excerpt; length > 40",
};

export type ControlledBenchmarkMode = "dry_run" | "live";

export interface BenchmarkSpendGuard {
  spentUsd: number;
  callsMade: number;
  reservedRetrySlots: number;
}

export interface ControlledBenchmarkCall {
  kind: "ESTIMATE" | "REFUSED" | "LIVE";
  liveCall: boolean;
  task: (typeof CONTROLLED_BENCHMARK_TASKS)[number];
  domain: (typeof CONTROLLED_BENCHMARK_SUBJECTS)[number];
  model: (typeof CONTROLLED_BENCHMARK_MODELS)[number];
  estimatedUsd: number;
  reservedRetryUsd: number;
  blockedReason: string | null;
}

export interface ControlledBenchmarkReport {
  mode: "dry_run" | "refused_live" | "live";
  liveAuthorized: boolean;
  liveCall: boolean;
  plannedCalls: number;
  maxCalls: number;
  reservedRetries: number;
  hardCapUsd: number;
  estimatedUsd: number;
  reservedRetryBudgetUsd: number;
  maxExposureUsd: number;
  spentUsd: number;
  stoppedByCap: boolean;
  stopReason: string | null;
  evalCriteria: typeof CONTROLLED_BENCHMARK_EVAL_CRITERIA;
  calls: ControlledBenchmarkCall[];
}

function conservativeCallUsd(model: (typeof CONTROLLED_BENCHMARK_MODELS)[number]): number {
  return listPriceUsd(model, TYPICAL_LENS_INPUT_TOKENS, TYPICAL_LENS_OUTPUT_TOKENS);
}

function worstCaseCallUsd(): number {
  return Math.max(
    ...CONTROLLED_BENCHMARK_MODELS.map((model) => conservativeCallUsd(model))
  );
}

export function isControlledLiveBenchmarkAuthorized(): boolean {
  return (
    process.env[CONTROLLED_BENCHMARK_LIVE_FLAG] === "1" && hasAnyPaidProvider()
  );
}

/**
 * Returns true only when the next attempt plus the remaining reserved retry
 * budget still fits under the $2 hard cap and the 48-call ceiling.
 */
export function canAffordControlledBenchmarkCall(
  guard: BenchmarkSpendGuard,
  nextEstimateUsd: number
): { ok: boolean; reason: string | null } {
  if (guard.callsMade >= CONTROLLED_BENCHMARK_MAX_CALLS) {
    return { ok: false, reason: "max_calls" };
  }
  const reservedUsd = guard.reservedRetrySlots * worstCaseCallUsd();
  const projected = guard.spentUsd + nextEstimateUsd + reservedUsd;
  if (projected > CONTROLLED_BENCHMARK_HARD_CAP_USD) {
    return { ok: false, reason: "hard_cap" };
  }
  return { ok: true, reason: null };
}

function plannedControlledCalls(): Array<{
  task: (typeof CONTROLLED_BENCHMARK_TASKS)[number];
  domain: (typeof CONTROLLED_BENCHMARK_SUBJECTS)[number];
  model: (typeof CONTROLLED_BENCHMARK_MODELS)[number];
}> {
  const planned: Array<{
    task: (typeof CONTROLLED_BENCHMARK_TASKS)[number];
    domain: (typeof CONTROLLED_BENCHMARK_SUBJECTS)[number];
    model: (typeof CONTROLLED_BENCHMARK_MODELS)[number];
  }> = [];
  for (const domain of CONTROLLED_BENCHMARK_SUBJECTS) {
    for (const task of CONTROLLED_BENCHMARK_TASKS) {
      for (const model of CONTROLLED_BENCHMARK_MODELS) {
        planned.push({ task, domain, model });
      }
    }
  }
  return planned;
}

function emptyFallbackPayload(): AiLensResponsePayload {
  return {
    lens_type: "explain",
    prakriti_dosha: "Vata",
    title: "Benchmark",
    markdown_body: "",
    key_points: [],
    citations: [],
    used_fallback: true,
  };
}

/**
 * Default is DRY_RUN. Live spend requires ORYZEN_LIVE_BENCHMARK=1 AND a paid
 * provider key. This function never sets that flag. Do not execute live from
 * agents or CI.
 */
export async function runControlledBenchmark(options?: {
  mode?: ControlledBenchmarkMode;
  fetchImpl?: FetchLike;
}): Promise<ControlledBenchmarkReport> {
  const requested = options?.mode ?? "dry_run";
  const liveAuthorized = isControlledLiveBenchmarkAuthorized();
  const mode: ControlledBenchmarkReport["mode"] =
    requested === "live"
      ? liveAuthorized
        ? "live"
        : "refused_live"
      : "dry_run";

  const planned = plannedControlledCalls();
  const reservedRetryUsd = CONTROLLED_BENCHMARK_RESERVED_RETRIES * worstCaseCallUsd();
  const guard: BenchmarkSpendGuard = {
    spentUsd: 0,
    callsMade: 0,
    reservedRetrySlots: CONTROLLED_BENCHMARK_RESERVED_RETRIES,
  };
  const calls: ControlledBenchmarkCall[] = [];
  let stoppedByCap = false;
  let stopReason: string | null =
    mode === "refused_live"
      ? "ORYZEN_LIVE_BENCHMARK=1 and a paid provider key are both required"
      : null;

  for (const item of planned) {
    const estimatedUsd = conservativeCallUsd(item.model);
    const afford = canAffordControlledBenchmarkCall(guard, estimatedUsd);
    if (!afford.ok) {
      stoppedByCap = true;
      stopReason = afford.reason;
      calls.push({
        kind: "REFUSED",
        liveCall: false,
        ...item,
        estimatedUsd,
        reservedRetryUsd: guard.reservedRetrySlots * worstCaseCallUsd(),
        blockedReason: afford.reason,
      });
      break;
    }

    if (mode !== "live") {
      calls.push({
        kind: "ESTIMATE",
        liveCall: false,
        ...item,
        estimatedUsd,
        reservedRetryUsd: guard.reservedRetrySlots * worstCaseCallUsd(),
        blockedReason: mode === "refused_live" ? stopReason : null,
      });
      continue;
    }

    const fixture = DOMAIN_FIXTURES.find((row) => row.domain === item.domain);
    if (!fixture) {
      calls.push({
        kind: "REFUSED",
        liveCall: false,
        ...item,
        estimatedUsd,
        reservedRetryUsd: guard.reservedRetrySlots * worstCaseCallUsd(),
        blockedReason: "missing_fixture",
      });
      continue;
    }

    const provider =
      item.model === "gpt-6-luna"
        ? "openai"
        : item.model === "ministral-3b-2512"
          ? "mistral"
          : "google";
    const result = await callProviderStructuredLens({
      provider,
      model: item.model,
      prompt: `${fixture.passage}\nTask: ${item.task}\n${CONTROLLED_BENCHMARK_EVAL_CRITERIA[item.task]}`,
      fallback: emptyFallbackPayload(),
      fetchImpl: options?.fetchImpl,
    });
    const spent = listPriceUsd(
      item.model,
      result.promptTokens ?? TYPICAL_LENS_INPUT_TOKENS,
      result.completionTokens ?? TYPICAL_LENS_OUTPUT_TOKENS
    );
    guard.callsMade += 1;
    guard.spentUsd = Number((guard.spentUsd + spent).toFixed(8));
    calls.push({
      kind: "LIVE",
      liveCall: true,
      ...item,
      estimatedUsd: spent,
      reservedRetryUsd: guard.reservedRetrySlots * worstCaseCallUsd(),
      blockedReason: result.errorClass,
    });
  }

  const estimatedUsd = calls
    .filter((row) => row.kind === "ESTIMATE" || row.kind === "LIVE")
    .reduce((sum, row) => sum + row.estimatedUsd, 0);

  return {
    mode,
    liveAuthorized,
    liveCall: mode === "live",
    plannedCalls: CONTROLLED_BENCHMARK_PLANNED_CALLS,
    maxCalls: CONTROLLED_BENCHMARK_MAX_CALLS,
    reservedRetries: CONTROLLED_BENCHMARK_RESERVED_RETRIES,
    hardCapUsd: CONTROLLED_BENCHMARK_HARD_CAP_USD,
    estimatedUsd: Number(estimatedUsd.toFixed(8)),
    reservedRetryBudgetUsd: Number(reservedRetryUsd.toFixed(8)),
    maxExposureUsd: Number(
      Math.min(
        CONTROLLED_BENCHMARK_HARD_CAP_USD,
        estimatedUsd + reservedRetryUsd
      ).toFixed(8)
    ),
    spentUsd: mode === "live" ? guard.spentUsd : 0,
    stoppedByCap,
    stopReason,
    evalCriteria: CONTROLLED_BENCHMARK_EVAL_CRITERIA,
    calls,
  };
}

/** Product Gemini run: 18 planned + 6 reserved retries. Separate from the 36-call model bake-off. */
export const GEMINI_EDU_HARD_CAP_USD = 2;
export const GEMINI_EDU_PLANNED_CALLS = 18;
export const GEMINI_EDU_RESERVED_RETRIES = 6;
export const GEMINI_EDU_MAX_CALLS = 24;
export const GEMINI_EDU_MODEL = "gemini-3.5-flash-lite" as const;
export const GEMINI_EDU_MAX_INPUT_TOKENS = 4000;
export const GEMINI_EDU_MAX_OUTPUT_TOKENS = 800;

/** Focused quality retest. Do not run live without explicit owner approval. */
export const GEMINI_QUALITY_RETEST_PLAN = [
  { domain: "mathematics" as const, mode: "explain_simple" as const },
  { domain: "mathematics" as const, mode: "explain_standard" as const },
  { domain: "mathematics" as const, mode: "explain_deeper" as const },
  { domain: "mathematics" as const, mode: "story" as const },
  { domain: "science" as const, mode: "test_me" as const },
  { domain: "mathematics" as const, mode: "test_me" as const },
  { domain: "mathematics" as const, mode: "ask_my_book_supported" as const },
  { domain: "mathematics" as const, mode: "ask_my_book_unsupported" as const },
] as const;

export const GEMINI_QUALITY_RETEST_RESERVED_RETRIES = 2;
export const GEMINI_QUALITY_RETEST_MAX_CALLS = 10;
/** Cumulative spend from the approved 18-case Preview run. Do not reset the $2 cap. */
export const GEMINI_PRIOR_LEDGER_USD = 0.0888857;

export const GEMINI_QUALITY_RETEST_QUESTIONS = {
  ask_my_book_supported: "How do you solve ax + b = 0 for x?",
  ask_my_book_unsupported:
    "What is the quadratic formula for ax² + bx + c = 0?",
} as const;

export const GEMINI_QUALITY_RETEST_CRITERIA = {
  explain_simple:
    "Simple explanation teaches the unknown, the form ax + b = 0, and one inverse-operation example without inventing numbers",
  explain_standard:
    "Standard explanation names coefficient a ≠ 0, inverse operations, verification, and the straight-line graph",
  explain_deeper:
    "Deeper explanation is distinct from Simple/Standard; covers why a ≠ 0 and a common misconception",
  story:
    "Story has a student isolating x or reading y = ax + b; not a copy/retell/study-skills narrative",
  test_me:
    "MCQs test understanding with misconception distractors; correctIndex is not always 0; no dummy always-A padding",
  ask_my_book_supported:
    "Answers the asked question from the excerpt with citations; does not reuse Explain",
  ask_my_book_unsupported:
    "Reports insufficient source evidence and does not invent an off-document answer",
} as const;

export function estimateGeminiQualityRetestUsd() {
  const perCall = geminiEduConservativeUsd();
  const planned = GEMINI_QUALITY_RETEST_PLAN.length * perCall;
  const reservedRetries = GEMINI_QUALITY_RETEST_RESERVED_RETRIES * perCall;
  const maxUsdIfRetriesFire = planned + reservedRetries;
  const remainingAuthorizationUsd = Number(
    (GEMINI_EDU_HARD_CAP_USD - GEMINI_PRIOR_LEDGER_USD).toFixed(8)
  );
  const projectedCumulativeUsd = Number(
    (GEMINI_PRIOR_LEDGER_USD + maxUsdIfRetriesFire).toFixed(8)
  );
  return {
    model: GEMINI_EDU_MODEL,
    officialId: MODEL_CATALOG[GEMINI_EDU_MODEL].officialId,
    billingClass: "paid_standard" as const,
    inputUsdPer1M: MODEL_CATALOG[GEMINI_EDU_MODEL].inputUsdPer1M,
    outputUsdPer1M: MODEL_CATALOG[GEMINI_EDU_MODEL].outputUsdPer1M,
    plannedCalls: GEMINI_QUALITY_RETEST_PLAN.length,
    reservedRetries: GEMINI_QUALITY_RETEST_RESERVED_RETRIES,
    conservativeUsdPerCall: perCall,
    plannedUsd: Number(planned.toFixed(8)),
    reservedRetryUsd: Number(reservedRetries.toFixed(8)),
    maxUsdIfRetriesFire: Number(maxUsdIfRetriesFire.toFixed(8)),
    priorLedgerUsd: GEMINI_PRIOR_LEDGER_USD,
    remainingAuthorizationUsd,
    projectedCumulativeUsd,
    fitsRemainingAuthorization: projectedCumulativeUsd <= GEMINI_EDU_HARD_CAP_USD,
    hardCapUsd: GEMINI_EDU_HARD_CAP_USD,
    liveAuthorized: false,
  };
}

export const GEMINI_EDU_MODES = [
  "explain_simple",
  "explain_standard",
  "explain_deeper",
  "illustrate_flowchart",
  "illustrate_mindmap",
  "story",
  "revise",
  "test_me",
  "ask_my_book",
] as const;

export type GeminiEduMode = (typeof GEMINI_EDU_MODES)[number];
export type GeminiEduSubject = "science" | "mathematics";

export const GEMINI_EDU_EVAL_CRITERIA: Record<GeminiEduMode, string> = {
  explain_simple:
    "simpleExplanation present; fixture terms ≥ 0.4; no invented chapter; useful to a Class 8–10 student",
  explain_standard:
    "standardExplanation present; stays inside the excerpt; names the governing idea",
  explain_deeper:
    "deeperExplanation present; no invented quantities or chapters; still source-grounded",
  illustrate_flowchart:
    "flowchart has ≥2 nodes, ≥1 edge, every edge endpoint exists; no image generation",
  illustrate_mindmap:
    "mind-map has ≥2 nodes, ≥1 edge, every edge endpoint exists; labels match the excerpt",
  story:
    "story opening + close present; teaching, not filler; stays inside the excerpt",
  revise:
    "revisionTable has ≥2 topic/remember rows that a student can recopy",
  test_me:
    "≥1 MCQ with exactly 4 options and a valid correctIndex 0–3; explanation cites the excerpt",
  ask_my_book:
    "answer length > 40; stays inside the excerpt; at least one citation or quoted phrase",
};

const GEMINI_EDU_TASK: Record<GeminiEduMode, BenchmarkTaskId> = {
  explain_simple: "simple_explanation",
  explain_standard: "detailed_explanation",
  explain_deeper: "detailed_explanation",
  illustrate_flowchart: "structured_flowchart",
  illustrate_mindmap: "mind_map",
  story: "story",
  revise: "revision_guide",
  test_me: "mcq",
  ask_my_book: "source_grounded_qa",
};

export interface GeminiEduSpendGuard {
  spentUsd: number;
  callsMade: number;
  reservedRetrySlots: number;
}

export interface GeminiEduCall {
  kind: "ESTIMATE" | "REFUSED" | "LIVE";
  liveCall: boolean;
  mode: GeminiEduMode;
  domain: GeminiEduSubject;
  model: typeof GEMINI_EDU_MODEL;
  estimatedUsd: number;
  estimatedInr: number;
  reservedRetryUsd: number;
  promptTokens: number | null;
  completionTokens: number | null;
  measuredUsd: number | null;
  measuredInr: number | null;
  accuracy: number | null;
  fidelity: number | null;
  educationalUseful: boolean | null;
  citationsOk: boolean | null;
  diagramValid: boolean | null;
  blockedReason: string | null;
}

export interface GeminiEduReport {
  mode: "dry_run" | "refused_live" | "live";
  liveAuthorized: boolean;
  liveCall: boolean;
  plannedCalls: number;
  maxCalls: number;
  reservedRetries: number;
  hardCapUsd: number;
  model: typeof GEMINI_EDU_MODEL;
  conservativeUsdPerCall: number;
  estimatedUsd: number;
  reservedRetryBudgetUsd: number;
  maxExposureUsd: number;
  spentUsd: number;
  spentInr: number;
  stoppedByCap: boolean;
  stoppedByUncertainty: boolean;
  stopReason: string | null;
  evalCriteria: typeof GEMINI_EDU_EVAL_CRITERIA;
  calls: GeminiEduCall[];
}

export function geminiEduConservativeUsd(): number {
  return listPriceUsd(
    GEMINI_EDU_MODEL,
    GEMINI_EDU_MAX_INPUT_TOKENS,
    GEMINI_EDU_MAX_OUTPUT_TOKENS
  );
}

export function isGeminiEducationalLiveAuthorized(): boolean {
  return (
    process.env[CONTROLLED_BENCHMARK_LIVE_FLAG] === "1" && hasUsableGoogleKey()
  );
}

/**
 * Check the $2 cap before every planned call and every reserved retry.
 * Uses the conservative 4000/800 ceiling, not the typical 2000/400 estimate.
 */
export function canAffordGeminiEducationalCall(
  guard: GeminiEduSpendGuard,
  nextEstimateUsd: number
): { ok: boolean; reason: string | null } {
  if (!Number.isFinite(nextEstimateUsd) || nextEstimateUsd < 0) {
    return { ok: false, reason: "uncertain_token_accounting" };
  }
  if (guard.callsMade >= GEMINI_EDU_MAX_CALLS) {
    return { ok: false, reason: "max_calls" };
  }
  const reservedUsd = guard.reservedRetrySlots * geminiEduConservativeUsd();
  const projected = guard.spentUsd + nextEstimateUsd + reservedUsd;
  if (projected > GEMINI_EDU_HARD_CAP_USD) {
    return { ok: false, reason: "hard_cap" };
  }
  return { ok: true, reason: null };
}

function plannedGeminiEduCalls(): Array<{
  mode: GeminiEduMode;
  domain: GeminiEduSubject;
}> {
  const planned: Array<{ mode: GeminiEduMode; domain: GeminiEduSubject }> = [];
  for (const domain of ["science", "mathematics"] as const) {
    for (const mode of GEMINI_EDU_MODES) {
      planned.push({ mode, domain });
    }
  }
  return planned;
}

function citationsOk(task: BenchmarkTaskId, fixture: DomainFixture, payload: AiLensResponsePayload) {
  const haystack = [
    payload.markdown_body,
    ...(payload.key_points ?? []),
    ...(payload.citations ?? []).map((row) => JSON.stringify(row)),
  ]
    .join(" ")
    .toLowerCase();
  const quoted = fixture.passage
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4)
    .slice(0, 4)
    .some((term) => haystack.includes(term));
  if (task === "source_grounded_qa") {
    return (payload.citations?.length ?? 0) > 0 || quoted;
  }
  return quoted;
}

function educationalUseful(score: TaskScore, citations: boolean) {
  return score.formatOk && score.fidelity >= 0.4 && citations;
}

function scoreGeminiEduCall(
  mode: GeminiEduMode,
  fixture: DomainFixture,
  payload: AiLensResponsePayload
) {
  const task = GEMINI_EDU_TASK[mode];
  const score = scorePayload(task, fixture, payload);
  const cited = citationsOk(task, fixture, payload);
  return {
    accuracy: score.accuracy,
    fidelity: score.fidelity,
    educationalUseful: educationalUseful(score, cited),
    citationsOk: cited,
    diagramValid: score.diagramValid,
  };
}

/**
 * Default DRY_RUN. Live spend requires ORYZEN_LIVE_BENCHMARK=1 and a Google
 * key. This function never writes those env vars and never invents token counts.
 */
export interface GeminiEduLiveExecution {
  payload: AiLensResponsePayload;
  promptTokens?: number;
  completionTokens?: number;
  errorClass: string | null;
}

export async function runGeminiEducationalBenchmark(options?: {
  mode?: ControlledBenchmarkMode;
  fetchImpl?: FetchLike;
  executeLive?: (item: {
    mode: GeminiEduMode;
    domain: GeminiEduSubject;
    prompt: string;
  }) => Promise<GeminiEduLiveExecution>;
}): Promise<GeminiEduReport> {
  const requested = options?.mode ?? "dry_run";
  const liveAuthorized =
    Boolean(options?.executeLive) || isGeminiEducationalLiveAuthorized();
  const mode: GeminiEduReport["mode"] =
    requested === "live" ? (liveAuthorized ? "live" : "refused_live") : "dry_run";

  const conservativeUsd = geminiEduConservativeUsd();
  const reservedRetryUsd = GEMINI_EDU_RESERVED_RETRIES * conservativeUsd;
  const guard: GeminiEduSpendGuard = {
    spentUsd: 0,
    callsMade: 0,
    reservedRetrySlots: GEMINI_EDU_RESERVED_RETRIES,
  };
  const calls: GeminiEduCall[] = [];
  let stoppedByCap = false;
  let stoppedByUncertainty = false;
  let stopReason: string | null =
    mode === "refused_live"
      ? "ORYZEN_LIVE_BENCHMARK=1 and a Preview-only GEMINI_API_KEY are both required"
      : null;

  const pushRefused = (
    item: { mode: GeminiEduMode; domain: GeminiEduSubject },
    reason: string
  ) => {
    calls.push({
      kind: "REFUSED",
      liveCall: false,
      ...item,
      model: GEMINI_EDU_MODEL,
      estimatedUsd: conservativeUsd,
      estimatedInr: usdToInrEstimate(conservativeUsd),
      reservedRetryUsd: guard.reservedRetrySlots * conservativeUsd,
      promptTokens: null,
      completionTokens: null,
      measuredUsd: null,
      measuredInr: null,
      accuracy: null,
      fidelity: null,
      educationalUseful: null,
      citationsOk: null,
      diagramValid: null,
      blockedReason: reason,
    });
  };

  for (const item of plannedGeminiEduCalls()) {
    const afford = canAffordGeminiEducationalCall(guard, conservativeUsd);
    if (!afford.ok) {
      if (afford.reason === "uncertain_token_accounting") stoppedByUncertainty = true;
      else stoppedByCap = true;
      stopReason = afford.reason;
      pushRefused(item, afford.reason ?? "hard_cap");
      break;
    }

    const fixture = DOMAIN_FIXTURES.find((row) => row.domain === item.domain);
    if (!fixture) {
      stoppedByUncertainty = true;
      stopReason = "missing_fixture";
      pushRefused(item, "missing_fixture");
      break;
    }

    if (mode !== "live") {
      const chunk = fixtureChunk(fixture);
      const task = GEMINI_EDU_TASK[item.mode];
      const payload =
        item.mode === "ask_my_book"
          ? {
              ...emptyFallbackPayload(),
              markdown_body: answerFromTextbook(`What does ${fixture.title} claim?`, [
                { title: fixture.title, excerpt: fixture.passage },
              ]),
              key_points: [fixture.title],
              citations: [
                {
                  label: fixture.title,
                  document_id: chunk.document_id,
                  page_number: 1,
                  section_heading: fixture.title,
                  bounding_box: chunk.bounding_box,
                },
              ],
            }
          : composeDeterministicLensPayload({
              request: {
                documentId: chunk.document_id,
                pageNumber: 1,
                sectionHeading: fixture.title,
                selectedText: fixture.passage,
                lensType: TASK_TO_LENS[task as Exclude<BenchmarkTaskId, "source_grounded_qa">],
              },
              ragChunks: [chunk],
            });
      const scored = scoreGeminiEduCall(item.mode, fixture, payload as AiLensResponsePayload);
      calls.push({
        kind: "ESTIMATE",
        liveCall: false,
        ...item,
        model: GEMINI_EDU_MODEL,
        estimatedUsd: conservativeUsd,
        estimatedInr: usdToInrEstimate(conservativeUsd),
        reservedRetryUsd: guard.reservedRetrySlots * conservativeUsd,
        promptTokens: GEMINI_EDU_MAX_INPUT_TOKENS,
        completionTokens: GEMINI_EDU_MAX_OUTPUT_TOKENS,
        measuredUsd: null,
        measuredInr: null,
        ...scored,
        blockedReason: mode === "refused_live" ? stopReason : null,
      });
      continue;
    }

    const prompt = `${fixture.passage}\nProduct mode: ${item.mode}\n${GEMINI_EDU_EVAL_CRITERIA[item.mode]}`;
    const result = options?.executeLive
      ? await options.executeLive({ ...item, prompt })
      : await callProviderStructuredLens({
          provider: "google",
          model: GEMINI_EDU_MODEL,
          prompt,
          fallback: emptyFallbackPayload(),
          fetchImpl: options?.fetchImpl,
          maxAttempts: 1,
          maxOutputTokens: GEMINI_EDU_MAX_OUTPUT_TOKENS,
        });

    if (
      typeof result.promptTokens !== "number" ||
      typeof result.completionTokens !== "number"
    ) {
      stoppedByUncertainty = true;
      stopReason = "uncertain_token_accounting";
      pushRefused(item, "uncertain_token_accounting");
      break;
    }

    const measuredUsd = listPriceUsd(
      GEMINI_EDU_MODEL,
      result.promptTokens,
      result.completionTokens
    );
    if (!Number.isFinite(measuredUsd)) {
      stoppedByUncertainty = true;
      stopReason = "uncertain_token_accounting";
      pushRefused(item, "uncertain_token_accounting");
      break;
    }

    guard.callsMade += 1;
    guard.spentUsd = Number((guard.spentUsd + measuredUsd).toFixed(8));
    const scored = scoreGeminiEduCall(item.mode, fixture, result.payload);
    const failedEval =
      !scored.educationalUseful || result.errorClass !== null;
    calls.push({
      kind: "LIVE",
      liveCall: true,
      ...item,
      model: GEMINI_EDU_MODEL,
      estimatedUsd: conservativeUsd,
      estimatedInr: usdToInrEstimate(conservativeUsd),
      reservedRetryUsd: guard.reservedRetrySlots * conservativeUsd,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      measuredUsd,
      measuredInr: usdToInrEstimate(measuredUsd),
      ...scored,
      blockedReason: result.errorClass,
    });

    if (failedEval && guard.reservedRetrySlots > 0) {
      const retryAfford = canAffordGeminiEducationalCall(guard, conservativeUsd);
      if (!retryAfford.ok) {
        if (retryAfford.reason === "uncertain_token_accounting") {
          stoppedByUncertainty = true;
        } else {
          stoppedByCap = true;
        }
        stopReason = retryAfford.reason;
        break;
      }
      guard.reservedRetrySlots -= 1;
      const retryPrompt = `${fixture.passage}\nProduct mode: ${item.mode}\nRetry.\n${GEMINI_EDU_EVAL_CRITERIA[item.mode]}`;
      const retry = options?.executeLive
        ? await options.executeLive({ ...item, prompt: retryPrompt })
        : await callProviderStructuredLens({
            provider: "google",
            model: GEMINI_EDU_MODEL,
            prompt: retryPrompt,
            fallback: emptyFallbackPayload(),
            fetchImpl: options?.fetchImpl,
            maxAttempts: 1,
            maxOutputTokens: GEMINI_EDU_MAX_OUTPUT_TOKENS,
          });
      if (
        typeof retry.promptTokens !== "number" ||
        typeof retry.completionTokens !== "number"
      ) {
        stoppedByUncertainty = true;
        stopReason = "uncertain_token_accounting";
        break;
      }
      const retryUsd = listPriceUsd(
        GEMINI_EDU_MODEL,
        retry.promptTokens,
        retry.completionTokens
      );
      guard.callsMade += 1;
      guard.spentUsd = Number((guard.spentUsd + retryUsd).toFixed(8));
      const retryScore = scoreGeminiEduCall(item.mode, fixture, retry.payload);
      calls.push({
        kind: "LIVE",
        liveCall: true,
        ...item,
        model: GEMINI_EDU_MODEL,
        estimatedUsd: conservativeUsd,
        estimatedInr: usdToInrEstimate(conservativeUsd),
        reservedRetryUsd: guard.reservedRetrySlots * conservativeUsd,
        promptTokens: retry.promptTokens,
        completionTokens: retry.completionTokens,
        measuredUsd: retryUsd,
        measuredInr: usdToInrEstimate(retryUsd),
        ...retryScore,
        blockedReason: retry.errorClass ?? "retry",
      });
    }
  }

  const estimatedUsd = calls
    .filter((row) => row.kind === "ESTIMATE")
    .reduce((sum, row) => sum + row.estimatedUsd, 0);

  return {
    mode,
    liveAuthorized,
    liveCall: mode === "live",
    plannedCalls: GEMINI_EDU_PLANNED_CALLS,
    maxCalls: GEMINI_EDU_MAX_CALLS,
    reservedRetries: GEMINI_EDU_RESERVED_RETRIES,
    hardCapUsd: GEMINI_EDU_HARD_CAP_USD,
    model: GEMINI_EDU_MODEL,
    conservativeUsdPerCall: conservativeUsd,
    estimatedUsd: Number(estimatedUsd.toFixed(8)),
    reservedRetryBudgetUsd: Number(reservedRetryUsd.toFixed(8)),
    maxExposureUsd: Number(
      Math.min(GEMINI_EDU_HARD_CAP_USD, estimatedUsd + reservedRetryUsd).toFixed(8)
    ),
    spentUsd: mode === "live" ? guard.spentUsd : 0,
    spentInr: mode === "live" ? usdToInrEstimate(guard.spentUsd) : 0,
    stoppedByCap,
    stoppedByUncertainty,
    stopReason,
    evalCriteria: GEMINI_EDU_EVAL_CRITERIA,
    calls,
  };
}

export type QualityRetestMode = (typeof GEMINI_QUALITY_RETEST_PLAN)[number]["mode"];
export type QualityRetestDisposition =
  | "accepted"
  | "transformed"
  | "rejected"
  | "fallback";

export interface QualityRetestLiveExecution {
  payload: AiLensResponsePayload;
  promptTokens?: number;
  completionTokens?: number;
  errorClass: string | null;
  modelUsed?: string;
  providerUsed?: string;
  usedDeterministicFallback?: boolean;
  usedProviderFallback?: boolean;
  fallbackReason?: string | null;
}

export interface QualityRetestCall {
  kind: "ESTIMATE" | "REFUSED" | "LIVE";
  liveCall: boolean;
  attempt: number;
  isRetry: boolean;
  mode: QualityRetestMode;
  domain: "science" | "mathematics";
  model: typeof GEMINI_EDU_MODEL;
  officialId: string;
  billingClass: "paid_standard";
  studentQuestion: string | null;
  sourceTitle: string;
  sourcePassage: string;
  inputExcerpt: string;
  outputText: string;
  payload: AiLensResponsePayload | null;
  educationalPass: boolean | null;
  defects: string[];
  disposition: QualityRetestDisposition | null;
  estimatedUsd: number;
  promptTokens: number | null;
  completionTokens: number | null;
  measuredUsd: number | null;
  modelUsed: string | null;
  providerUsed: string | null;
  blockedReason: string | null;
}

export interface QualityRetestReport {
  mode: "dry_run" | "refused_live" | "live";
  liveAuthorized: boolean;
  liveCall: boolean;
  model: typeof GEMINI_EDU_MODEL;
  officialId: string;
  billingClass: "paid_standard";
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  plannedCalls: number;
  reservedRetries: number;
  maxCalls: number;
  hardCapUsd: number;
  conservativeUsdPerCall: number;
  priorLedgerUsd: number;
  runSpentUsd: number;
  cumulativeUsd: number;
  remainingUsd: number;
  plannedUsd: number;
  reservedRetryUsd: number;
  maxUsdIfRetriesFire: number;
  fitsRemainingAuthorization: boolean;
  stoppedByCap: boolean;
  stoppedByUncertainty: boolean;
  stoppedByQuality: boolean;
  stopReason: string | null;
  passCount: number;
  failCount: number;
  fallbackCount: number;
  evalCriteria: typeof GEMINI_QUALITY_RETEST_CRITERIA;
  questions: typeof GEMINI_QUALITY_RETEST_QUESTIONS;
  calls: QualityRetestCall[];
}

export function canAffordGeminiQualityRetestCall(
  guard: GeminiEduSpendGuard,
  nextEstimateUsd: number
): { ok: boolean; reason: string | null } {
  if (!Number.isFinite(nextEstimateUsd) || nextEstimateUsd < 0) {
    return { ok: false, reason: "uncertain_token_accounting" };
  }
  if (guard.callsMade >= GEMINI_QUALITY_RETEST_MAX_CALLS) {
    return { ok: false, reason: "max_calls" };
  }
  const reservedUsd = guard.reservedRetrySlots * geminiEduConservativeUsd();
  const projected = guard.spentUsd + nextEstimateUsd + reservedUsd;
  if (projected > GEMINI_EDU_HARD_CAP_USD) {
    return { ok: false, reason: "hard_cap" };
  }
  return { ok: true, reason: null };
}

function qualityRetestLens(mode: QualityRetestMode): GatewayTaskType {
  if (mode === "story") return "story";
  if (mode === "test_me") return "test_me";
  if (mode.startsWith("ask_my_book")) return "ask_my_book";
  return "explain";
}

function qualityRetestQuestion(mode: QualityRetestMode): string | undefined {
  if (mode === "ask_my_book_supported") {
    return GEMINI_QUALITY_RETEST_QUESTIONS.ask_my_book_supported;
  }
  if (mode === "ask_my_book_unsupported") {
    return GEMINI_QUALITY_RETEST_QUESTIONS.ask_my_book_unsupported;
  }
  return undefined;
}

function unlabeledInventedMath(text: string): boolean {
  const invented = /2x\s*\+\s*4|x\s*=\s*-2\b|3x\s*\+\s*6|x\s*=\s*-3\b|quadratic formula|x\s*=\s*\(-b/i.test(
    text
  );
  if (!invented) return false;
  return !/illustrative|for example,? if|suppose |not from the (excerpt|source)|example only/i.test(
    text
  );
}

function educationalText(mode: QualityRetestMode, payload: AiLensResponsePayload): string {
  if (mode === "explain_simple") return payload.explain?.simpleExplanation ?? payload.markdown_body;
  if (mode === "explain_standard") {
    return payload.explain?.standardExplanation ?? payload.markdown_body;
  }
  if (mode === "explain_deeper") return payload.explain?.deeperExplanation ?? payload.markdown_body;
  if (mode === "story") {
    return [payload.story?.opening, payload.story?.turningPoint, payload.story?.close]
      .filter(Boolean)
      .join(" ");
  }
  if (mode === "test_me") {
    return (payload.mcqs ?? [])
      .map((item) => `${item.question} ${item.options.join(" ")} ${item.explanation}`)
      .join("\n");
  }
  return payload.askMyBook?.answer ?? payload.markdown_body;
}

export function scoreQualityRetestCase(
  mode: QualityRetestMode,
  fixture: DomainFixture,
  payload: AiLensResponsePayload,
  studentQuestion?: string
): { pass: boolean; defects: string[] } {
  const defects: string[] = [];
  const text = educationalText(mode, payload);
  if (!text.trim()) defects.push("empty_output");
  if (isGenericExplainTemplate(text)) defects.push("generic_template");

  if (mode.startsWith("explain")) {
    if (!/ax\s*\+\s*b/.test(text)) defects.push("missing_form");
    if (unlabeledInventedMath(text)) defects.push("invented_example");
    if (mode === "explain_simple") {
      if (!/unknown|variable|one letter/i.test(text)) defects.push("missing_unknown");
      if (!/inverse|subtract|divide|x\s*=\s*-b\s*\/\s*a/i.test(text)) {
        defects.push("missing_inverse");
      }
    }
    if (mode === "explain_standard") {
      if (!/a\s*(≠|!=|is not)\s*0|not zero/i.test(text)) defects.push("missing_nonzero_a");
      if (!/inverse|subtract|divide|verify|check/i.test(text)) defects.push("missing_inverse_or_verify");
      if (!/straight line|graph/i.test(text)) defects.push("missing_graph");
    }
    if (mode === "explain_deeper") {
      const simple = payload.explain?.simpleExplanation ?? "";
      const standard = payload.explain?.standardExplanation ?? "";
      if (text && (text === simple || text === standard)) defects.push("not_distinct");
      if (!/a\s*(≠|!=|were zero)|not zero|misconception|if a were 0/i.test(text)) {
        defects.push("missing_why_a_nonzero");
      }
    }
  }

  if (mode === "story") {
    if (isGenericStudyStory(text)) defects.push("generic_story");
    if (!/isolat|solv|x\s*=|straight line|ax\s*\+\s*b/i.test(text)) {
      defects.push("not_teaching_algebra");
    }
    if (/paragraph to copy|retell the scene|copying the page/i.test(text)) {
      defects.push("copy_retell");
    }
  }

  if (mode === "test_me") {
    const mcqs = payload.mcqs ?? [];
    const valid = mcqs.filter((item) => isQualityMcq(item, fixture.passage));
    if (valid.length === 0) defects.push("no_quality_mcq");
    if (mcqs.some((item) => /not mentioned on this page|author biography|different subject/i.test(item.options.join(" ")))) {
      defects.push("dummy_options");
    }
    if (mcqs.length >= 3 && mcqs.every((item) => item.correctIndex === 0)) {
      defects.push("always_a");
    }
    if (valid.length > 0 && !valid.some((item) => item.explanation.trim().length > 8)) {
      defects.push("missing_explanation");
    }
  }

  if (mode === "ask_my_book_supported") {
    if (payload.askMyBook?.sufficientSource !== true) defects.push("should_be_sufficient");
    if (!/-b\s*\/\s*a|ax\s*\+\s*b|solve/i.test(text)) defects.push("does_not_answer_question");
    if (isGenericExplainTemplate(text)) defects.push("reused_explain");
    if (studentQuestion && payload.askMyBook?.question && !payload.askMyBook.question.toLowerCase().includes("solve")) {
      defects.push("wrong_question");
    }
    const cited = (payload.citations?.length ?? 0) > 0 || /ax\s*\+\s*b|-b\s*\/\s*a/.test(text);
    if (!cited) defects.push("missing_citation");
  }

  if (mode === "ask_my_book_unsupported") {
    if (payload.askMyBook?.sufficientSource !== false) defects.push("should_be_insufficient");
    if (/x\s*=\s*\(-b|quadratic formula\s*is/i.test(text) && !/not|insufficient|does not|no evidence/i.test(text)) {
      defects.push("invented_off_document_answer");
    }
    if (!/not|insufficient|does not|no evidence|cannot/i.test(text)) {
      defects.push("did_not_refuse");
    }
  }

  return { pass: defects.length === 0, defects };
}

function qualityDisposition(params: {
  payload: AiLensResponsePayload;
  usedDeterministicFallback?: boolean;
  errorClass: string | null;
  providerUsed?: string;
  deterministicText: string;
  scoredText: string;
}): QualityRetestDisposition {
  if (params.usedDeterministicFallback || params.payload.used_fallback) {
    return "fallback";
  }
  if (params.errorClass && params.providerUsed !== "google") return "rejected";
  if (params.providerUsed === "google" || !params.errorClass) {
    if (params.scoredText.trim() && params.scoredText.trim() === params.deterministicText.trim()) {
      return "transformed";
    }
    return "accepted";
  }
  return "rejected";
}

async function executeQualityRetestViaGateway(params: {
  mode: QualityRetestMode;
  fixture: DomainFixture;
  attempt: number;
}): Promise<QualityRetestLiveExecution> {
  const fixture = params.fixture;
  const chunk = fixtureChunk(fixture);
  const studentQuestion = qualityRetestQuestion(params.mode);
  const result = await executeControlledAiGateway({
    userId: "quality-retest-local",
    documentId: chunk.document_id,
    documentHash: `quality-retest-20261024-${params.mode}-${params.attempt}`,
    pageNumber: 1,
    sectionHeading: fixture.title,
    selectedText: fixture.passage,
    lensType: qualityRetestLens(params.mode),
    studentQuestion,
    activePageText: fixture.passage,
    candidateChunks: [chunk],
    supabase: null,
    maxProviderAttempts: 1,
  });
  return {
    payload: result.payload,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    errorClass: result.providerErrorClass,
    modelUsed: result.modelUsed,
    providerUsed: result.providerUsed,
    usedDeterministicFallback: result.usedDeterministicFallback,
    usedProviderFallback: result.usedProviderFallback,
    fallbackReason: result.fallbackReason,
  };
}

/**
 * Targeted 8-case quality retest. Seeds the $2 ledger with prior spend.
 * Live spend still requires ORYZEN_LIVE_BENCHMARK=1 and a usable Google key.
 */
export async function runGeminiQualityRetest(options?: {
  mode?: ControlledBenchmarkMode;
  fetchImpl?: FetchLike;
  priorLedgerUsd?: number;
  reservedRetries?: number;
  plan?: readonly (typeof GEMINI_QUALITY_RETEST_PLAN)[number][];
  executeLive?: (item: {
    mode: QualityRetestMode;
    domain: "science" | "mathematics";
    attempt: number;
  }) => Promise<QualityRetestLiveExecution>;
}): Promise<QualityRetestReport> {
  const requested = options?.mode ?? "dry_run";
  const liveAuthorized =
    Boolean(options?.executeLive) || isGeminiEducationalLiveAuthorized();
  const mode: QualityRetestReport["mode"] =
    requested === "live" ? (liveAuthorized ? "live" : "refused_live") : "dry_run";

  const plan = options?.plan ?? GEMINI_QUALITY_RETEST_PLAN;
  const priorLedgerUsd = options?.priorLedgerUsd ?? GEMINI_PRIOR_LEDGER_USD;
  const reservedRetries =
    options?.reservedRetries ?? GEMINI_QUALITY_RETEST_RESERVED_RETRIES;
  const conservativeUsd = geminiEduConservativeUsd();
  const plannedUsd = plan.length * conservativeUsd;
  const reservedRetryUsd = reservedRetries * conservativeUsd;
  const maxUsdIfRetriesFire = plannedUsd + reservedRetryUsd;
  const catalog = MODEL_CATALOG[GEMINI_EDU_MODEL];
  const preflightFits =
    priorLedgerUsd + maxUsdIfRetriesFire <= GEMINI_EDU_HARD_CAP_USD;

  const guard: GeminiEduSpendGuard = {
    spentUsd: priorLedgerUsd,
    callsMade: 0,
    reservedRetrySlots: reservedRetries,
  };
  const calls: QualityRetestCall[] = [];
  let stoppedByCap = false;
  let stoppedByUncertainty = false;
  let stoppedByQuality = false;
  let stopReason: string | null =
    mode === "refused_live"
      ? "ORYZEN_LIVE_BENCHMARK=1 and a Preview-only GEMINI_API_KEY are both required"
      : !preflightFits
        ? "hard_cap"
        : null;

  const startingSpent = priorLedgerUsd;
  let educationalFails = 0;
  let fallbacks = 0;

  const pushCall = (row: QualityRetestCall) => {
    calls.push(row);
  };

  const refusedRow = (
    item: (typeof GEMINI_QUALITY_RETEST_PLAN)[number],
    reason: string,
    attempt = 1
  ): QualityRetestCall => {
    const fixture = DOMAIN_FIXTURES.find((row) => row.domain === item.domain);
    return {
      kind: "REFUSED",
      liveCall: false,
      attempt,
      isRetry: attempt > 1,
      mode: item.mode,
      domain: item.domain,
      model: GEMINI_EDU_MODEL,
      officialId: catalog.officialId,
      billingClass: "paid_standard",
      studentQuestion: qualityRetestQuestion(item.mode) ?? null,
      sourceTitle: fixture?.title ?? "",
      sourcePassage: fixture?.passage ?? "",
      inputExcerpt: fixture?.passage ?? "",
      outputText: "",
      payload: null,
      educationalPass: null,
      defects: [reason],
      disposition: "rejected",
      estimatedUsd: conservativeUsd,
      promptTokens: null,
      completionTokens: null,
      measuredUsd: null,
      modelUsed: null,
      providerUsed: null,
      blockedReason: reason,
    };
  };

  const runOne = async (
    item: (typeof GEMINI_QUALITY_RETEST_PLAN)[number],
    attempt: number,
    isRetry: boolean
  ): Promise<"ok" | "stop"> => {
    const afford = canAffordGeminiQualityRetestCall(guard, conservativeUsd);
    if (!afford.ok) {
      if (afford.reason === "uncertain_token_accounting") stoppedByUncertainty = true;
      else stoppedByCap = true;
      stopReason = afford.reason;
      pushCall(refusedRow(item, afford.reason ?? "hard_cap", attempt));
      return "stop";
    }

    const fixture = DOMAIN_FIXTURES.find((row) => row.domain === item.domain);
    if (!fixture) {
      stoppedByUncertainty = true;
      stopReason = "missing_fixture";
      pushCall(refusedRow(item, "missing_fixture", attempt));
      return "stop";
    }

    const studentQuestion = qualityRetestQuestion(item.mode);
    const chunk = fixtureChunk(fixture);
    const deterministic = composeDeterministicLensPayload({
      request: {
        documentId: chunk.document_id,
        pageNumber: 1,
        sectionHeading: fixture.title,
        selectedText: fixture.passage,
        lensType: qualityRetestLens(item.mode),
        studentQuestion,
      },
      ragChunks: [chunk],
    });

    if (mode !== "live") {
      const scored = scoreQualityRetestCase(
        item.mode,
        fixture,
        deterministic as AiLensResponsePayload,
        studentQuestion
      );
      pushCall({
        kind: "ESTIMATE",
        liveCall: false,
        attempt,
        isRetry,
        mode: item.mode,
        domain: item.domain,
        model: GEMINI_EDU_MODEL,
        officialId: catalog.officialId,
        billingClass: "paid_standard",
        studentQuestion: studentQuestion ?? null,
        sourceTitle: fixture.title,
        sourcePassage: fixture.passage,
        inputExcerpt: fixture.passage,
        outputText: educationalText(item.mode, deterministic as AiLensResponsePayload),
        payload: deterministic as AiLensResponsePayload,
        educationalPass: scored.pass,
        defects: scored.defects,
        disposition: "fallback",
        estimatedUsd: conservativeUsd,
        promptTokens: GEMINI_EDU_MAX_INPUT_TOKENS,
        completionTokens: GEMINI_EDU_MAX_OUTPUT_TOKENS,
        measuredUsd: null,
        modelUsed: "deterministic",
        providerUsed: "deterministic",
        blockedReason: mode === "refused_live" ? stopReason : null,
      });
      return "ok";
    }

    const result = options?.executeLive
      ? await options.executeLive({ mode: item.mode, domain: item.domain, attempt })
      : await executeQualityRetestViaGateway({
          mode: item.mode,
          fixture,
          attempt,
        });

    if (
      typeof result.promptTokens !== "number" ||
      typeof result.completionTokens !== "number"
    ) {
      stoppedByUncertainty = true;
      stopReason = "uncertain_token_accounting";
      pushCall(refusedRow(item, "uncertain_token_accounting", attempt));
      return "stop";
    }

    const measuredUsd = listPriceUsd(
      GEMINI_EDU_MODEL,
      result.promptTokens,
      result.completionTokens
    );
    if (!Number.isFinite(measuredUsd)) {
      stoppedByUncertainty = true;
      stopReason = "uncertain_token_accounting";
      pushCall(refusedRow(item, "uncertain_token_accounting", attempt));
      return "stop";
    }

    guard.callsMade += 1;
    guard.spentUsd = Number((guard.spentUsd + measuredUsd).toFixed(8));

    const scored = scoreQualityRetestCase(item.mode, fixture, result.payload, studentQuestion);
    const disposition = qualityDisposition({
      payload: result.payload,
      usedDeterministicFallback: result.usedDeterministicFallback,
      errorClass: result.errorClass,
      providerUsed: result.providerUsed,
      deterministicText: educationalText(item.mode, deterministic as AiLensResponsePayload),
      scoredText: educationalText(item.mode, result.payload),
    });
    const educationalPass =
      (disposition === "accepted" || disposition === "transformed") &&
      scored.pass &&
      !result.errorClass;

    pushCall({
      kind: "LIVE",
      liveCall: true,
      attempt,
      isRetry,
      mode: item.mode,
      domain: item.domain,
      model: GEMINI_EDU_MODEL,
      officialId: catalog.officialId,
      billingClass: "paid_standard",
      studentQuestion: studentQuestion ?? null,
      sourceTitle: fixture.title,
      sourcePassage: fixture.passage,
      inputExcerpt: fixture.passage,
      outputText: educationalText(item.mode, result.payload),
      payload: result.payload,
      educationalPass,
      defects:
        disposition === "fallback"
          ? [...scored.defects, "fallback_not_gemini_success"]
          : scored.defects,
      disposition,
      estimatedUsd: conservativeUsd,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      measuredUsd,
      modelUsed: result.modelUsed ?? GEMINI_EDU_MODEL,
      providerUsed: result.providerUsed ?? "google",
      blockedReason: result.errorClass,
    });

    if (
      result.errorClass === "billing" ||
      result.errorClass === "quota" ||
      result.errorClass === "auth" ||
      result.errorClass === "missing_key"
    ) {
      stoppedByUncertainty = true;
      stopReason = result.errorClass;
      return "stop";
    }

    return "ok";
  };

  if (!preflightFits) {
    stoppedByCap = true;
    for (const item of plan) {
      pushCall(refusedRow(item, "hard_cap"));
    }
  } else {
    for (const item of plan) {
      const first = await runOne(item, 1, false);
      if (first === "stop") break;
      const last = calls[calls.length - 1];
      const shouldRetry =
        mode === "live" &&
        last?.kind === "LIVE" &&
        last.educationalPass === false &&
        guard.reservedRetrySlots > 0 &&
        !stoppedByQuality;
      if (shouldRetry) {
        guard.reservedRetrySlots -= 1;
        const retry = await runOne(item, 2, true);
        if (retry === "stop") break;
      }
      const latest = [...calls].reverse().find((row) => row.mode === item.mode && row.kind === "LIVE");
      if (latest?.disposition === "fallback") fallbacks += 1;
      if (latest && latest.educationalPass === false) educationalFails += 1;
      if (fallbacks >= 2 || educationalFails >= 3) {
        stoppedByQuality = true;
        stopReason = fallbacks >= 2 ? "significant_fallback" : "significant_educational_failure";
        break;
      }
    }
  }

  const runSpentUsd = Number((guard.spentUsd - startingSpent).toFixed(8));
  const cumulativeUsd = mode === "live" ? guard.spentUsd : startingSpent;
  const remainingUsd = Number((GEMINI_EDU_HARD_CAP_USD - cumulativeUsd).toFixed(8));
  const liveRows = calls.filter((row) => row.kind === "LIVE" && !row.isRetry);
  const passCount = liveRows.filter((row) => row.educationalPass).length;
  const failCount = liveRows.filter((row) => row.educationalPass === false).length;
  const fallbackCount = calls.filter((row) => row.disposition === "fallback" && row.kind === "LIVE").length;

  return {
    mode,
    liveAuthorized,
    liveCall: mode === "live",
    model: GEMINI_EDU_MODEL,
    officialId: catalog.officialId,
    billingClass: "paid_standard",
    inputUsdPer1M: catalog.inputUsdPer1M,
    outputUsdPer1M: catalog.outputUsdPer1M,
    plannedCalls: plan.length,
    reservedRetries,
    maxCalls: GEMINI_QUALITY_RETEST_MAX_CALLS,
    hardCapUsd: GEMINI_EDU_HARD_CAP_USD,
    conservativeUsdPerCall: conservativeUsd,
    priorLedgerUsd: startingSpent,
    runSpentUsd: mode === "live" ? runSpentUsd : 0,
    cumulativeUsd,
    remainingUsd,
    plannedUsd: Number(plannedUsd.toFixed(8)),
    reservedRetryUsd: Number(reservedRetryUsd.toFixed(8)),
    maxUsdIfRetriesFire: Number(maxUsdIfRetriesFire.toFixed(8)),
    fitsRemainingAuthorization: preflightFits,
    stoppedByCap,
    stoppedByUncertainty,
    stoppedByQuality,
    stopReason,
    passCount: mode === "live" ? passCount : 0,
    failCount: mode === "live" ? failCount : 0,
    fallbackCount: mode === "live" ? fallbackCount : 0,
    evalCriteria: GEMINI_QUALITY_RETEST_CRITERIA,
    questions: GEMINI_QUALITY_RETEST_QUESTIONS,
    calls,
  };
}
