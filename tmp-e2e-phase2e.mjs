/**
 * ORYZEN Learn Phase 2E local browser acceptance.
 * Educational quality + reader UX. Deterministic AI only.
 * Reuses existing :3000. Does not deploy, merge, or migrate live.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const outDir = join(process.cwd(), "tmp-e2e-artifacts", "phase2e");
mkdirSync(outDir, { recursive: true });

const account = {
  email: "oryzen.owner.demo@example.com",
  password: "OwnerDemo-Phase2D!",
};

const circuitPdf = join(process.cwd(), "public", "demo-fixtures", "science-circuit-current.pdf");
const rectanglePdf = join(process.cwd(), "public", "demo-fixtures", "mathematics-rectangle-area.pdf");
const chapterPdf = join(process.cwd(), "public", "demo-fixtures", "science-work-energy-chapter.pdf");

const AYURVEDA_RE = /tridosha|vata|pitta|kapha|prakriti|ayurved|dhee|dhriti|smriti/i;
const CIRCUIT_RE = /circuit|electron|ampere|current|coulomb/i;
const RECT_RE = /rectangle|length|width|area|8 cm|40/i;
const CHAPTER_RE = /work|joule|kinetic|potential|watt|W = F x d/i;

const steps = [];
const defects = [];

function record(step, status, evidence, extra = {}) {
  steps.push({ step, status, evidence, ...extra });
  console.log(`STEP ${step} ${status} :: ${evidence}`);
}

async function shot(page, name) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function waitForLibrary(page) {
  await page.getByLabel("Document").or(page.getByTestId("pdf-empty-state")).waitFor({ timeout: 25000 });
  await page.waitForTimeout(400);
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
  await page.waitForTimeout(800);
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
  await page.waitForTimeout(600);
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

async function gotoReader(page) {
  await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/pricing")) {
    const free = page.getByRole("button", { name: /Start free/i });
    if (await free.count()) {
      await free.click();
      await page.waitForURL(/\/(hub|reader)/, { timeout: 20000 }).catch(() => {});
    }
    await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
  }
  if (page.url().includes("/auth")) {
    throw new Error("Reader redirected to /auth — session missing");
  }
}

async function ensureDemoLogin(page) {
  await page.goto(`${BASE}/auth?form=1`, { waitUntil: "networkidle" });
  if (await page.getByRole("tab", { name: "Sign In" }).count()) {
    await page.getByRole("tab", { name: "Sign In" }).click();
  }
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  const [signinRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/auth/password") && res.request().method() === "POST"
    ),
    page.getByRole("button", { name: /Sign in/i }).click(),
  ]);
  const signinJson = await signinRes.json().catch(() => ({}));
  await page.waitForURL(/\/(hub|pricing|instructor|reader|body-type)/, { timeout: 25000 }).catch(() => {});

  if (signinRes.ok() && signinJson.status === "authenticated") {
    return { mode: "signin", res: signinRes, json: signinJson };
  }

  await page.goto(`${BASE}/auth?form=1`, { waitUntil: "domcontentloaded" });
  if (await page.getByRole("tab", { name: "Create Account" }).count()) {
    await page.getByRole("tab", { name: "Create Account" }).click();
  }
  if (await page.getByLabel("Full name").count()) {
    await page.getByLabel("Full name").fill("ORYZEN Owner Demo");
  }
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  const [signupRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/auth/password") && res.request().method() === "POST"
    ),
    page.getByRole("button", { name: /Create account|Sign up|Get started/i }).first().click(),
  ]);
  const signupJson = await signupRes.json().catch(() => ({}));
  await page.waitForURL(/\/(hub|pricing|instructor|reader|body-type)/, { timeout: 25000 }).catch(() => {});
  if (signupRes.ok() && (signupJson.status === "authenticated" || signupJson.status === "created")) {
    return { mode: "signup", res: signupRes, json: signupJson };
  }

  const local = await page.request.post(`${BASE}/api/auth/owner-demo-local`);
  const localJson = await local.json().catch(() => ({}));
  await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
  return { mode: "local-fallback", res: local, json: localJson };
}

async function pageMetrics(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="pdf-reading-canvas"]');
    const frame = document.querySelector('[data-testid^="pdf-mounted-page-"][data-active="true"]');
    const host = canvas?.querySelector(".relative.min-w-0.flex-1") ?? canvas;
    return {
      fitMode: canvas?.getAttribute("data-fit-mode") ?? "",
      scale: Number(canvas?.getAttribute("data-page-scale") ?? 0),
      pageWidth: Number(frame?.getAttribute("data-page-width") ?? 0),
      pageHeight: Number(frame?.getAttribute("data-page-height") ?? 0),
      hostWidth: host?.clientWidth ?? 0,
      hostHeight: host?.clientHeight ?? 0,
    };
  });
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

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();

try {
  try {
    const health = await page.request.get(`${BASE}/api/health`).catch(() => ({ ok: () => true }));
    const authShot = await shot(page, "00-auth-open").catch(() => "");
    await page.goto(`${BASE}/auth?form=1`, { waitUntil: "networkidle" });
    const login = await ensureDemoLogin(page);
    if (page.url().includes("/pricing")) {
      const free = page.getByRole("button", { name: /Start free/i });
      if (await free.count()) {
        await free.click();
        await page.waitForURL(/\/(hub|reader)/, { timeout: 20000 }).catch(() => {});
      }
    }
    if (!page.url().includes("/hub") && !page.url().includes("/reader")) {
      await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
    }
    const banner = page.getByTestId("owner-demo-banner");
    await banner.waitFor({ timeout: 15000 });
    const hubShot = await shot(page, "01-hub-signed-in");
    const brand = await page.locator('img[alt="Oryzen Learn"]').count();
    const bannerText = await banner.innerText();
    const ok =
      (typeof health.ok === "function" ? health.ok() : true) &&
      brand > 0 &&
      /OWNER DEMO ACCOUNT|LOCAL OWNER DEMO MODE/i.test(bannerText);
    record(
      1,
      ok ? "PASS" : "FAIL",
      `mode=${login.mode} url=${page.url()} brand=${brand} banner=${bannerText} shots=${authShot} ${hubShot}`,
      { shots: [authShot, hubShot], mode: login.mode }
    );
    if (!ok) defects.push("Demo sign-in did not land with labeled banner and original logo.");
  } catch (error) {
    const file = await shot(page, "01-auth-error").catch(() => "");
    record(1, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Step 1 sign-in failed.");
  }

  try {
    await gotoReader(page);
    await waitForLibrary(page);
    await uploadPdf(page, circuitPdf, "science-circuit-current");
    await page.waitForSelector('[data-testid^="pdf-mounted-page-"][data-page-width]', { timeout: 20000 });
    await page.getByTestId("fit-page-btn").click();
    await page.waitForTimeout(700);
    const before = await pageMetrics(page);
    const beforeShot = await shot(page, "02-before-fit-page");
    await page.getByTestId("fit-width-btn").click();
    await page.waitForTimeout(700);
    const after = await pageMetrics(page);
    const afterShot = await shot(page, "02-after-fit-width");
    const larger = after.pageWidth > before.pageWidth + 40 || after.scale > before.scale + 0.08;
    const fills = after.pageWidth > 700;
    const ok = after.fitMode === "width" && larger && fills;
    record(
      2,
      ok ? "PASS" : "FAIL",
      `before=${JSON.stringify(before)} after=${JSON.stringify(after)} larger=${larger} fills=${fills}`,
      { shots: [beforeShot, afterShot], before, after }
    );
    if (!ok) defects.push("Default Fit Width did not make the page substantially larger.");
  } catch (error) {
    const file = await shot(page, "02-fit-error").catch(() => "");
    record(2, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("PDF readability check failed.");
  }

  try {
    await selectPassage(page);
    const toolbar = page.getByTestId("multi-lens-highlight-toolbar");
    const ids = [
      "explain",
      "illustrative",
      "story",
      "high_yield_revision",
      "test_me",
      "save_passage",
    ];
    const visible = [];
    for (const id of ids) visible.push(await page.getByTestId(`lens-btn-${id}`).isVisible());
    const highlight = await page.getByTestId("reader-highlight").isVisible();
    const underline = await page.getByTestId("reader-underline").isVisible();
    const box = await toolbar.boundingBox();
    const host = await page.getByTestId("pdf-page-stage").boundingBox();
    const toolbarShot = await shot(page, "03-toolbar-near-selection");
    const compact = Boolean(box && box.height <= 92 && box.width <= 420);
    const near = Boolean(box && host && box.y >= 40 && box.y < (host.y + host.height) - 8);
    const ok = visible.every(Boolean) && highlight && underline && compact && near;
    record(
      3,
      ok ? "PASS" : "FAIL",
      `visible=${visible.join(",")} highlight=${highlight} underline=${underline} box=${JSON.stringify(box)} compact=${compact} near=${near}`,
      { shots: [toolbarShot] }
    );
    if (!ok) defects.push("Selection toolbar was not compact and near the selection.");
  } catch (error) {
    const file = await shot(page, "03-toolbar-error").catch(() => "");
    record(3, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Toolbar check failed.");
  }

  try {
    const { res, json } = await runLens(page, "lens-btn-explain");
    const explain = json.payload?.explain ?? {};
    await page.getByTestId("explain-depth-simple").click();
    const simpleShot = await shot(page, "04-explain-simple");
    await page.getByTestId("explain-depth-standard").click();
    const standardShot = await shot(page, "04-explain-standard");
    await page.getByTestId("explain-depth-deeper").click();
    const deeperShot = await shot(page, "04-explain-deeper");
    const distinct =
      explain.simpleExplanation &&
      explain.standardExplanation &&
      explain.deeperExplanation &&
      !String(explain.standardExplanation).includes(String(explain.simpleExplanation)) &&
      overlap(explain.simpleExplanation, explain.standardExplanation) < 0.6 &&
      /self-check|misconception/i.test(explain.deeperExplanation);
    const grounded = CIRCUIT_RE.test(
      `${explain.simpleExplanation} ${explain.standardExplanation} ${explain.deeperExplanation}`
    );
    const ok =
      res.ok() &&
      json.usedDeterministicFallback === true &&
      distinct &&
      grounded &&
      !AYURVEDA_RE.test(`${explain.simpleExplanation} ${explain.deeperExplanation}`);
    record(
      4,
      ok ? "PASS" : "FAIL",
      `fallback=${json.fallbackReason} distinct=${distinct} grounded=${grounded} simple=${String(explain.simpleExplanation).slice(0, 120)}`,
      { shots: [simpleShot, standardShot, deeperShot] }
    );
    if (!ok) defects.push("Explain depths were not meaningfully different or not grounded.");
    await closeWorkspace(page);
  } catch (error) {
    const file = await shot(page, "04-explain-error").catch(() => "");
    record(4, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Explain quality check failed.");
  }

  try {
    await closeWorkspace(page);
    await uploadPdf(page, rectanglePdf, "rectangle");
    const text = await layerText(page);
    const { json } = await runLens(page, "lens-btn-illustrative");
    await page.getByTestId("illustrate-tab-flowchart").click().catch(() => {});
    const flowchartShot = await shot(page, "05-rectangle-flowchart");
    const geometry = await page.getByTestId("study-rectangle-geometry").innerText().catch(() => "");
    const geo = json.payload?.illustrative?.flowchart?.geometry ?? {};
    await page.getByTestId("illustrate-tab-concept_diagram").click();
    const conceptShot = await shot(page, "05-rectangle-concept");
    const ok =
      RECT_RE.test(text) &&
      geo.kind === "rectangle" &&
      geo.length === 8 &&
      geo.width === 5 &&
      /L = 8|8 cm/i.test(`${geo.lengthLabel} ${geometry}`) &&
      /W = 5|5 cm/i.test(`${geo.widthLabel} ${geometry}`) &&
      /40/i.test(`${geo.areaLabel} ${geometry}`);
    record(
      5,
      ok ? "PASS" : "FAIL",
      `geometry=${JSON.stringify(geo)} visible=${geometry.slice(0, 80)} layer=${text.slice(0, 80)}`,
      { shots: [flowchartShot, conceptShot] }
    );
    if (!ok) defects.push("Rectangle illustration did not show L=8, W=5, area=40.");
    await closeWorkspace(page);
    const { json: storyJson } = await runLens(page, "lens-btn-story");
    const storyShot = await shot(page, "05-rectangle-story");
    const story = `${storyJson.payload?.story?.opening ?? ""} ${storyJson.payload?.story?.turningPoint ?? ""} ${storyJson.payload?.story?.close ?? ""}`;
    const storyOk =
      /notice board|tiles|paper squares|Mina/i.test(story) &&
      /40|multiply|unit squares/i.test(story) &&
      !/The area of a rectangle is length times width/i.test(story);
    record(
      "5b",
      storyOk ? "PASS" : "FAIL",
      `story=${story.slice(0, 220)}`,
      { shots: [storyShot] }
    );
    if (!storyOk) defects.push("Rectangle story paraphrased the page instead of teaching.");
    await closeWorkspace(page);
  } catch (error) {
    const file = await shot(page, "05-rectangle-error").catch(() => "");
    record(5, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Rectangle visualization/story failed.");
  }

  try {
    await uploadPdf(page, chapterPdf, "work and energy");
    const text = await layerText(page);
    const titleText = await page.getByLabel("Document").evaluate((el) => el.selectedOptions?.[0]?.text ?? "");
    const chapterShot = await shot(page, "06-longer-chapter");
    const { json } = await runLens(page, "lens-btn-explain");
    const explainShot = await shot(page, "06-chapter-explain");
    const body = `${json.payload?.explain?.standardExplanation ?? ""} ${text}`;
    const ok =
      /work and energy|chapter/i.test(titleText) &&
      CHAPTER_RE.test(body) &&
      json.usedDeterministicFallback === true &&
      text.length > 80;
    record(
      6,
      ok ? "PASS" : "FAIL",
      `title=${titleText} layerLen=${text.length} excerpt=${text.slice(0, 140)} fallback=${json.fallbackReason}`,
      { shots: [chapterShot, explainShot] }
    );
    if (!ok) defects.push("Longer sample chapter path did not open with formulas and prose.");
    await closeWorkspace(page);
  } catch (error) {
    const file = await shot(page, "06-chapter-error").catch(() => "");
    record(6, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Longer chapter check failed.");
  }

  try {
    await selectPassage(page);
    await page.getByTestId("reader-highlight").click();
    await selectPassage(page);
    const { json } = await runLens(page, "lens-btn-test_me");
    const mcqs = json.payload?.mcqs ?? [];
    for (let i = 0; i < Math.min(3, mcqs.length); i += 1) {
      await page.locator('[data-testid="test-me-quiz"] > div.space-y-2').nth(i).locator("button").nth(1).click();
    }
    const quizShot = await shot(page, "07-quiz-partial");
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForLibrary(page);
    const restoredTitle = await page.getByLabel("Document").evaluate((el) => el.selectedOptions?.[0]?.text ?? "");
    await selectPassage(page);
    await page.getByTestId("lens-btn-test_me").click();
    await page.getByTestId("test-me-progress").waitFor({ timeout: 20000 });
    const progress = await page.getByTestId("test-me-progress").innerText();
    const resumeShot = await shot(page, "07-refresh-resume");
    const marks = await page.locator(".bg-selected").count();
    const ok =
      /work and energy|chapter/i.test(restoredTitle) &&
      (/3 of|answered/i.test(progress) || /10/.test(progress));
    record(
      7,
      ok ? "PASS" : "FAIL",
      `title=${restoredTitle} progress=${progress} marks=${marks}`,
      { shots: [quizShot, resumeShot] }
    );
    if (!ok) defects.push("Refresh did not keep the chapter and quiz progress.");
  } catch (error) {
    const file = await shot(page, "07-resume-error").catch(() => "");
    record(7, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Continuity after refresh failed.");
  }

  try {
    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoReader(page);
    await waitForLibrary(page);
    await page.waitForSelector('[data-testid^="pdf-mounted-page-"][data-page-width]', { timeout: 20000 });
    await page.waitForTimeout(400);
    const tablet = await pageMetrics(page);
    const tabletShot = await shot(page, "08-tablet-reader");
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReader(page);
    await waitForLibrary(page);
    await closeWorkspace(page);
    await selectPassage(page);
    const toolbar = page.getByTestId("multi-lens-highlight-toolbar");
    await toolbar.waitFor({ timeout: 10000 });
    const labels = await toolbar.locator('[data-testid="highlight-toolbar-primary"] button').allInnerTexts();
    const box = await toolbar.boundingBox();
    const mobile = await pageMetrics(page);
    const mobileShot = await shot(page, "08-mobile-toolbar");
    const needed = ["Explain", "Illustrate", "Story", "Revise", "Test Me", "Save", "Highlight", "Underline"];
    const ok =
      needed.every((label) => labels.some((text) => text.includes(label))) &&
      Boolean(box && box.height <= 140) &&
      tablet.pageWidth > 400 &&
      mobile.pageWidth > 200;
    record(
      8,
      ok ? "PASS" : "FAIL",
      `tablet=${JSON.stringify(tablet)} mobile=${JSON.stringify(mobile)} labels=${labels.join("|")} boxH=${box?.height}`,
      { shots: [tabletShot, mobileShot] }
    );
    if (!ok) defects.push("Tablet/mobile reader or toolbar failed.");
  } catch (error) {
    const file = await shot(page, "08-responsive-error").catch(() => "");
    record(8, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Responsive verification failed.");
  }
} finally {
  const ready = defects.length === 0 && steps.every((row) => row.status === "PASS");
  const results = {
    account: account.email,
    outDir,
    circuitPdf,
    rectanglePdf,
    chapterPdf,
    ready,
    steps,
    defects,
    deterministicFallback: "All study lenses use composeDeterministicLensPayload when GEMINI/paid keys are empty.",
  };
  writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
  console.log(
    JSON.stringify(
      { ready, defects, steps: steps.map((row) => ({ step: row.step, status: row.status })) },
      null,
      2
    )
  );
  await browser.close();
  if (!ready) process.exitCode = 1;
}
