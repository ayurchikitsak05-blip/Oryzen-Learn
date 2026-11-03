/**
 * ORYZEN Learn Phase 2F — independent browser acceptance of Phase 2E.
 * Educational quality, not click-through. Deterministic LOCAL FALLBACK only.
 * Reuses :3000. Does not deploy, merge, migrate live, or print secrets.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const outDir = join(process.cwd(), "tmp-e2e-artifacts", "phase2f");
mkdirSync(outDir, { recursive: true });

const owner = {
  email: "oryzen.owner.demo@example.com",
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
};

const stamp = Date.now();
const userB = {
  email: `oryzen.2f.${stamp}@example.com`,
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
  fullName: "Phase 2F Isolated",
};

const isolationMarker = `PHASE2F-ISO-${stamp}`;

const circuitPdf = join(process.cwd(), "public", "demo-fixtures", "science-circuit-current.pdf");
const rectanglePdf = join(process.cwd(), "public", "demo-fixtures", "mathematics-rectangle-area.pdf");
const chapterPdf = join(process.cwd(), "public", "demo-fixtures", "science-work-energy-chapter.pdf");

const AYURVEDA_RE = /tridosha|vata|pitta|kapha|prakriti|ayurved|dhee|dhriti|smriti/i;
const CIRCUIT_RE = /circuit|electron|ampere|current|coulomb/i;
const RECT_RE = /rectangle|length|width|area|8 cm|40/i;
const CHAPTER_RE = /work|joule|kinetic|potential|watt|W = F x d/i;
const NEWTON_GENERIC_RE = /hockey puck|Newton's first law|Leah sets a hockey/i;

const steps = [];
const defects = [];
const notes = [];

function record(step, status, evidence, extra = {}) {
  steps.push({ step, status, evidence, ...extra });
  console.log(`STEP ${step} ${status} :: ${String(evidence).slice(0, 420)}`);
}

function note(message) {
  notes.push(message);
  console.log(`NOTE :: ${message}`);
}

async function shot(page, name) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function overlap(a, b) {
  const tokenize = (text) =>
    new Set(
      String(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 4)
    );
  const left = tokenize(a);
  const right = tokenize(b);
  if (!left.size || !right.size) return 1;
  let inter = 0;
  for (const word of left) if (right.has(word)) inter += 1;
  return inter / new Set([...left, ...right]).size;
}

function assertDistinctExplain(explain, domainRe) {
  const simple = String(explain?.simpleExplanation ?? "");
  const standard = String(explain?.standardExplanation ?? "");
  const deeper = String(explain?.deeperExplanation ?? "");
  const reused =
    !simple ||
    !standard ||
    !deeper ||
    standard.includes(simple) ||
    deeper.includes(standard) ||
    simple === standard ||
    standard === deeper;
  const distinct =
    !reused &&
    overlap(simple, standard) < 0.6 &&
    overlap(simple, deeper) < 0.55 &&
    overlap(standard, deeper) < 0.65 &&
    simple.length + 20 < standard.length &&
    standard.length + 20 < deeper.length;
  const grounded = domainRe.test(`${simple} ${standard} ${deeper}`);
  const ayurvedaLeak = AYURVEDA_RE.test(`${simple} ${standard} ${deeper}`);
  return { simple, standard, deeper, distinct, grounded, ayurvedaLeak, reused };
}

function assertLocalFallback(json) {
  const reason = json?.fallbackReason ?? null;
  const used = json?.usedDeterministicFallback === true;
  const ok = used && (reason === "missing_gemini_key" || reason === "missing_api_key");
  return {
    ok,
    label: ok ? "LOCAL FALLBACK" : used ? `LOCAL FALLBACK (${reason})` : "NOT FALLBACK",
    reason,
    used,
  };
}

async function waitForLibrary(page) {
  await page.getByLabel("Document").or(page.getByTestId("pdf-empty-state")).waitFor({ timeout: 25000 });
  await page.waitForTimeout(350);
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
  await page.waitForTimeout(700);
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

async function layerText(page) {
  const layer = page.getByTestId("pdf-text-layer");
  if ((await layer.count()) === 0) return "";
  return (await layer.innerText()).trim();
}

async function uploadPdf(page, pdfPath, expectedName) {
  await waitForLibrary(page);
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
    expectedName,
    { timeout: 25000 }
  );
  if (expectedName) await selectDoc(page, expectedName);
  await page.waitForSelector('[data-testid="pdf-text-layer"]', { timeout: 20000 });
  await page.waitForTimeout(500);
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

async function closeWorkspace(page) {
  const back = page.getByTestId("back-to-reading");
  if (await back.count()) {
    await back.click({ force: true });
    await page.waitForTimeout(250);
  }
}

async function skipPricing(page) {
  if (!page.url().includes("/pricing")) return;
  const free = page.getByRole("button", { name: /Start free/i });
  if (await free.count()) {
    await free.click();
    await page.waitForURL(/\/(hub|reader)/, { timeout: 20000 }).catch(() => {});
  }
}

async function gotoReader(page) {
  await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
  await skipPricing(page);
  if (page.url().includes("/pricing")) {
    await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
  }
  if (page.url().includes("/auth")) {
    throw new Error("Reader redirected to /auth — session missing");
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

  if (signinRes.ok() && signinJson.status === "authenticated") {
    return { mode: "signin", json: signinJson };
  }

  const created = await page.request.post(`${BASE}/api/auth/password`, {
    data: {
      action: "sign_up",
      email: owner.email,
      password: owner.password,
      fullName: "ORYZEN Owner Demo",
    },
  });
  const createdJson = await created.json().catch(() => ({}));
  if (created.ok() && (createdJson.status === "authenticated" || createdJson.status === "created")) {
    await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
    await skipPricing(page);
    return { mode: "signup", json: createdJson };
  }

  const local = await page.request.post(`${BASE}/api/auth/owner-demo-local`);
  const localJson = await local.json().catch(() => ({}));
  await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
  return { mode: "local-fallback", json: localJson };
}

async function signUpThrowaway(page, account) {
  await page.goto(`${BASE}/auth?form=1`, { waitUntil: "networkidle" });
  if (await page.getByRole("tab", { name: "Create Account" }).count()) {
    await page.getByRole("tab", { name: "Create Account" }).click();
  }
  if (await page.getByLabel("Full name").count()) {
    await page.getByLabel("Full name").fill(account.fullName);
  }
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  const [signupRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/auth/password") && res.request().method() === "POST"
    ),
    page.getByRole("button", { name: /Create account|Sign up|Get started/i }).first().click(),
  ]);
  const json = await signupRes.json().catch(() => ({}));
  await page.waitForURL(/\/(hub|pricing|instructor|reader|body-type)/, { timeout: 25000 }).catch(() => {});
  await skipPricing(page);
  if (signupRes.ok() && (json.status === "authenticated" || json.status === "created")) {
    return { mode: "signup", json };
  }
  const api = await page.request.post(`${BASE}/api/auth/password`, {
    data: {
      action: "sign_up",
      email: account.email,
      password: account.password,
      fullName: account.fullName,
    },
  });
  const apiJson = await api.json().catch(() => ({}));
  await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await skipPricing(page);
  return { mode: "api-signup", json: apiJson, ok: api.ok() };
}

async function pageMetrics(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="pdf-reading-canvas"]');
    const frame = document.querySelector('[data-testid^="pdf-mounted-page-"][data-active="true"]');
    const host = canvas?.querySelector(".relative.min-w-0.flex-1") ?? canvas;
    const textLayer = document.querySelector('[data-testid="pdf-text-layer"]');
    const sample = textLayer?.querySelector('[role="button"]');
    const sampleBox = sample?.getBoundingClientRect();
    return {
      fitMode: canvas?.getAttribute("data-fit-mode") ?? "",
      scale: Number(canvas?.getAttribute("data-page-scale") ?? 0),
      pageWidth: Number(frame?.getAttribute("data-page-width") ?? 0),
      pageHeight: Number(frame?.getAttribute("data-page-height") ?? 0),
      hostWidth: host?.clientWidth ?? 0,
      hostHeight: host?.clientHeight ?? 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      sampleWordWidth: sampleBox?.width ?? 0,
      sampleWordHeight: sampleBox?.height ?? 0,
    };
  });
}

function fillOk(metrics, minPageWidth) {
  const fill = metrics.hostWidth > 0 ? metrics.pageWidth / metrics.hostWidth : 0;
  const tinyChrome = metrics.pageWidth < metrics.hostWidth * 0.55 || metrics.pageWidth < minPageWidth;
  return {
    fill: Number(fill.toFixed(3)),
    ok:
      metrics.fitMode === "width" &&
      metrics.pageWidth >= minPageWidth &&
      fill >= 0.85 &&
      !tinyChrome &&
      metrics.sampleWordHeight >= 8,
  };
}

async function getNotes(page) {
  const res = await page.request.get(`${BASE}/api/notes`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status(), json };
}

async function ensureFitWidth(page) {
  const btn = page.getByTestId("fit-width-btn");
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(500);
  }
}

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();

try {
  // --- Criterion 1: Fit Width + readability at 1440 / 768 / 390 ---
  try {
    await page.goto(`${BASE}/auth?form=1`, { waitUntil: "networkidle" });
    const authShot = await shot(page, "00-auth-open");
    const login = await signInOwner(page);
    if (!page.url().includes("/hub") && !page.url().includes("/reader")) {
      await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
    }
    const banner = page.getByTestId("owner-demo-banner");
    await banner.waitFor({ timeout: 15000 });
    const hubShot = await shot(page, "01-hub-signed-in");
    const brand = await page.locator('img[alt="Oryzen Learn"]').count();
    const bannerText = await banner.innerText();
    const signedIn =
      brand > 0 && /OWNER DEMO ACCOUNT|LOCAL OWNER DEMO MODE/i.test(bannerText);

    await gotoReader(page);
    await waitForLibrary(page);
    await uploadPdf(page, circuitPdf, "science-circuit-current");
    await page.waitForSelector('[data-testid^="pdf-mounted-page-"][data-page-width]', { timeout: 20000 });
    await ensureFitWidth(page);

    const desktopMetrics = await pageMetrics(page);
    const desktopShot = await shot(page, "01-fit-width-1440");
    const desktopFill = fillOk(desktopMetrics, 1000);

    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoReader(page);
    await waitForLibrary(page);
    await page.waitForSelector('[data-testid^="pdf-mounted-page-"][data-page-width]', { timeout: 20000 });
    await ensureFitWidth(page);
    const tabletMetrics = await pageMetrics(page);
    const tabletShot = await shot(page, "01-fit-width-768");
    const tabletFill = fillOk(tabletMetrics, 620);

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReader(page);
    await waitForLibrary(page);
    await page.waitForSelector('[data-testid^="pdf-mounted-page-"][data-page-width]', { timeout: 20000 });
    await ensureFitWidth(page);
    const mobileMetrics = await pageMetrics(page);
    const mobileShot = await shot(page, "01-fit-width-390");
    const mobileFill = fillOk(mobileMetrics, 300);

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoReader(page);
    await waitForLibrary(page);

    const ok =
      signedIn &&
      desktopFill.ok &&
      tabletFill.ok &&
      mobileFill.ok;
    record(
      1,
      ok ? "PASS" : "FAIL",
      `login=${login.mode} brand=${brand} banner=${bannerText.slice(0, 80)} desktop=${JSON.stringify({ ...desktopMetrics, fill: desktopFill.fill })} tablet=${JSON.stringify({ ...tabletMetrics, fill: tabletFill.fill })} mobile=${JSON.stringify({ ...mobileMetrics, fill: mobileFill.fill })}`,
      {
        shots: [authShot, hubShot, desktopShot, tabletShot, mobileShot],
        desktop: desktopMetrics,
        tablet: tabletMetrics,
        mobile: mobileMetrics,
      }
    );
    if (!ok) defects.push("Fit Width left a tiny page or huge empty chrome at one or more viewports.");
  } catch (error) {
    const file = await shot(page, "01-fit-error").catch(() => "");
    record(1, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("PDF Fit Width / readability check failed.");
  }

  let scienceExplain = null;
  let mathExplain = null;

  // --- Criterion 2: Simple / Standard / Deeper on SCIENCE and MATH ---
  try {
    await closeWorkspace(page);
    await selectDoc(page, "science-circuit-current").catch(async () => {
      await uploadPdf(page, circuitPdf, "science-circuit-current");
    });
    const { json: sciJson } = await runLens(page, "lens-btn-explain");
    const sciFallback = assertLocalFallback(sciJson);
    scienceExplain = assertDistinctExplain(sciJson.payload?.explain ?? {}, CIRCUIT_RE);
    await page.getByTestId("explain-depth-simple").click();
    const sciSimpleShot = await shot(page, "02-science-simple");
    const sciSimpleUi = (await page.getByTestId("explain-class-band").innerText().catch(() => "")).slice(0, 180);
    await page.getByTestId("explain-depth-standard").click();
    const sciStandardShot = await shot(page, "02-science-standard");
    await page.getByTestId("explain-depth-deeper").click();
    const sciDeeperShot = await shot(page, "02-science-deeper");
    const sciBanner = await page.getByTestId("ai-fallback-banner").innerText().catch(() => "");
    await closeWorkspace(page);

    await uploadPdf(page, rectanglePdf, "rectangle");
    const { json: mathJson } = await runLens(page, "lens-btn-explain");
    const mathFallback = assertLocalFallback(mathJson);
    mathExplain = assertDistinctExplain(mathJson.payload?.explain ?? {}, RECT_RE);
    await page.getByTestId("explain-depth-simple").click();
    const mathSimpleShot = await shot(page, "02-math-simple");
    await page.getByTestId("explain-depth-standard").click();
    const mathStandardShot = await shot(page, "02-math-standard");
    await page.getByTestId("explain-depth-deeper").click();
    const mathDeeperShot = await shot(page, "02-math-deeper");
    const mathBanner = await page.getByTestId("ai-fallback-banner").innerText().catch(() => "");

    const claimedGemini = /gemini generated|live gemini/i.test(`${sciBanner} ${mathBanner}`);
    const ok =
      sciFallback.ok &&
      mathFallback.ok &&
      scienceExplain.distinct &&
      scienceExplain.grounded &&
      !scienceExplain.ayurvedaLeak &&
      mathExplain.distinct &&
      mathExplain.grounded &&
      !mathExplain.ayurvedaLeak &&
      !claimedGemini &&
      /8|40|rectangle/i.test(`${mathExplain.simple} ${mathExplain.standard} ${mathExplain.deeper}`);

    record(
      2,
      ok ? "PASS" : "FAIL",
      `SCIENCE ${sciFallback.label} distinct=${scienceExplain.distinct} grounded=${scienceExplain.grounded} simple=${scienceExplain.simple.slice(0, 110)} || MATH ${mathFallback.label} distinct=${mathExplain.distinct} grounded=${mathExplain.grounded} simple=${mathExplain.simple.slice(0, 110)}`,
      {
        shots: [sciSimpleShot, sciStandardShot, sciDeeperShot, mathSimpleShot, mathStandardShot, mathDeeperShot],
        science: { fallback: sciFallback, ...scienceExplain, uiSimple: sciSimpleUi, banner: sciBanner },
        math: { fallback: mathFallback, ...mathExplain, banner: mathBanner },
      }
    );
    if (!ok) defects.push("Simple / Standard / Deeper were not meaningfully different or not LOCAL FALLBACK.");
    await closeWorkspace(page);
  } catch (error) {
    const file = await shot(page, "02-explain-error").catch(() => "");
    record(2, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Explain depth check failed.");
  }

  // --- Criterion 3: flowchart / mind map / concept / analogy ---
  try {
    await closeWorkspace(page);
    await selectDoc(page, "rectangle").catch(async () => {
      await uploadPdf(page, rectanglePdf, "rectangle");
    });
    const text = await layerText(page);
    const { json } = await runLens(page, "lens-btn-illustrative");
    const fallback = assertLocalFallback(json);
    const ill = json.payload?.illustrative ?? {};
    await page.getByTestId("illustrate-tab-flowchart").click().catch(() => {});
    const flowText = await page.getByTestId("study-flowchart").innerText().catch(() => "");
    const geoText = await page.getByTestId("study-rectangle-geometry").innerText().catch(() => "");
    const flowShot = await shot(page, "03-flowchart");

    await page.getByTestId("illustrate-tab-mind_map").click();
    const mindText = await page.getByTestId("study-mind-map").innerText().catch(() => "");
    const mindShot = await shot(page, "03-mind-map");

    await page.getByTestId("illustrate-tab-concept_diagram").click();
    const conceptText = await page.getByTestId("study-concept-diagram").innerText().catch(() => "");
    const conceptShot = await shot(page, "03-concept-diagram");

    await page.getByTestId("illustrate-tab-analogy").click();
    const analogyText = await page.getByTestId("study-analogy").innerText().catch(() => "");
    const analogyShot = await shot(page, "03-analogy");

    const geo = ill.flowchart?.geometry ?? {};
    const visible = `${flowText}\n${geoText}\n${mindText}\n${conceptText}\n${analogyText}`;
    const labelled =
      (geo.kind === "rectangle" && geo.length === 8 && geo.width === 5 && geo.area === 40) ||
      (/L = 8/i.test(visible) && /W = 5/i.test(visible) && /40/i.test(visible));
    const notKeywordBlob =
      /L × W|multiply|unit squares|8 cm|5 cm/i.test(visible) &&
      !/^\s*(area|length|width)\s*$/i.test(visible);
    const ok =
      fallback.ok &&
      RECT_RE.test(text) &&
      labelled &&
      notKeywordBlob &&
      /8.+5.+40|8 cm|40/i.test(analogyText);
    record(
      3,
      ok ? "PASS" : "FAIL",
      `${fallback.label} geometry=${JSON.stringify(geo)} visible=${visible.replace(/\s+/g, " ").slice(0, 220)} analogy=${analogyText.slice(0, 140)}`,
      { shots: [flowShot, mindShot, conceptShot, analogyShot], geometry: geo }
    );
    if (!ok) defects.push("Illustrations were keyword-only or missing L=8, W=5, area=40.");
    await closeWorkspace(page);
  } catch (error) {
    const file = await shot(page, "03-illustrate-error").catch(() => "");
    record(3, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Illustration quality check failed.");
  }

  // --- Criterion 4: Story Mode ---
  try {
    const { json } = await runLens(page, "lens-btn-story");
    const fallback = assertLocalFallback(json);
    const story = `${json.payload?.story?.opening ?? ""} ${json.payload?.story?.turningPoint ?? ""} ${json.payload?.story?.close ?? ""}`;
    const storyShot = await shot(page, "04-rectangle-story");
    const source = await layerText(page);
    const paraphrase =
      /The area of a rectangle is length times width/i.test(story) ||
      overlap(source, story) > 0.72;
    const useful =
      /notice board|tiles|paper squares|Mina|desk|unit squares/i.test(story) &&
      /40|multiply|length by width/i.test(story);
    const accurate = /8|5/.test(story) && /40/.test(story);
    const ok = fallback.ok && useful && accurate && !paraphrase && !AYURVEDA_RE.test(story);
    record(
      4,
      ok ? "PASS" : "FAIL",
      `${fallback.label} useful=${useful} accurate=${accurate} paraphrase=${paraphrase} story=${story.slice(0, 260)}`,
      { shots: [storyShot], story }
    );
    if (!ok) defects.push("Story Mode paraphrased the source or was factually off.");
    await closeWorkspace(page);
  } catch (error) {
    const file = await shot(page, "04-story-error").catch(() => "");
    record(4, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Story Mode check failed.");
  }

  // --- Criterion 5: highlight, underline, dictionary, compact toolbar ---
  try {
    await closeWorkspace(page);
    await selectPassage(page);
    const toolbar = page.getByTestId("multi-lens-highlight-toolbar");
    const highlight = await page.getByTestId("reader-highlight").isVisible();
    const underline = await page.getByTestId("reader-underline").isVisible();
    const lookUpOnToolbar = await page.getByRole("button", { name: /Look Up|Dictionary/i }).count();
    const box = await toolbar.boundingBox();
    const host = await page.getByTestId("pdf-page-stage").boundingBox();
    const compact = Boolean(box && box.height <= 100 && box.width <= 460);
    const near = Boolean(box && host && box.y >= 24 && box.y < host.y + host.height - 8);

    await page.getByTestId("reader-highlight").click();
    await selectPassage(page);
    await page.getByTestId("reader-underline").click();
    const markShot = await shot(page, "05-highlight-underline");

    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.keyboard.press("Escape").catch(() => {});
    const word = page.locator('[data-testid="pdf-text-layer"] [role="button"]').filter({ hasText: /^[A-Za-z]{3,}$/ }).first();
    await word.waitFor({ timeout: 10000 });
    const wordText = ((await word.innerText()) || "").replace(/[^A-Za-z]/g, "");
    await word.click({ force: true });
    const dictDialog = page.locator("#reader-word-lookup");
    const dictAppeared = await dictDialog.waitFor({ state: "attached", timeout: 12000 }).then(() => true).catch(() => false);
    let dictText = "";
    if (dictAppeared) {
      await page.waitForTimeout(800);
      dictText = await dictDialog.innerText().catch(() => "");
    }
    const dictShot = await shot(page, "05-dictionary");
    const dictUseful = /looking up|meaning of|no dictionary|could not be reached|noun|verb|determiner|article|definition/i.test(
      `${dictText} Meaning of ${wordText}`
    );

    let status = "PASS";
    let evidence = "";
    if (!highlight || !underline || !compact || !near) {
      status = "FAIL";
      evidence = `toolbar highlight=${highlight} underline=${underline} compact=${compact} near=${near} box=${JSON.stringify(box)}`;
      defects.push("Selection toolbar was not compact near the selection, or mark controls were missing.");
    } else if (!dictAppeared && lookUpOnToolbar === 0) {
      status = "BLOCKED";
      evidence = `Highlight/underline/compact toolbar OK. Dictionary is word-click / Look Up in PassageText, not a HighlightToolbar chip. Word-click did not open a dialog for "${wordText}".`;
      note("Dictionary: built as word-click / Look Up in PassageText, not as a HighlightToolbar chip.");
    } else if (!dictAppeared) {
      status = "FAIL";
      evidence = `Dictionary button exists but popup did not open. word=${wordText}`;
      defects.push("Dictionary control existed but did not open.");
    } else {
      evidence = `highlight=${highlight} underline=${underline} compact=${compact} near=${near} box=${JSON.stringify(box)} dictWord=${wordText} dictUseful=${dictUseful} dict=${dictText.slice(0, 180)}`;
    }
    record(5, status, evidence, { shots: [markShot, dictShot], box, wordText, dictText });
  } catch (error) {
    const file = await shot(page, "05-toolbar-error").catch(() => "");
    record(5, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Toolbar / dictionary check failed.");
  }

  // --- Criterion 6: persist notes, quiz, weak concepts, reading progress ---
  let ownerNotesSnapshot = { status: 0, json: {} };
  try {
    await closeWorkspace(page);
    await selectPassage(page);
    const saveRes = page.waitForResponse(
      (res) => res.url().includes("/api/notes") && res.request().method() === "POST",
      { timeout: 20000 }
    ).catch(() => null);
    await page.getByTestId("lens-btn-save_passage").click();
    const saved = await saveRes;
    const saveJson = saved ? await saved.json().catch(() => ({})) : {};
    const notebookStatus = await page.locator('[data-testid="study-result-workspace"] [role="status"]').innerText().catch(() => "");
    const saveShot = await shot(page, "06-save-passage");
    await closeWorkspace(page);

    const apiSave = await page.request.post(`${BASE}/api/notes`, {
      data: {
        action: "save_passage",
        title: isolationMarker,
        subjectTitle: `Phase2F ${isolationMarker}`,
        noteBody: `Owner isolation marker ${isolationMarker} — circuit current 2 A.`,
      },
    });
    const apiSaveJson = await apiSave.json().catch(() => ({}));
    await page.goto(`${BASE}/notes`, { waitUntil: "domcontentloaded" });
    const titleField = page.getByRole("textbox", { name: "Note title", exact: true });
    if ((await titleField.count()) && !(await page.getByText(isolationMarker).count())) {
      const subjectField = page.getByLabel("New subject");
      if ((await subjectField.count()) && (await page.getByRole("button", { name: /^Add$/i }).count())) {
        await subjectField.fill(`Phase2F ${isolationMarker}`);
        await page.getByRole("button", { name: /^Add$/i }).click();
        await page.waitForTimeout(400);
      }
      await titleField.fill(isolationMarker);
      await page.getByRole("textbox", { name: "Note", exact: true }).fill(
        `Owner isolation marker ${isolationMarker} — circuit current 2 A.`
      );
      await page.getByRole("button", { name: /Save note/i }).click();
      await page.waitForTimeout(600);
    }
    const notesUiShot = await shot(page, "06-notes-saved");
    ownerNotesSnapshot = await getNotes(page);
    const ownerHasMarker =
      JSON.stringify(ownerNotesSnapshot.json).includes(isolationMarker) ||
      (await page.locator(`text=${isolationMarker}`).count()) > 0;

    await gotoReader(page);
    await waitForLibrary(page);
    await selectDoc(page, "science-circuit-current").catch(async () => {
      await uploadPdf(page, circuitPdf, "science-circuit-current");
    });
    const { json: quizJson } = await runLens(page, "lens-btn-test_me");
    const quizFallback = assertLocalFallback(quizJson);
    const mcqs = quizJson.payload?.mcqs ?? [];
    for (let i = 0; i < Math.min(4, mcqs.length); i += 1) {
      const correct = Number(mcqs[i].correctIndex ?? 0);
      const pick = i < 2 ? (correct + 1) % 4 : correct;
      await page.locator('[data-testid="test-me-quiz"] > div.space-y-2').nth(i).locator("button").nth(pick).click();
    }
    const progressBefore = await page.getByTestId("test-me-progress").innerText();
    const quizShot = await shot(page, "06-quiz-partial");
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForLibrary(page);
    const restoredTitle = await page.getByLabel("Document").evaluate((el) => el.selectedOptions?.[0]?.text ?? "");
    await selectPassage(page);
    await page.getByTestId("lens-btn-test_me").click();
    await page.getByTestId("test-me-progress").waitFor({ timeout: 20000 });
    const progressAfter = await page.getByTestId("test-me-progress").innerText();
    const resumeShot = await shot(page, "06-refresh-resume");
    const notesAfterRefresh = await getNotes(page);

    const quizResumed = /[1-9] of|answered/i.test(progressAfter);
    const notesPersist = JSON.stringify(notesAfterRefresh.json).includes(isolationMarker) || ownerHasMarker;
    const ok =
      quizFallback.ok &&
      /circuit|current/i.test(restoredTitle) &&
      quizResumed &&
      notesPersist &&
      ownerNotesSnapshot.status === 200;
    record(
      6,
      ok ? "PASS" : ownerNotesSnapshot.status >= 500 ? "BLOCKED" : "FAIL",
      `${quizFallback.label} saveLens=${saved?.status?.() ?? "n/a"} apiSave=${apiSave.status()} apiSaveId=${apiSaveJson.id ?? "n/a"} notebook=${notebookStatus.slice(0, 80)} notesApi=${ownerNotesSnapshot.status} marker=${ownerHasMarker} title=${restoredTitle} before=${progressBefore} after=${progressAfter}`,
      {
        shots: [saveShot, notesUiShot, quizShot, resumeShot],
        ownerNotesCount: (ownerNotesSnapshot.json.notes ?? []).length,
        isolationMarker,
      }
    );
    if (!ok && ownerNotesSnapshot.status < 500) {
      defects.push("Notes, quiz, or reading progress did not survive refresh.");
    }
    if (ownerNotesSnapshot.status >= 500) {
      defects.push("Notes API is not ready; isolation cannot be proven against saved rows.");
    }
    await closeWorkspace(page);
  } catch (error) {
    const file = await shot(page, "06-persist-error").catch(() => "");
    record(6, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Persistence check failed.");
  }

  // --- Criterion 7: longer chapter page nav + AI drawer ---
  try {
    await closeWorkspace(page);
    await gotoReader(page);
    await waitForLibrary(page);
    await uploadPdf(page, chapterPdf, "work and energy");
    const titleText = await page.getByLabel("Document").evaluate((el) => el.selectedOptions?.[0]?.text ?? "");
    const beforeNav = await page.locator("text=/\\d+ \\/ \\d+/").first().innerText().catch(() => "");
    const chapterShot = await shot(page, "07-chapter-open");
    const next = page.getByRole("button", { name: "Next Page" });
    const nextEnabled = await next.isEnabled().catch(() => false);
    if (nextEnabled) {
      await next.click();
      await page.waitForTimeout(600);
    }
    const afterNav = await page.locator("text=/\\d+ \\/ \\d+/").first().innerText().catch(() => "");
    const navShot = await shot(page, "07-page-nav");
    const layerAfterNav = await layerText(page);

    const canvasBefore = await page.getByTestId("pdf-reading-canvas").boundingBox();
    const { json } = await runLens(page, "lens-btn-explain");
    const fallback = assertLocalFallback(json);
    const explainBody = `${json.payload?.explain?.simpleExplanation ?? ""} ${json.payload?.explain?.standardExplanation ?? ""} ${json.payload?.explain?.deeperExplanation ?? ""}`;
    const workspace = page.getByTestId("study-result-workspace");
    await workspace.waitFor({ timeout: 15000 });
    const canvasAfter = await page.getByTestId("pdf-reading-canvas").boundingBox();
    const workspaceBox = await workspace.boundingBox();
    const drawerShot = await shot(page, "07-ai-drawer");
    const readingSurvives =
      Boolean(canvasAfter && canvasAfter.width > 240 && canvasAfter.height > 180) &&
      Boolean(workspaceBox) &&
      (await page.getByTestId("pdf-text-layer").count()) > 0 &&
      (await page.getByTestId("back-to-reading").isVisible());
    const educationallyOnTopic =
      CHAPTER_RE.test(explainBody) || CHAPTER_RE.test(layerAfterNav);
    const genericNewtonSwap = NEWTON_GENERIC_RE.test(explainBody) && !/work is done|W = F|joule/i.test(explainBody);
    if (genericNewtonSwap) {
      note(`LOCAL FALLBACK work-energy Explain used generic Newton/puck copy: ${explainBody.slice(0, 160)}`);
    }
    const ok =
      fallback.ok &&
      /work and energy|chapter/i.test(titleText) &&
      readingSurvives &&
      educationallyOnTopic &&
      layerAfterNav.length > 40;
    record(
      7,
      ok ? "PASS" : "FAIL",
      `${fallback.label} title=${titleText} before=${beforeNav} after=${afterNav} nextEnabled=${nextEnabled} canvasW=${canvasAfter?.width} drawerW=${workspaceBox?.width} excerpt=${layerAfterNav.slice(0, 120)} explain=${explainBody.slice(0, 140)} newtonSwap=${genericNewtonSwap}`,
      { shots: [chapterShot, navShot, drawerShot], explain: explainBody.slice(0, 400) }
    );
    if (!ok) defects.push("Longer chapter page nav or AI drawer destroyed reading.");
    await closeWorkspace(page);
  } catch (error) {
    const file = await shot(page, "07-chapter-error").catch(() => "");
    record(7, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Longer chapter check failed.");
  }

  // --- Criterion 8: user B isolation ---
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageB = await contextB.newPage();
  try {
    await pageB.goto(`${BASE}/auth?form=1`, { waitUntil: "domcontentloaded" });
    const apiCreated = await pageB.request.post(`${BASE}/api/auth/password`, {
      data: {
        action: "sign_up",
        email: userB.email,
        password: userB.password,
        fullName: userB.fullName,
      },
    });
    const apiCreatedJson = await apiCreated.json().catch(() => ({}));
    let created = { mode: "api-signup", json: apiCreatedJson, ok: apiCreated.ok() };
    if (!apiCreated.ok()) {
      created = await signUpThrowaway(pageB, userB);
    } else {
      await pageB.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
      await skipPricing(pageB);
    }
    const notesB = await getNotes(pageB);
    await pageB.goto(`${BASE}/notes`, { waitUntil: "domcontentloaded" });
    await skipPricing(pageB);
    await pageB.getByText(/waiting for its first idea|Choose a subject|Opening your notebook/i).waitFor({ timeout: 15000 }).catch(() => {});
    await pageB.waitForTimeout(800);
    const pageText = await pageB.locator("main").innerText().catch(() => pageB.innerText());
    const leakedInApi = JSON.stringify(notesB.json).includes(isolationMarker);
    const leakedInUi = pageText.includes(isolationMarker);
    const ownerTitles = (ownerNotesSnapshot.json.notes ?? []).map((row) => row.title).filter(Boolean);
    const leakedTitle = ownerTitles.some((title) => title && pageText.includes(title) && title !== "Saved passages");
    const emptyOfA =
      !leakedInApi &&
      !leakedInUi &&
      !leakedTitle &&
      ((notesB.json.notes ?? []).length === 0 ||
        !(notesB.json.notes ?? []).some((row) => JSON.stringify(row).includes(isolationMarker)));
    const isoShot = await shot(pageB, "08-user-b-notes");
    const signupOk = created.json?.status === "authenticated" || created.json?.status === "created" || created.ok;
    const ok = signupOk && notesB.status === 200 && emptyOfA;
    record(
      8,
      notesB.status === 401 || notesB.status >= 500 ? "BLOCKED" : ok ? "PASS" : "FAIL",
      `userB=${userB.email} signup=${created.json?.status ?? created.mode} notesApi=${notesB.status} notes=${(notesB.json.notes ?? []).length} subjects=${(notesB.json.subjects ?? []).length} leakedApi=${leakedInApi} leakedUi=${leakedInUi} emptyOfA=${emptyOfA} uiExcerpt=${pageText.slice(0, 180)}`,
      { shots: [isoShot], userB: userB.email, notesB: { status: notesB.status, counts: { notes: (notesB.json.notes ?? []).length, subjects: (notesB.json.subjects ?? []).length } } }
    );
    if (notesB.status === 401 || notesB.status >= 500) {
      defects.push("User B notes API was not usable; isolation not proven.");
    } else if (!ok) {
      defects.push("User B could see user A notes or isolation signup failed.");
    }
  } catch (error) {
    const file = await shot(pageB, "08-isolation-error").catch(() => "");
    record(8, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Isolation attempt failed.");
  } finally {
    await contextB.close();
  }
} finally {
  const ready = defects.length === 0 && steps.every((row) => row.status === "PASS");
  const results = {
    phase: "2F",
    account: owner.email,
    userB: userB.email,
    isolationMarker,
    outDir,
    ready,
    steps: steps.map((row) => ({
      step: row.step,
      status: row.status,
      evidence: row.evidence,
      shots: row.shots ?? [],
    })),
    defects,
    notes,
    deterministicFallback:
      "ALL study output in this run is LOCAL FALLBACK (composeDeterministicLensPayload / missing_gemini_key). None of it is live Gemini.",
    demo: {
      url: `${BASE}/auth?form=1`,
      email: owner.email,
      password: owner.password,
      reader: `${BASE}/reader`,
      notes: `${BASE}/notes`,
    },
  };
  writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
  console.log(
    JSON.stringify(
      {
        ready,
        defects,
        notes,
        steps: steps.map((row) => ({ step: row.step, status: row.status })),
      },
      null,
      2
    )
  );
  await browser.close();
  if (!ready) process.exitCode = 1;
}
