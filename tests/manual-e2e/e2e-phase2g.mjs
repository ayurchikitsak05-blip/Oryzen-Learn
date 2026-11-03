/**
 * ORYZEN Learn Phase 2G — source-grounded Explain + dictionary reliability.
 * Deterministic LOCAL FALLBACK only. Reuses :3000. No deploy / merge / paid AI.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const outDir = join(process.cwd(), "tmp-e2e-artifacts", "phase2g");
mkdirSync(outDir, { recursive: true });

const owner = {
  email: "oryzen.owner.demo@example.com",
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
};

const circuitPdf = join(process.cwd(), "public", "demo-fixtures", "science-circuit-current.pdf");
const rectanglePdf = join(process.cwd(), "public", "demo-fixtures", "mathematics-rectangle-area.pdf");
const chapterPdf = join(process.cwd(), "public", "demo-fixtures", "science-work-energy-chapter.pdf");

const WORK_FORMULA =
  "In physics, work is done only when a force moves an object along a path. The formula is W = F x d, where W is work, F is the force in the direction of the motion, and d is the displacement. A student pushes a crate with a force of 10 N along a smooth floor for 3 m, so W = 10 x 3 = 30 J.";
const WORK_JOULE =
  "The SI unit of work is the joule (J). One joule is the work done by a force of 1 newton acting through 1 metre. Keep the units together: 30 J is not the same as 30 N.";
const WORK_COMPONENT =
  "Only the part of the force along the displacement counts as work. If the force is at a right angle to the motion, that part is zero, so the work is zero. A student who carries a bag across a flat corridor at constant height does no work against gravity on the bag.";
const CIRCUIT =
  "A circuit is a closed path. Current is the flow of electrons. A current of 2 amperes means 2 coulombs pass a point each second.";
const RECTANGLE =
  "The area of a rectangle is length times width. If the length is 8 cm and the width is 5 cm, the area is 40 square centimetres.";

const PUCK_RE = /hockey puck|Leah sets a hockey|\ba puck on\b/i;
const BOARD_RE = /notice board|Mina is covering/i;

const steps = [];
const defects = [];

function record(step, status, evidence, extra = {}) {
  steps.push({ step, status, evidence, ...extra });
  console.log(`STEP ${step} ${status} :: ${String(evidence).slice(0, 420)}`);
}

async function shot(page, name) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function explainBody(json) {
  const explain = json?.payload?.explain ?? {};
  return [
    explain.simpleExplanation,
    explain.standardExplanation,
    explain.deeperExplanation,
    explain.relevantExample,
    explain.keyTakeaway,
    ...(explain.importantConcepts ?? []),
    json?.payload?.markdown_body,
  ]
    .filter(Boolean)
    .join(" ");
}

function assertLocalFallback(json) {
  const reason = json?.fallbackReason ?? null;
  const used = json?.usedDeterministicFallback === true;
  const ok = used && (reason === "missing_gemini_key" || reason === "missing_api_key");
  return { ok, reason, used };
}

async function skipPricing(page) {
  if (!page.url().includes("/pricing")) return;
  const free = page.getByRole("button", { name: /Start free/i });
  if (await free.count()) {
    await free.click();
    await page.waitForURL(/\/(hub|reader)/, { timeout: 20000 }).catch(() => {});
  }
}

async function signInOwner(page) {
  await page.goto(`${BASE}/auth?form=1`, { waitUntil: "networkidle" });
  if (await page.getByRole("tab", { name: "Sign In" }).count()) {
    await page.getByRole("tab", { name: "Sign In" }).click();
  }
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  const [signinRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/auth/password") && res.request().method() === "POST"
    ),
    page.getByRole("button", { name: /Sign in/i }).click(),
  ]);
  const signinJson = await signinRes.json().catch(() => ({}));
  await page.waitForURL(/\/(hub|pricing|instructor|reader|body-type)/, { timeout: 25000 }).catch(() => {});
  await skipPricing(page);
  if (signinRes.ok() && signinJson.status === "authenticated") return { mode: "signin" };
  const local = await page.request.post(`${BASE}/api/auth/owner-demo-local`);
  await local.json().catch(() => ({}));
  await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
  return { mode: "local-fallback" };
}

async function gotoReader(page) {
  await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
  await skipPricing(page);
}

async function waitForLibrary(page) {
  await page.getByLabel("Document").or(page.getByTestId("pdf-empty-state")).waitFor({ timeout: 25000 });
  await page
    .waitForFunction(() => {
      const select = document.querySelector('select[aria-label="Document"]');
      return Boolean(select && select.options.length > 0);
    }, null, { timeout: 25000 })
    .catch(() => {});
  await page.waitForTimeout(300);
}

async function selectDoc(page, needle) {
  const docSelect = page.getByLabel("Document");
  await docSelect.waitFor({ timeout: 15000 });
  const value = await docSelect.evaluate((el, want) => {
    const options = [...el.options];
    const match = options.find((option) => option.text.toLowerCase().includes(want.toLowerCase()));
    if (!match) {
      throw new Error(`Document "${want}" not in library: ${options.map((option) => option.text).join(" | ")}`);
    }
    return match.value;
  }, needle);
  await docSelect.selectOption(value);
  await page.waitForTimeout(600);
}

async function hasDoc(page, needle) {
  const docSelect = page.getByLabel("Document");
  if ((await docSelect.count()) === 0) return false;
  return docSelect.evaluate((el, want) => {
    return [...el.options].some((option) => option.text.toLowerCase().includes(want.toLowerCase()));
  }, needle);
}

async function openDoc(page, needle, pdfPath) {
  await waitForLibrary(page);
  if (!(await hasDoc(page, needle))) {
    await page.locator('input[type="file"]').first().setInputFiles(pdfPath);
    await page.waitForFunction(
      (name) => {
        const status = document.body.innerText;
        const ready = /ready to read|already in your library|couldn.?t upload/i.test(status);
        const select = document.querySelector('select[aria-label="Document"]');
        const titled = select
          ? [...select.options].some((option) => option.text.toLowerCase().includes(String(name).toLowerCase()))
          : false;
        return ready || titled;
      },
      needle,
      { timeout: 25000 }
    );
  }
  await selectDoc(page, needle);
  await page.waitForSelector('[data-testid="pdf-text-layer"]', { timeout: 20000 });
}

async function selectPassage(page) {
  const layer = page.getByTestId("pdf-text-layer");
  await layer.waitFor({ timeout: 20000 });
  await page.evaluate(() => {
    const wrap = document.querySelector('[data-testid="pdf-text-layer"]');
    const root = wrap?.querySelector("div") ?? wrap;
    if (!root) return;
    const range = document.createRange();
    range.selectNodeContents(root);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    root.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByTestId("multi-lens-highlight-toolbar").waitFor({ timeout: 15000 });
}

async function closeWorkspace(page) {
  const back = page.getByTestId("back-to-reading");
  if (await back.count()) {
    await back.click({ force: true });
    await page.waitForTimeout(200);
  }
}

async function runLens(page, testId) {
  await selectPassage(page);
  const request = page.waitForResponse(
    (res) => res.url().includes("/api/ai/lens") && res.request().method() === "POST",
    { timeout: 30000 }
  );
  await page.getByTestId(testId).click();
  const res = await request;
  const json = await res.json().catch(() => ({}));
  await page.getByTestId("ai-lens-response-card").waitFor({ timeout: 20000 });
  return { res, json };
}

async function explainApi(page, selectedText, heading) {
  const res = await page.request.post(`${BASE}/api/ai/lens`, {
    data: {
      documentId: "phase2g-explain",
      documentHash: "phase2g-explain",
      pageNumber: 1,
      sectionHeading: heading,
      selectedText,
      lensType: "explain",
    },
  });
  return res.json();
}

function checkGrounded(json, must, forbidden) {
  const fallback = assertLocalFallback(json);
  const body = explainBody(json);
  const grounded = must.test(body);
  const leaked = forbidden.test(body) || PUCK_RE.test(body) || BOARD_RE.test(body);
  return { fallback, body, grounded, leaked, ok: fallback.ok && grounded && !leaked };
}

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();

try {
  await page.goto(`${BASE}/auth?form=1`, { waitUntil: "networkidle" });
  const login = await signInOwner(page);
  const banner = page.getByTestId("owner-demo-banner");
  await banner.waitFor({ timeout: 15000 });
  const brand = await page.locator('img[alt="Oryzen Learn"]').count();
  await shot(page, "00-hub");
  record(0, brand > 0 ? "PASS" : "FAIL", `login=${login.mode} brand=${brand}`);

  // --- 1. Source-grounded explanations (API + UI) ---
  try {
    const formula = checkGrounded(
      await explainApi(page, WORK_FORMULA, "6.1 Meaning of work"),
      /W = F|displacement|10 N|30 J/i,
      /ampere|8 cm|notice board|hockey puck/i
    );
    const joule = checkGrounded(
      await explainApi(page, WORK_JOULE, "SI unit"),
      /joule|1 newton|1 metre/i,
      /W = F|ampere|8 cm|hockey puck/i
    );
    const component = checkGrounded(
      await explainApi(page, WORK_COMPONENT, "Direction of the force"),
      /displacement|right angle|bag/i,
      /W = F|ampere|8 cm|hockey puck/i
    );
    const circuit = checkGrounded(
      await explainApi(page, CIRCUIT, "Circuit"),
      /circuit|ampere|current|coulomb/i,
      /W = F|joule|8 cm|hockey puck|notice board/i
    );
    const rectangle = checkGrounded(
      await explainApi(page, RECTANGLE, "Area"),
      /rectangle|8 cm|5 cm|40/i,
      /W = F|joule|ampere|hockey puck/i
    );

    const apiOk = formula.ok && joule.ok && component.ok && circuit.ok && rectangle.ok;
    if (!apiOk) {
      throw new Error(
        `API explain not grounded: formula=${formula.ok} joule=${joule.ok} component=${component.ok} circuit=${circuit.ok} rectangle=${rectangle.ok} formulaBody=${formula.body.slice(0, 100)}`
      );
    }

    await gotoReader(page);
    await waitForLibrary(page);
    await openDoc(page, "work and energy", chapterPdf);
    const { json: chapterJson } = await runLens(page, "lens-btn-explain");
    const chapter = checkGrounded(chapterJson, /work|joule|force|displacement|W = F/i, /hockey puck|notice board|ampere|8 cm/i);
    await page.getByTestId("explain-depth-simple").click().catch(() => {});
    const chapterShot = await shot(page, "01-work-energy-explain");
    await closeWorkspace(page);

    await openDoc(page, "science-circuit-current", circuitPdf);
    const { json: circuitUi } = await runLens(page, "lens-btn-explain");
    const circuitUiCheck = checkGrounded(circuitUi, /circuit|ampere|current/i, /hockey puck|notice board|W = F/i);
    await shot(page, "01-circuit-explain");
    await closeWorkspace(page);

    await openDoc(page, "rectangle", rectanglePdf);
    const { json: rectUi } = await runLens(page, "lens-btn-explain");
    const rectUiCheck = checkGrounded(rectUi, /rectangle|8|40/i, /hockey puck|ampere|W = F/i);
    await shot(page, "01-rectangle-explain");
    await closeWorkspace(page);

    const ok =
      formula.ok &&
      joule.ok &&
      component.ok &&
      circuit.ok &&
      rectangle.ok &&
      chapter.ok &&
      circuitUiCheck.ok &&
      rectUiCheck.ok;
    record(
      1,
      ok ? "PASS" : "FAIL",
      `formula=${formula.ok} joule=${joule.ok} component=${component.ok} circuit=${circuit.ok} rectangle=${rectangle.ok} chapterUi=${chapter.ok} circuitUi=${circuitUiCheck.ok} rectUi=${rectUiCheck.ok} chapter=${chapter.body.slice(0, 160)}`,
      { shots: [chapterShot] }
    );
    if (!ok) defects.push("Explain was not source-grounded for one or more passages.");
  } catch (error) {
    const file = await shot(page, "01-explain-error").catch(() => "");
    record(1, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Source-grounded explain check failed.");
  }

  // --- 2. Dictionary loading / success / timeout / error + Retry ---
  try {
    await closeWorkspace(page);
    await gotoReader(page);
    await waitForLibrary(page);
    await openDoc(page, "work and energy", chapterPdf);
    await page.waitForSelector('[data-testid="pdf-text-layer"] [role="button"]', { timeout: 20000 });

    let dictMode = "success";
    const cors = { "access-control-allow-origin": "*" };
    await page.route(/dictionaryapi\.dev|wiktionary\.org/i, async (route) => {
      if (dictMode === "hang") {
        await new Promise((resolve) => setTimeout(resolve, 8000));
        await route.abort().catch(() => {});
        return;
      }
      if (dictMode === "fail") {
        await route.fulfill({ status: 503, body: "down", headers: cors });
        return;
      }
      const definition =
        dictMode === "retry"
          ? "Retry recovered the meaning."
          : "Energy transferred by a force moving an object.";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: cors,
        body: JSON.stringify([
          {
            phonetic: "/wɜːk/",
            meanings: [{ partOfSpeech: "noun", definitions: [{ definition }] }],
          },
        ]),
      });
    });

    async function waitStatus(want) {
      try {
        await page.waitForFunction(
          (status) =>
            document.querySelector('[data-testid="reader-dictionary-dialog"]')?.getAttribute("data-status") ===
            status,
          want,
          { timeout: 12000 }
        );
      } catch (error) {
        const status = await dialog.getAttribute("data-status").catch(() => "missing");
        const text = await dialog.innerText().catch(() => "");
        throw new Error(`wait ${want} got status=${status} text=${text.slice(0, 200)} :: ${error.message}`);
      }
    }
    async function closeDict() {
      const closeBtn = page.locator('[data-testid="reader-dictionary-dialog"] button', { hasText: "Close" });
      if (await closeBtn.count()) await closeBtn.click();
      await page.getByTestId("reader-dictionary-dialog").waitFor({ state: "detached", timeout: 4000 }).catch(() => {});
    }

    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    const word = page.locator('[data-testid="pdf-text-layer"] [role="button"]').filter({ hasText: /^[A-Za-z]{4,}$/ }).first();
    await word.click({ force: true });
    const dialog = page.getByTestId("reader-dictionary-dialog");
    await dialog.waitFor({ state: "attached", timeout: 12000 });
    await waitStatus("ready");
    const successText = await dialog.innerText();
    const successShot = await shot(page, "02-dictionary-success");
    const successOk = /energy transferred|noun/i.test(successText);
    await closeDict();

    dictMode = "hang";
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await word.click({ force: true });
    await dialog.waitFor({ state: "attached", timeout: 12000 });
    const loadingVisible = await page.getByText("Looking up this word…").isVisible().catch(() => false);
    await waitStatus("timeout");
    const timeoutText = await dialog.innerText();
    const timeoutShot = await shot(page, "02-dictionary-timeout");
    const timeoutOk = /timed out/i.test(timeoutText) && (await page.getByTestId("reader-dictionary-retry").count()) > 0;

    dictMode = "fail";
    await page.getByTestId("reader-dictionary-retry").click();
    await waitStatus("error");
    const errorShot = await shot(page, "02-dictionary-error");
    const errorOk = /could not be reached/i.test(await dialog.innerText());

    dictMode = "retry";
    await page.getByTestId("reader-dictionary-retry").click();
    await waitStatus("ready");
    const retryShot = await shot(page, "02-dictionary-retry");
    const retryOk = /Retry recovered/i.test(await dialog.innerText());

    await page.setViewportSize({ width: 390, height: 844 });
    await closeDict();
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await word.click({ force: true });
    await dialog.waitFor({ state: "attached", timeout: 12000 });
    await waitStatus("ready");
    const mobileShot = await shot(page, "02-dictionary-mobile");
    const mobileBox = await dialog.boundingBox();
    const mobileOk = Boolean(mobileBox && mobileBox.x >= 0 && mobileBox.x + mobileBox.width <= 390);
    await page.setViewportSize({ width: 1440, height: 900 });

    const ok = successOk && timeoutOk && errorOk && retryOk && mobileOk && loadingVisible;
    record(
      2,
      ok ? "PASS" : "FAIL",
      `success=${successOk} loading=${loadingVisible} timeout=${timeoutOk} error=${errorOk} retry=${retryOk} mobile=${mobileOk} successText=${successText.slice(0, 120)}`,
      { shots: [successShot, timeoutShot, errorShot, retryShot, mobileShot] }
    );
    if (!ok) defects.push("Dictionary did not cover loading, success, timeout, error, or Retry.");
  } catch (error) {
    const file = await shot(page, "02-dictionary-error-run").catch(() => "");
    record(2, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Dictionary reliability check failed.");
  }

  // --- 3. Regression: Fit Width, 10 MCQs, rectangle 8×5=40, save ---
  try {
    await page.unroute(/dictionaryapi\.dev|wiktionary\.org/i).catch(() => {});
    await closeWorkspace(page);
    await gotoReader(page);
    await waitForLibrary(page);
    await openDoc(page, "rectangle", rectanglePdf);
    const fit = page.getByTestId("fit-width-btn");
    if (await fit.count()) await fit.click();
    await page.waitForTimeout(400);
    const metrics = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="pdf-reading-canvas"]');
      const frame = document.querySelector('[data-testid^="pdf-mounted-page-"][data-active="true"]');
      const host = canvas?.querySelector(".relative.min-w-0.flex-1") ?? canvas;
      return {
        fitMode: canvas?.getAttribute("data-fit-mode") ?? "",
        pageWidth: Number(frame?.getAttribute("data-page-width") ?? 0),
        hostWidth: host?.clientWidth ?? 0,
      };
    });
    const fitShot = await shot(page, "03-fit-width");
    const fill = metrics.hostWidth > 0 ? metrics.pageWidth / metrics.hostWidth : 0;
    const fitOk = metrics.fitMode === "width" && fill >= 0.85;

    const { json: quizJson } = await runLens(page, "lens-btn-test_me");
    const quizFallback = assertLocalFallback(quizJson);
    const mcqs = quizJson.payload?.mcqs ?? [];
    const quizShot = await shot(page, "03-ten-mcqs");
    const quizOk = quizFallback.ok && mcqs.length === 10;

    await closeWorkspace(page);
    const { json: illJson } = await runLens(page, "lens-btn-illustrative");
    const geo = illJson.payload?.illustrative?.flowchart?.geometry ?? {};
    const geoShot = await shot(page, "03-rectangle-geometry");
    const geoOk = geo.kind === "rectangle" && geo.length === 8 && geo.width === 5 && geo.area === 40;

    await closeWorkspace(page);
    await selectPassage(page);
    const saveRes = page.waitForResponse(
      (res) => res.url().includes("/api/notes") && res.request().method() === "POST",
      { timeout: 20000 }
    ).catch(() => null);
    await page.getByTestId("lens-btn-save_passage").click();
    const saved = await saveRes;
    await page.getByTestId("ai-lens-response-card").waitFor({ timeout: 15000 });
    const saveShot = await shot(page, "03-save");
    const saveOk = Boolean(saved?.ok() || (await page.getByTestId("study-result-workspace").count()));

    const ok = fitOk && quizOk && geoOk && saveOk;
    record(
      3,
      ok ? "PASS" : "FAIL",
      `fit=${fitOk} fill=${fill.toFixed(3)} quiz=${mcqs.length} geo=${JSON.stringify(geo)} save=${saved?.status?.() ?? "n/a"}`,
      { shots: [fitShot, quizShot, geoShot, saveShot] }
    );
    if (!ok) defects.push("A Phase 2F regression check failed (Fit Width, 10 MCQs, 8×5=40, or save).");
  } catch (error) {
    const file = await shot(page, "03-regression-error").catch(() => "");
    record(3, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Regression check failed.");
  }
} finally {
  const ready = defects.length === 0 && steps.every((row) => row.status === "PASS");
  const results = {
    phase: "2G",
    account: owner.email,
    outDir,
    ready,
    steps: steps.map((row) => ({ step: row.step, status: row.status, evidence: row.evidence, shots: row.shots ?? [] })),
    defects,
    deterministicFallback: "LOCAL FALLBACK only. Paid AI stays disabled.",
  };
  writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ ready, defects, steps: steps.map((row) => ({ step: row.step, status: row.status })) }, null, 2));
  await browser.close();
  if (!ready) process.exitCode = 1;
}
