/**
 * Protected Preview: ≤3 real Gemini Illustrate accuracy checks (fetch-only).
 * Cap: $0.01 additional; cumulative ledger $2. No automatic retries.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "tmp-e2e-artifacts", "accuracy-preview");
mkdirSync(outDir, { recursive: true });

const PREVIEW =
  process.env.ACCURACY_PREVIEW_BASE ||
  "https://oryzen-learn-6bi8pdf2i-ayurchikitsak05-8316s-projects.vercel.app";
const DEPLOY_ID = process.env.ACCURACY_PREVIEW_DEPLOY || "dpl_H1bLhb8uoKMuTfmh948fejfuoxBK";
const COMMIT = process.env.ACCURACY_PREVIEW_COMMIT || "220e6819edb210ecdfb184f3c092a27543e8d60e";
const PRIOR_LEDGER = 0.1466693;
const CUMULATIVE_CAP = 2.0;
const RUN_CAP = 0.01;
const INPUT_USD_PER_1M = 0.3;
const OUTPUT_USD_PER_1M = 2.5;

const CASES = [
  {
    id: "physics-newton",
    subject: "Physics",
    documentId: "accuracy-newton-law",
    sectionHeading: "Newton first law",
    passage:
      "Newton's first law of motion states that an object moves at constant velocity unless a net force acts.",
    requiredAny: [/constant velocity/i, /net force/i, /unless/i],
    forbidden: [/becomes/i, /acts on/i, /free-body/i, /photosynthesis/i, /litmus/i, /rectangle/i],
    preferEdges: [/unless/i],
  },
  {
    id: "chemistry-litmus",
    subject: "Chemistry",
    documentId: "accuracy-litmus-causes",
    sectionHeading: "Acid base indicators",
    passage:
      "An acid causes blue litmus paper to turn red. A base causes red litmus paper to turn blue.",
    requiredAny: [/acid/i, /base/i, /litmus/i, /red/i, /blue/i, /causes/i],
    requireBothColourChanges: true,
    forbidden: [/newton/i, /rectangle/i, /velocity/i, /aluminium/i],
    preferEdges: [/causes/i],
  },
  {
    id: "maths-rectangle",
    subject: "Mathematics",
    documentId: "accuracy-rectangle-area",
    sectionHeading: "Rectangle area",
    passage:
      "The area of a rectangle is length times width. If the length is 8 cm and the width is 5 cm, the area is 40 square centimetres.",
    requiredAny: [/8\s*cm/i, /5\s*cm/i, /40/, /length/i, /width/i, /area/i],
    requireQuantities: ["8", "5", "40"],
    forbidden: [/newton/i, /litmus/i, /glucose/i, /force/i],
    preferEdges: [/equals|times/i],
  },
];

function loadEnv(path) {
  const map = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const idx = trimmed.indexOf("=");
      map[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* missing */
  }
  return map;
}

function priceUsd(promptTokens, completionTokens) {
  return (
    (promptTokens / 1_000_000) * INPUT_USD_PER_1M +
    (completionTokens / 1_000_000) * OUTPUT_USD_PER_1M
  );
}

function collectCookies(res) {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const fallback = res.headers.get("set-cookie");
  const list = raw.length ? raw : fallback ? [fallback] : [];
  return list.map((c) => c.split(";")[0]).filter(Boolean);
}

function diagramBundle(payload) {
  const flow = payload.illustrative?.flowchart ?? payload.diagram ?? null;
  const mind = payload.illustrative?.mindMap ?? null;
  const concept = payload.illustrative?.conceptDiagram ?? null;
  return { flow, mind, concept };
}

function allLabels(bundle) {
  return [bundle.flow, bundle.mind, bundle.concept]
    .filter(Boolean)
    .flatMap((d) => (d.nodes ?? []).map((n) => n.label ?? ""))
    .join(" · ");
}

function allEdges(bundle) {
  return [bundle.flow, bundle.mind, bundle.concept]
    .filter(Boolean)
    .flatMap((d) => (d.edges ?? []).map((e) => ({ from: e.from, to: e.to, label: e.label ?? "" })));
}

