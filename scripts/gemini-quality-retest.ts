/**
 * Owner-approved 8-case Gemini quality retest.
 * Requires ORYZEN_LIVE_BENCHMARK=1 and a Preview GEMINI_API_KEY.
 * Never prints secrets. Never raises the $2 cap.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  estimateGeminiQualityRetestUsd,
  GEMINI_EDU_HARD_CAP_USD,
  GEMINI_EDU_MODEL,
  runGeminiQualityRetest,
  type QualityRetestReport,
} from "../src/lib/ai/benchmark";
import { listGoogleModelIds } from "../src/lib/ai/providers";

const OUT_DIR = path.join(process.cwd(), "tmp-e2e-artifacts", "gemini-quality-retest");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reportHtml(report: QualityRetestReport): string {
  const cases = report.calls
    .map((row) => {
      const verdict =
        row.educationalPass === true ? "PASS" : row.kind === "REFUSED" ? "REFUSED" : "FAIL";
      return `<article class="case">
  <h2>${escapeHtml(String(row.attempt > 1 ? `${row.mode} (retry)` : row.mode))} — ${escapeHtml(row.domain)}</h2>
  <p><strong>${verdict}</strong> · disposition ${escapeHtml(row.disposition ?? "n/a")} · model ${escapeHtml(row.modelUsed ?? row.model)}</p>
  <p class="meta">in ${row.promptTokens ?? "—"} / out ${row.completionTokens ?? "—"} · $${row.measuredUsd ?? "n/a"} · defects: ${escapeHtml(row.defects.join(", ") || "none")}</p>
  <h3>Student input</h3>
  <pre>${escapeHtml(row.studentQuestion ?? "(lens on selected passage)")}</pre>
  <h3>Source passage</h3>
  <pre>${escapeHtml(row.sourcePassage)}</pre>
  <h3>AI output</h3>
  <pre>${escapeHtml(row.outputText || "(empty)")}</pre>
</article>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Oryzen Learn — Gemini quality retest</title>
<style>
  body { font-family: Georgia, serif; background: #f4efe6; color: #2b2118; margin: 0; padding: 24px; }
  h1 { font-size: 1.6rem; }
  .summary { background: #fffaf2; border: 1px solid #d8c9b1; padding: 16px; margin-bottom: 24px; }
  .case { background: white; border: 1px solid #d8c9b1; padding: 16px; margin-bottom: 16px; }
  pre { white-space: pre-wrap; background: #faf6ef; padding: 12px; }
  .meta { color: #5c4c3a; }
</style>
</head><body>
<h1>Gemini quality retest</h1>
<section class="summary">
  <p>Model ${escapeHtml(report.officialId)} · ${escapeHtml(report.billingClass)} · $${report.inputUsdPer1M}/1M in · $${report.outputUsdPer1M}/1M out</p>
  <p>PASS ${report.passCount} · FAIL ${report.failCount} · fallbacks ${report.fallbackCount}</p>
  <p>This run $${report.runSpentUsd} · cumulative $${report.cumulativeUsd} · remaining $${report.remainingUsd} of $${report.hardCapUsd}</p>
  <p>Stop reason: ${escapeHtml(report.stopReason ?? "none")}</p>
</section>
${cases}
</body></html>`;
}

function qualitativeMarkdown(report: QualityRetestReport): string {
  const lines = [
    "# Gemini quality retest",
    "",
    `- Model: \`${report.officialId}\` (${report.billingClass}, $${report.inputUsdPer1M}/1M in, $${report.outputUsdPer1M}/1M out, thinking in output)`,
    `- Prior ledger: $${report.priorLedgerUsd}`,
    `- This run: $${report.runSpentUsd}`,
    `- Cumulative: $${report.cumulativeUsd}`,
    `- Remaining authorization: $${report.remainingUsd} of $${report.hardCapUsd}`,
    `- PASS ${report.passCount} / FAIL ${report.failCount} / fallbacks ${report.fallbackCount}`,
    `- Stop reason: ${report.stopReason ?? "none"}`,
    "",
  ];
  for (const row of report.calls) {
    const verdict =
      row.educationalPass === true ? "PASS" : row.kind === "REFUSED" ? "REFUSED" : "FAIL";
    lines.push(`## ${row.domain} / ${row.mode}${row.isRetry ? " (retry)" : ""} — ${verdict}`);
    lines.push("");
    lines.push(`- Disposition: ${row.disposition}`);
    lines.push(`- Model used: ${row.modelUsed}`);
    lines.push(`- Tokens: in ${row.promptTokens} / out ${row.completionTokens}`);
    lines.push(`- Cost: $${row.measuredUsd}`);
    lines.push(`- Defects: ${row.defects.join(", ") || "none"}`);
    lines.push(`- Question: ${row.studentQuestion ?? "(none)"}`);
    lines.push("");
    lines.push("### Source");
    lines.push("");
    lines.push(row.sourcePassage);
    lines.push("");
    lines.push("### Output");
    lines.push("");
    lines.push(row.outputText || "(empty)");
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const estimate = estimateGeminiQualityRetestUsd();
  console.log(
    JSON.stringify({
      event: "quality_retest_preflight",
      model: estimate.officialId,
      billingClass: estimate.billingClass,
      inputUsdPer1M: estimate.inputUsdPer1M,
      outputUsdPer1M: estimate.outputUsdPer1M,
      priorLedgerUsd: estimate.priorLedgerUsd,
      remainingAuthorizationUsd: estimate.remainingAuthorizationUsd,
      plannedUsd: estimate.plannedUsd,
      reservedRetryUsd: estimate.reservedRetryUsd,
      maxUsdIfRetriesFire: estimate.maxUsdIfRetriesFire,
      projectedCumulativeUsd: estimate.projectedCumulativeUsd,
      fitsRemainingAuthorization: estimate.fitsRemainingAuthorization,
      hardCapUsd: GEMINI_EDU_HARD_CAP_USD,
      liveFlag: process.env.ORYZEN_LIVE_BENCHMARK === "1",
      googleKeyPresent: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    })
  );

  if (!estimate.fitsRemainingAuthorization) {
    throw new Error("fail_closed: planned 8+2 spend does not fit remaining $2 authorization");
  }
  if (process.env.ORYZEN_LIVE_BENCHMARK !== "1") {
    throw new Error("fail_closed: ORYZEN_LIVE_BENCHMARK is not 1");
  }
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("fail_closed: Preview GEMINI_API_KEY is missing");
  }

  const ids = await listGoogleModelIds();
  const modelPresent = ids.includes(GEMINI_EDU_MODEL);
  console.log(
    JSON.stringify({
      event: "quality_retest_model_verify",
      requested: GEMINI_EDU_MODEL,
      listedCount: ids.length,
      modelPresent,
    })
  );
  if (!modelPresent) {
    throw new Error(`fail_closed: ${GEMINI_EDU_MODEL} was not listed for this key`);
  }

  const report = await runGeminiQualityRetest({ mode: "live" });
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(OUT_DIR, "qualitative-review.md"), qualitativeMarkdown(report));
  await writeFile(path.join(OUT_DIR, "report.html"), reportHtml(report));
  for (const [index, row] of report.calls.entries()) {
    await writeFile(
      path.join(OUT_DIR, `${String(index + 1).padStart(2, "0")}-${row.mode}.json`),
      `${JSON.stringify(row, null, 2)}\n`
    );
  }
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
      artifactDir: OUT_DIR,
    })
  );
  if (report.mode !== "live") {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(JSON.stringify({ event: "quality_retest_aborted", message }));
  process.exitCode = 1;
});
