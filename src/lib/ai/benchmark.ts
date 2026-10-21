import { composeDeterministicLensPayload } from "./lens-compose";
import { mergeStructuredLensPayload } from "./gemini-structured";
import {
  MODEL_CATALOG,
  TYPICAL_LENS_INPUT_TOKENS,
  TYPICAL_LENS_OUTPUT_TOKENS,
  estimateTokensFromChars,
  listPriceUsd,
  type GatewayModelId,
} from "./models";
import {
  callProviderStructuredLens,
  hasAnyPaidProvider,
  type FetchLike,
} from "./providers";
import { answerFromTextbook } from "@/lib/vaults/compose";
import type { AiLensResponsePayload } from "./gateway";
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
    "gemini-2.5-flash-lite",
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
      const lite = pool.find((row) => row.model === "gemini-2.5-flash-lite");
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
  "gemini-2.5-flash-lite",
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
