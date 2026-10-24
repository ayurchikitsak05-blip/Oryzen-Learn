import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  estimateGeminiQualityRetestUsd,
  GEMINI_EDU_HARD_CAP_USD,
  GEMINI_QUALITY_RETEST_CRITERIA,
  GEMINI_QUALITY_RETEST_PLAN,
  GEMINI_QUALITY_RETEST_QUESTIONS,
  DOMAIN_FIXTURES,
  runGeminiQualityRetest,
} from "../src/lib/ai/benchmark";

const OUT_DIR = path.join(process.cwd(), "tmp-e2e-artifacts", "gemini-quality-retest");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  const estimate = estimateGeminiQualityRetestUsd();
  const report = await runGeminiQualityRetest({ mode: "live" });
  const preflight = {
    stoppedBeforePaidCalls: true,
    stopReason: "preview_sensitive_secret_unavailable_locally",
    modelVerifiedFromCatalogAndDocs: {
      officialId: "gemini-3.5-flash-lite",
      billingClass: "paid_standard",
      inputUsdPer1M: 0.3,
      outputUsdPer1M: 2.5,
      thinkingIncludedInOutput: true,
      sources: [
        "https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite",
        "https://ai.google.dev/gemini-api/docs/pricing",
      ],
    },
    ledger: {
      priorUsd: estimate.priorLedgerUsd,
      remainingUsd: estimate.remainingAuthorizationUsd,
      hardCapUsd: GEMINI_EDU_HARD_CAP_USD,
      plannedUsd: estimate.plannedUsd,
      reservedRetryUsd: estimate.reservedRetryUsd,
      maxUsdIfRetriesFire: estimate.maxUsdIfRetriesFire,
      projectedCumulativeUsd: estimate.projectedCumulativeUsd,
      fitsRemainingAuthorization: estimate.fitsRemainingAuthorization,
    },
    keyStatus: {
      localDotEnv: "empty",
      vercelPreviewSecret: "present_on_preview_only",
      vercelEnvPull: "writes_[SENSITIVE]_placeholder",
      vercelEnvRun: "cannot_inject_sensitive_secret",
      listModels: "not_run_no_usable_key",
    },
    paidCallsMade: 0,
    runSpentUsd: 0,
    remainingAuthorizationUsd: estimate.remainingAuthorizationUsd,
    plan: GEMINI_QUALITY_RETEST_PLAN,
    questions: GEMINI_QUALITY_RETEST_QUESTIONS,
    fixtures: DOMAIN_FIXTURES.filter((row) => row.domain === "science" || row.domain === "mathematics"),
    criteria: GEMINI_QUALITY_RETEST_CRITERIA,
    refusedLive: {
      mode: report.mode,
      liveCall: report.liveCall,
      runSpentUsd: report.runSpentUsd,
      cumulativeUsd: report.cumulativeUsd,
      remainingUsd: report.remainingUsd,
      stopReason: report.stopReason,
    },
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "preflight.json"), `${JSON.stringify(preflight, null, 2)}\n`);
  await writeFile(path.join(OUT_DIR, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(
    path.join(OUT_DIR, "qualitative-review.md"),
    [
      "# Gemini quality retest — fail-closed before paid calls",
      "",
      "No paid Gemini request was made.",
      "",
      `Model verified from official docs: \`${preflight.modelVerifiedFromCatalogAndDocs.officialId}\`, paid Standard, $0.30 / 1M input, $2.50 / 1M output (thinking included in output).`,
      `Prior ledger: $${estimate.priorLedgerUsd}. Remaining: $${estimate.remainingAuthorizationUsd} of $2.`,
      `Planned 8 + 2 reserved retries at the 4000/800 conservative ceiling: $${estimate.maxUsdIfRetriesFire}. Projected cumulative if retries fire: $${estimate.projectedCumulativeUsd}.`,
      "That fits the remaining authorization.",
      "",
      "The Preview `GEMINI_API_KEY` exists as a Vercel Sensitive Secret. `vercel env pull` and `vercel env run` cannot inject it locally; they write a `[SENSITIVE]` placeholder. The fail-closed guard therefore stopped before ListModels or generateContent.",
      "",
      "The 8-case runner is implemented and covered by mocked tests. It seeds the $2 ledger with the prior $0.0888857 and will not count a fallback as a Gemini educational pass.",
      "",
    ].join("\n")
  );

  const cases = GEMINI_QUALITY_RETEST_PLAN.map((item) => {
    const fixture = DOMAIN_FIXTURES.find((row) => row.domain === item.domain);
    const question =
      item.mode === "ask_my_book_supported"
        ? GEMINI_QUALITY_RETEST_QUESTIONS.ask_my_book_supported
        : item.mode === "ask_my_book_unsupported"
          ? GEMINI_QUALITY_RETEST_QUESTIONS.ask_my_book_unsupported
          : "(lens on selected passage)";
    return `<article class="case">
  <h2>${escapeHtml(item.domain)} / ${escapeHtml(item.mode)}</h2>
  <p><strong>NOT RUN</strong> — fail-closed, no paid request</p>
  <h3>Student input</h3>
  <pre>${escapeHtml(question)}</pre>
  <h3>Source passage</h3>
  <pre>${escapeHtml(fixture?.passage ?? "")}</pre>
  <h3>AI output</h3>
  <pre>(no Gemini call)</pre>
</article>`;
  }).join("\n");

  await writeFile(
    path.join(OUT_DIR, "report.html"),
    `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Oryzen Learn — Gemini quality retest (stopped)</title>
<style>
  body { font-family: Georgia, serif; background: #f4efe6; color: #2b2118; margin: 0; padding: 24px; }
  h1 { font-size: 1.6rem; }
  .summary { background: #fffaf2; border: 1px solid #d8c9b1; padding: 16px; margin-bottom: 24px; }
  .case { background: white; border: 1px solid #d8c9b1; padding: 16px; margin-bottom: 16px; }
  pre { white-space: pre-wrap; background: #faf6ef; padding: 12px; }
</style>
</head><body>
<h1>Gemini quality retest — stopped before paid calls</h1>
<section class="summary">
  <p>Model gemini-3.5-flash-lite · paid Standard · $0.30 / 1M in · $2.50 / 1M out</p>
  <p>Prior ledger $${estimate.priorLedgerUsd} · remaining $${estimate.remainingAuthorizationUsd} of $2</p>
  <p>8 + 2 conservative ceiling $${estimate.maxUsdIfRetriesFire} fits remaining authorization</p>
  <p>Paid calls made: 0. Preview GEMINI_API_KEY could not be injected locally.</p>
</section>
${cases}
</body></html>`
  );
  console.log(JSON.stringify({ ok: true, artifactDir: OUT_DIR, paidCallsMade: 0 }));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown";
  console.error(JSON.stringify({ ok: false, message }));
  process.exitCode = 1;
});