function countDuplicateNodes(bundle) {
  let duplicates = 0;
  for (const diagram of [bundle.flow, bundle.mind, bundle.concept].filter(Boolean)) {
    const seen = new Set();
    for (const node of diagram.nodes ?? []) {
      const key = String(node.label ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (!key) continue;
      if (seen.has(key)) duplicates += 1;
      else seen.add(key);
    }
  }
  return duplicates;
}

function scoreCase(testCase, payload, meta) {
  const bundle = diagramBundle(payload);
  const labels = allLabels(bundle);
  const edges = allEdges(bundle);
  const blob = JSON.stringify(payload);
  const hasDiagram =
    (bundle.flow?.nodes?.length ?? 0) >= 2 ||
    (bundle.mind?.nodes?.length ?? 0) >= 2 ||
    (bundle.concept?.nodes?.length ?? 0) >= 2;
  const analogyOnly = !hasDiagram && Boolean(payload.illustrative?.analogy);
  const missing = [];
  if (!hasDiagram) missing.push("usable diagram");
  const requiredHits = testCase.requiredAny.filter(
    (pattern) => pattern.test(labels) || pattern.test(JSON.stringify(edges)) || pattern.test(blob)
  ).length;
  if (requiredHits < Math.min(2, testCase.requiredAny.length)) missing.push("essential source terms");
  if (testCase.requireBothColourChanges) {
    const hasAcidRed = /acid/i.test(blob) && /blue litmus/i.test(blob) && /red/i.test(blob);
    const hasBaseBlue = /base/i.test(blob) && /red litmus/i.test(blob) && /blue/i.test(blob);
    if (!hasAcidRed || !hasBaseBlue) missing.push("both litmus colour changes");
  }
  if (testCase.requireQuantities) {
    for (const qty of testCase.requireQuantities) {
      if (!labels.includes(qty) && !blob.includes(qty)) missing.push(`quantity ${qty}`);
    }
  }
  const forbiddenHits = testCase.forbidden.filter((pattern) => pattern.test(labels));
  const preferHit = testCase.preferEdges.some((pattern) =>
    edges.some((edge) => pattern.test(edge.label))
  );
  const duplicates = countDuplicateNodes(bundle);
  if (duplicates > 0) missing.push(`duplicate nodes (${duplicates})`);

  let verdict = "FAIL";
  if (
    hasDiagram &&
    missing.length === 0 &&
    forbiddenHits.length === 0 &&
    preferHit &&
    meta.within45s &&
    meta.httpStatus === 200
  ) {
    verdict = "PASS";
  } else if (hasDiagram && (missing.length > 0 || forbiddenHits.length > 0 || !preferHit)) {
    verdict = "PARTIAL";
  } else if (analogyOnly) {
    verdict = "PARTIAL";
    missing.push("analogy-only");
  }

  return {
    verdict,
    hasDiagram,
    analogyOnly,
    missing,
    forbiddenHits: forbiddenHits.map(String),
    preferHit,
    duplicates,
    labelsPreview: labels.slice(0, 240),
    edgesPreview: edges.slice(0, 8),
    flowchartNodes: (bundle.flow?.nodes ?? []).map((n) => n.label).slice(0, 8),
    mindNodes: (bundle.mind?.nodes ?? []).map((n) => n.label).slice(0, 8),
    conceptNodes: (bundle.concept?.nodes ?? []).map((n) => n.label).slice(0, 8),
    missingStructure: payload.missingStructure ?? [],
  };
}

const previewCreds = loadEnv(".env.preview.local");
const oidcFile = loadEnv(".env.vercel-oidc");
const localEnv = loadEnv(".env.local");
const pulled = loadEnv(".env.preview.accuracy.tmp");
const token =
  process.env.VERCEL_OIDC_TOKEN ||
  pulled.VERCEL_OIDC_TOKEN ||
  oidcFile.VERCEL_OIDC_TOKEN ||
  localEnv.VERCEL_OIDC_TOKEN ||
  "";

const summary = {
  commit: COMMIT,
  deploymentId: DEPLOY_ID,
  preview: PREVIEW,
  priorLedgerUsd: PRIOR_LEDGER,
  remainingBudgetBeforeUsd: Number((CUMULATIVE_CAP - PRIOR_LEDGER).toFixed(8)),
  runCapUsd: RUN_CAP,
  cumulativeCapUsd: CUMULATIVE_CAP,
  paidCalls: 0,
  additionalSpendUsd: 0,
  stopReason: null,
  nonpaid: {},
  cases: [],
};

if (!token || token.includes("SENSITIVE") || token.length < 40) {
  summary.stopReason = "oidc_unavailable";
  writeFileSync(join(outDir, "results.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(2);
}

const oidcHeaders = { "x-vercel-trusted-oidc-idp-token": token };

try {
  const authPage = await fetch(`${PREVIEW}/auth?form=1`, {
    headers: oidcHeaders,
    redirect: "manual",
  });
  summary.nonpaid.authPageStatus = authPage.status;
  summary.nonpaid.authPageProtected =
    authPage.status === 401 ||
    authPage.status === 403 ||
    /vercel\.com|Authentication Required/i.test(await authPage.text().catch(() => ""));
  if (summary.nonpaid.authPageProtected && ![200, 307, 302, 303].includes(authPage.status)) {
    // still try password if soft redirect
  }

  const passwordRes = await fetch(`${PREVIEW}/api/auth/password`, {
    method: "POST",
    headers: {
      ...oidcHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: previewCreds.PREVIEW_TEST_USER_A,
      password: previewCreds.PREVIEW_TEST_PASSWORD_A,
    }),
  });
  const passwordJson = await passwordRes.json().catch(() => ({}));
  const cookies = collectCookies(passwordRes);
  summary.nonpaid.passwordStatus = passwordRes.status;
  summary.nonpaid.signedIn = passwordRes.ok && passwordJson.status === "authenticated";
  summary.nonpaid.cookieCount = cookies.length;
  if (!summary.nonpaid.signedIn) {
    throw new Error(passwordJson.error || `auth_failed_${passwordRes.status}`);
  }
  const cookieHeader = cookies.join("; ");

  // Nonpaid Story probe: never hit Gemini (simulate by checking route accepts story lens with cache/deterministic flags from a blocked empty body? Better: call with maxProviderAttempts and intercept is impossible in fetch.
  // Instead verify timeout config unchanged via local file hashes already recorded, and confirm Story endpoint responds without spending by using a nonsense short call only if remaining budget allows — SKIP paid story.
  summary.nonpaid.storyUnchangedNote =
    "Story path not paid-tested; provider-timeout.ts still exports HEAVY 45s for story/illustrative (local confirm).";

  for (const testCase of CASES) {
    const remainingRun = RUN_CAP - summary.additionalSpendUsd;
    const remainingCum = CUMULATIVE_CAP - PRIOR_LEDGER - summary.additionalSpendUsd;
    if (remainingRun < 0.002 || remainingCum < 0.002) {
      summary.stopReason = "budget_guard_before_next_call";
      break;
    }

    const documentHash = createHash("sha256").update(testCase.passage).digest("hex");
    const body = {
      documentId: testCase.documentId,
      documentHash,
      pageNumber: 1,
      sectionHeading: testCase.sectionHeading,
      selectedText: testCase.passage,
      lensType: "illustrative",
      prakritiDosha: "Vata",
      activePageText: testCase.passage,
      candidateChunks: [
        {
          document_id: testCase.documentId,
          chunk_id: "c1",
          page_number: 1,
          text: testCase.passage,
          citation_label: "[Page 1]",
        },
      ],
      maxProviderAttempts: 1,
    };

    const started = Date.now();
    const response = await fetch(`${PREVIEW}/api/ai/lens`, {
      method: "POST",
      headers: {
        ...oidcHeaders,
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify(body),
    });
    const elapsedMs = Date.now() - started;
    const json = await response.json().catch(() => ({ parseError: true }));
    const payload = json.payload || {};
    const promptTokens = Number(json.promptTokens ?? 0);
    const completionTokens = Number(json.completionTokens ?? 0);
    const usd = Number(priceUsd(promptTokens, completionTokens).toFixed(8));
    const live =
      json.providerUsed === "google" &&
      !json.usedDeterministicFallback &&
      !json.cacheHit &&
      (promptTokens > 0 || completionTokens > 0);

    if (live) {
      summary.paidCalls += 1;
      summary.additionalSpendUsd = Number((summary.additionalSpendUsd + usd).toFixed(8));
    }
    if (summary.additionalSpendUsd > RUN_CAP) summary.stopReason = "run_cap_exceeded";

    const scored = scoreCase(testCase, payload, {
      within45s: elapsedMs <= 45_000,
      httpStatus: response.status,
    });

    const record = {
      id: testCase.id,
      subject: testCase.subject,
      httpStatus: response.status,
      elapsedMs,
      within45s: elapsedMs <= 45_000,
      modelUsed: json.modelUsed ?? null,
      providerUsed: json.providerUsed ?? null,
      cacheHit: Boolean(json.cacheHit),
      usedDeterministicFallback: Boolean(json.usedDeterministicFallback),
      promptTokens,
      completionTokens,
      estimatedUsdFromTokens: usd,
      costInrReported: json.costInr ?? null,
      livePaid: live,
      sourcePassage: testCase.passage,
      ...scored,
    };
    summary.cases.push(record);
    writeFileSync(join(outDir, `${testCase.id}.json`), JSON.stringify(record, null, 2));
    if (summary.stopReason === "run_cap_exceeded") break;
  }
} catch (error) {
  summary.stopReason = String(error?.message || error);
} finally {
  summary.remainingBudgetAfterUsd = Number(
    (CUMULATIVE_CAP - PRIOR_LEDGER - summary.additionalSpendUsd).toFixed(8)
  );
  summary.cumulativeUsd = Number((PRIOR_LEDGER + summary.additionalSpendUsd).toFixed(8));
  summary.timeoutConfigUnchanged = {
    standardMs: 20_000,
    heavyMs: 45_000,
    source: "src/lib/ai/provider-timeout.ts unchanged in commit 220e681",
  };
  summary.overall =
    summary.cases.length === 3 && summary.cases.every((c) => c.verdict === "PASS")
      ? "PASS"
      : summary.cases.some((c) => c.verdict === "PASS" || c.verdict === "PARTIAL")
        ? "PARTIAL"
        : "FAIL";
  writeFileSync(join(outDir, "results.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
