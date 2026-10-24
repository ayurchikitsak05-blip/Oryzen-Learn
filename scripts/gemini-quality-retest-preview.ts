/**
 * Authenticated Preview-only 8-case Gemini quality retest.
 * The Gemini key stays on Vercel. This process never prints secrets.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DOMAIN_FIXTURES,
  GEMINI_QUALITY_RETEST_PLAN,
  GEMINI_QUALITY_RETEST_QUESTIONS,
  estimateGeminiQualityRetestUsd,
  runGeminiQualityRetest,
  type QualityRetestLiveExecution,
  type QualityRetestMode,
} from "../src/lib/ai/benchmark";

const SCOPE = "ayurchikitsak05-8316s-projects";
const ARTIFACT_DIR = join(process.cwd(), "tmp-e2e-artifacts", "gemini-quality-retest");
const ENV_PATH = join(process.cwd(), ".env.preview.local");
const COOKIE_JAR = join(tmpdir(), "oryzen-quality-retest-preview.cookies");

function loadPreviewEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    env[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return env;
}

function vercelCurl(deployment: string, path: string, extra: string[]): unknown {
  const stdout = execFileSync(
    "vercel",
    [
      "curl",
      path,
      "--deployment",
      deployment,
      "--scope",
      SCOPE,
      "--",
      "--silent",
      "--show-error",
      "--max-time",
      "90",
      "--cookie",
      COOKIE_JAR,
      "--cookie-jar",
      COOKIE_JAR,
      ...extra,
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
  );
  const jsonStart = stdout.indexOf("{");
  return JSON.parse(jsonStart >= 0 ? stdout.slice(jsonStart) : stdout);
}

function lensFor(mode: QualityRetestMode): string {
  if (mode === "story") return "story";
  if (mode === "test_me") return "test_me";
  if (mode.startsWith("ask_my_book")) return "ask_my_book";
  return "explain";
}

function questionFor(mode: QualityRetestMode): string | undefined {
  if (mode === "ask_my_book_supported") return GEMINI_QUALITY_RETEST_QUESTIONS.ask_my_book_supported;
  if (mode === "ask_my_book_unsupported") {
    return GEMINI_QUALITY_RETEST_QUESTIONS.ask_my_book_unsupported;
  }
  return undefined;
}

async function main() {
  const deployment = process.env.ORYZEN_PREVIEW_DEPLOYMENT;
  if (!deployment) {
    throw new Error("fail_closed: ORYZEN_PREVIEW_DEPLOYMENT is required");
  }

  const estimate = estimateGeminiQualityRetestUsd();
  console.log(
    JSON.stringify({
      event: "quality_retest_preflight",
      deployment,
      model: estimate.officialId,
      billingClass: estimate.billingClass,
      priorLedgerUsd: estimate.priorLedgerUsd,
      remainingAuthorizationUsd: estimate.remainingAuthorizationUsd,
      maxUsdIfRetriesFire: estimate.maxUsdIfRetriesFire,
      fitsRemainingAuthorization: estimate.fitsRemainingAuthorization,
    })
  );
  if (!estimate.fitsRemainingAuthorization) {
    throw new Error("fail_closed: planned 8+2 spend does not fit remaining $2 authorization");
  }

  const env = loadPreviewEnv();
  const login = vercelCurl(deployment, "/api/auth/password", [
    "--request",
    "POST",
    "--header",
    "Content-Type: application/json",
    "--data",
    JSON.stringify({
      action: "sign_in",
      email: env.PREVIEW_TEST_USER_A,
      password: env.PREVIEW_TEST_PASSWORD_A,
      deviceId: "gemini-quality-retest-preview",
      deviceType: "desktop",
    }),
  ]) as { status?: string; error?: string };
  if (login.status !== "authenticated") {
    throw new Error("fail_closed: preview authentication failed");
  }

  const remainingOnly = process.env.QUALITY_RETEST_REMAINING === "1";
  const report = await runGeminiQualityRetest({
    mode: "live",
    priorLedgerUsd: remainingOnly ? 0.0919558 : undefined,
    reservedRetries: remainingOnly ? 0 : undefined,
    plan: remainingOnly
      ? GEMINI_QUALITY_RETEST_PLAN.filter(
          (item) =>
            item.mode !== "explain_simple" && item.mode !== "explain_standard"
        )
      : undefined,
    executeLive: async (item: {
      mode: QualityRetestMode;
      domain: "science" | "mathematics";
      attempt: number;
    }): Promise<QualityRetestLiveExecution> => {
      const fixture = DOMAIN_FIXTURES.find((row) => row.domain === item.domain);
      if (!fixture) throw new Error("missing_fixture");
      const studentQuestion = questionFor(item.mode);
      const parsed = vercelCurl(deployment, "/api/ai/lens", [
        "--request",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--data",
        JSON.stringify({
          documentId: `quality-retest-${item.domain}`,
          documentHash: `quality-retest-preview-${Date.now()}-${item.mode}-${item.attempt}`,
          pageNumber: 1,
          sectionHeading: fixture.title,
          selectedText: fixture.passage,
          lensType: lensFor(item.mode),
          studentQuestion,
          prakritiDosha: "Vata",
          activePageText: fixture.passage,
          maxProviderAttempts: 1,
          candidateChunks: [
            {
              chunk_id: `${item.domain}-1`,
              document_id: `quality-retest-${item.domain}`,
              page_number: 1,
              section_heading: fixture.title,
              text: fixture.passage,
              bounding_box: { x: 48, y: 120, width: 440, height: 64 },
              token_estimate: 60,
            },
          ],
        }),
      ]) as {
        payload?: QualityRetestLiveExecution["payload"];
        promptTokens?: number;
        completionTokens?: number;
        error?: string;
        errorClass?: string | null;
        providerErrorClass?: string | null;
        modelUsed?: string;
        providerUsed?: string;
        usedDeterministicFallback?: boolean;
        usedProviderFallback?: boolean;
        fallbackReason?: string | null;
      };
      if (parsed.error && !parsed.payload) {
        throw new Error(String(parsed.error).slice(0, 180));
      }
      if (!parsed.payload) {
        throw new Error("fail_closed: Preview lens response had no payload");
      }
      return {
        payload: parsed.payload,
        promptTokens: parsed.promptTokens,
        completionTokens: parsed.completionTokens,
        errorClass: parsed.providerErrorClass ?? parsed.errorClass ?? null,
        modelUsed: parsed.modelUsed,
        providerUsed: parsed.providerUsed,
        usedDeterministicFallback: parsed.usedDeterministicFallback,
        usedProviderFallback: parsed.usedProviderFallback,
        fallbackReason: parsed.fallbackReason,
      };
    },
  });

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(join(ARTIFACT_DIR, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    join(ARTIFACT_DIR, "qualitative-review.md"),
    [
      "# Gemini quality retest — Preview",
      "",
      `- Deployment: ${deployment}`,
      `- Model: ${report.officialId} (${report.billingClass})`,
      `- PASS ${report.passCount} / FAIL ${report.failCount} / fallbacks ${report.fallbackCount}`,
      `- This run: $${report.runSpentUsd}`,
      `- Cumulative: $${report.cumulativeUsd}`,
      `- Remaining: $${report.remainingUsd} of $${report.hardCapUsd}`,
      `- Stop reason: ${report.stopReason ?? "none"}`,
      "",
      ...report.calls.flatMap((row) => [
        `## ${row.domain} / ${row.mode}${row.isRetry ? " (retry)" : ""} — ${
          row.educationalPass ? "PASS" : row.kind === "REFUSED" ? "REFUSED" : "FAIL"
        }`,
        "",
        `- Disposition: ${row.disposition}`,
        `- Model used: ${row.modelUsed}`,
        `- Tokens: in ${row.promptTokens} / out ${row.completionTokens}`,
        `- Cost: $${row.measuredUsd}`,
        `- Defects: ${row.defects.join(", ") || "none"}`,
        `- Question: ${row.studentQuestion ?? "(none)"}`,
        "",
        "### Source",
        "",
        row.sourcePassage,
        "",
        "### Output",
        "",
        row.outputText || "(empty)",
        "",
      ]),
    ].join("\n")
  );
  console.log(
    JSON.stringify({
      event: "quality_retest_complete",
      mode: report.mode,
      passCount: report.passCount,
      failCount: report.failCount,
      fallbackCount: report.fallbackCount,
      runSpentUsd: report.runSpentUsd,
      cumulativeUsd: report.cumulativeUsd,
      remainingUsd: report.remainingUsd,
      stopReason: report.stopReason,
    })
  );
  if (report.mode !== "live") process.exitCode = 2;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(JSON.stringify({ event: "quality_retest_aborted", message: message.slice(0, 240) }));
  process.exitCode = 1;
});
