/**
 * ORYZEN Learn Phase 2D owner-demo verification.
 * Signs in as the throwaway owner demo account and completes the science journey.
 * Deterministic AI only. Reuses existing :3000. Does not deploy or migrate live.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const outDir = join(process.cwd(), "tmp-e2e-artifacts", "phase2d");
mkdirSync(outDir, { recursive: true });

const account = {
  email: "oryzen.owner.demo@example.com",
  password: "OwnerDemo-Phase2D!",
};

const sciencePdf = join(process.cwd(), "public", "demo-fixtures", "science-circuit-current.pdf");
const mathPdf = join(process.cwd(), "public", "demo-fixtures", "mathematics-triangle-pythagoras.pdf");

const AYURVEDA_RE = /tridosha|vata|pitta|kapha|prakriti|ayurved|dhee|dhriti|smriti/i;
const SCIENCE_RE = /circuit|electron|ampere|current|coulomb/i;

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
  await page.getByLabel("Document").or(page.getByTestId("pdf-empty-state")).waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
}

async function selectDoc(page, needle) {
  const docSelect = page.getByLabel("Document");
  await docSelect.waitFor({ timeout: 15000 });
  const value = await docSelect.evaluate((el, want) => {
    const options = [...el.options];
    const match = options.find((option) =>
      option.text.toLowerCase().includes(want.toLowerCase())
    );
    if (!match) {
      throw new Error(
        `Document "${want}" not in library: ${options.map((option) => option.text).join(" | ")}`
      );
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
        ? [...select.options].some((option) =>
            option.text.toLowerCase().includes(String(name).toLowerCase())
          )
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
  await page.waitForSelector(
    '[data-testid="ai-lens-response-card"], [data-testid="ai-lens-error"], [data-testid="ai-lens-loading-skeleton"]',
    { timeout: 20000 }
  );
  await page.getByTestId("ai-lens-response-card").waitFor({ timeout: 20000 }).catch(() => {});
  return { res, json };
}

async function closeWorkspace(page) {
  const back = page.getByTestId("back-to-reading");
  if (await back.count()) {
    await back.click({ force: true });
    await page.waitForTimeout(250);
  }
}

function assertGrounded(text, domainRe) {
  const hasSource = domainRe.test(text);
  const swapped = AYURVEDA_RE.test(text);
  return { hasSource, swapped, ok: hasSource && !swapped };
}

async function answerQuiz(page, mcqs, wrongCount) {
  const picked = [];
  for (let i = 0; i < mcqs.length; i += 1) {
    const correct = Number(mcqs[i].correctIndex ?? 0);
    const pick = i < wrongCount ? (correct + 1) % 4 : correct;
    picked.push({ i, pick, correct, wrong: pick !== correct });
    const option = page
      .locator('[data-testid="test-me-quiz"] > div.space-y-2')
      .nth(i)
      .locator("button")
      .nth(pick);
    await option.click();
    await page.waitForTimeout(80);
  }
  return picked;
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

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await desktop.newPage();
let scienceQuizJson = null;

try {
  try {
    const health = await page.request.get(`${BASE}/api/health`);
    await page.goto(`${BASE}/auth?form=1`, { waitUntil: "networkidle" });
    const authShot = await shot(page, "01-auth");
    if (await page.getByRole("tab", { name: "Sign In" }).count()) {
      await page.getByRole("tab", { name: "Sign In" }).click();
    }
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    const [signinRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/auth/password") && res.request().method() === "POST"
      ),
      page.getByRole("button", { name: /Sign in/i }).click(),
    ]);
    const signinJson = await signinRes.json().catch(() => ({}));
    await page
      .waitForURL(/\/(hub|pricing|instructor|reader|body-type)/, { timeout: 25000 })
      .catch(() => {});
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
      health.ok() &&
      signinRes.ok() &&
      signinJson.status === "authenticated" &&
      (page.url().includes("/hub") || page.url().includes("/reader")) &&
      brand > 0 &&
      /OWNER DEMO ACCOUNT/i.test(bannerText);
    record(
      1,
      ok ? "PASS" : "FAIL",
      `HTTP ${signinRes.status()} next=${signinJson.next} url=${page.url()} brand=${brand} banner=${bannerText} shots=${authShot} ${hubShot}`,
      { shots: [authShot, hubShot], http: signinRes.status(), account: account.email }
    );
    if (!ok) defects.push("Demo sign-in did not land on hub/reader with labeled banner.");
  } catch (error) {
    const file = await shot(page, "01-auth-error").catch(() => "");
    record(1, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Step 1 sign-in failed.");
  }

  try {
    await gotoReader(page);
    await waitForLibrary(page);
    await uploadPdf(page, sciencePdf, "science-circuit-current");
    const text = await layerText(page);
    const canvasShot = await shot(page, "02-science-original-pdf");
    const titleText = await page.getByLabel("Document").evaluate((el) => {
      const opt = el.selectedOptions?.[0];
      return opt?.text ?? "";
    });
    const grounded = assertGrounded(text, SCIENCE_RE);
    const original =
      grounded.ok &&
      titleText.toLowerCase().includes("science-circuit") &&
      !titleText.toLowerCase().includes("constitution");
    record(
      2,
      original ? "PASS" : "FAIL",
      `title=${titleText} hasSource=${grounded.hasSource} excerpt=${text.slice(0, 160)} shot=${canvasShot}`,
      { shots: [canvasShot], http: 200, layerExcerpt: text.slice(0, 240) }
    );
    if (!original) defects.push("Uploaded science PDF was not shown as the original file.");
  } catch (error) {
    const file = await shot(page, "02-science-error").catch(() => "");
    record(2, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Science PDF upload/reader failed.");
  }

  try {
    await selectPassage(page);
    const toolbar = page.getByTestId("multi-lens-highlight-toolbar");
    const primary = ["explain", "illustrative", "story", "high_yield_revision", "test_me", "save_passage"];
    const visible = [];
    for (const id of primary) {
      visible.push(await page.getByTestId(`lens-btn-${id}`).isVisible());
    }
    const overflow = await toolbar.evaluate((el) => el.scrollWidth - el.clientWidth);
    const toolbarShot = await shot(page, "02b-toolbar-primary");
    const ok = visible.every(Boolean) && overflow <= 2;
    record(
      "2b",
      ok ? "PASS" : "FAIL",
      `primaryVisible=${visible.join(",")} overflow=${overflow} shot=${toolbarShot}`,
      { shots: [toolbarShot] }
    );
    if (!ok) defects.push("Primary study actions were not all visible without horizontal overflow.");
  } catch (error) {
    const file = await shot(page, "02b-toolbar-error").catch(() => "");
    record("2b", "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Toolbar check failed.");
  }

  try {
    const { res, json } = await runLens(page, "lens-btn-explain");
    if (await page.getByTestId("explain-depth-simple").count()) {
      await page.getByTestId("explain-depth-simple").click();
    }
    const card = page.getByTestId("ai-lens-response-card");
    await card.waitFor({ timeout: 10000 });
    const simple = page.getByTestId("explain-class-band");
    const simpleText = (await simple.count()) ? await simple.innerText() : "";
    const cardText = await card.innerText();
    const explain = json.payload?.explain ?? {};
    const shotPath = await shot(page, "03-simple-explanation");
    const grounded = assertGrounded(
      `${simpleText}\n${cardText}\n${explain.simpleExplanation ?? ""}`,
      SCIENCE_RE
    );
    const ok =
      res.ok() &&
      grounded.ok &&
      json.usedDeterministicFallback === true;
    record(
      3,
      ok ? "PASS" : "FAIL",
      `HTTP ${res.status()} grounded=${grounded.ok} fallback=${json.fallbackReason} simple=${simpleText.slice(0, 140)} shot=${shotPath}`,
      { shots: [shotPath], http: res.status() }
    );
    if (!ok) defects.push("Simple explanation missing source grounding or deterministic fallback.");
    await closeWorkspace(page);
  } catch (error) {
    const file = await shot(page, "03-explain-error").catch(() => "");
    record(3, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Explain lens failed.");
  }

  try {
    const { res, json } = await runLens(page, "lens-btn-test_me");
    scienceQuizJson = json;
    const mcqs = json.payload?.mcqs ?? [];
    const quiz = page.getByTestId("test-me-quiz");
    await quiz.waitFor({ timeout: 10000 });
    const progress = await page.getByTestId("test-me-progress").innerText();
    const shotPath = await shot(page, "04-ten-mcqs");
    const ayurvedaLeak = mcqs.some((item) =>
      AYURVEDA_RE.test(`${item.question} ${item.options?.join(" ")}`)
    );
    const ok = res.ok() && mcqs.length === 10 && !ayurvedaLeak && /10/.test(progress);
    record(
      4,
      ok ? "PASS" : "FAIL",
      `HTTP ${res.status()} count=${mcqs.length} progress=${progress} ayurvedaLeak=${ayurvedaLeak} shot=${shotPath}`,
      { shots: [shotPath], http: res.status(), mcqCount: mcqs.length }
    );
    if (!ok) defects.push(`Test Me returned ${mcqs.length} questions, expected 10.`);
  } catch (error) {
    const file = await shot(page, "04-mcq-error").catch(() => "");
    record(4, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("MCQ generation failed.");
  }

  try {
    const mcqs = scienceQuizJson?.payload?.mcqs ?? [];
    if (mcqs.length !== 10) throw new Error(`Need 10 MCQs before answering, got ${mcqs.length}`);
    const picked = await answerQuiz(page, mcqs, 3);
    await page.getByTestId("test-me-review").waitFor({ timeout: 8000 });
    const weak = page.getByTestId("weak-concepts");
    const incorrect = page.getByTestId("incorrect-answers");
    const weakText = (await weak.count()) ? await weak.innerText() : "";
    const incorrectText = (await incorrect.count()) ? await incorrect.innerText() : "";
    const shotPath = await shot(page, "05-weak-concepts");
    const ok =
      (await weak.count()) > 0 &&
      weakText.trim().length > 0 &&
      (await incorrect.count()) > 0;
    record(
      5,
      ok ? "PASS" : "FAIL",
      `wrong=${picked.filter((row) => row.wrong).length} weak=${weakText.slice(0, 160)} incorrect=${incorrectText.slice(0, 120)} shot=${shotPath}`,
      { shots: [shotPath], http: 200 }
    );
    if (!ok) defects.push("Weak concepts were not identified after incorrect answers.");
  } catch (error) {
    const file = await shot(page, "05-weak-error").catch(() => "");
    record(5, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Incorrect-answer review failed.");
  }

  try {
    const revision = page.getByTestId("miss-revision");
    await revision.waitFor({ timeout: 8000 });
    const tableBtn = revision.getByTestId("revise-tab-table");
    if (await tableBtn.count()) await tableBtn.click();
    const table = revision.getByTestId("revision-table");
    const revisionText = await revision.innerText();
    const shotPath = await shot(page, "06-miss-revision");
    const ok = (await table.count()) > 0 && /Revise the ideas you missed|What to remember|Topic/i.test(revisionText);
    record(
      6,
      ok ? "PASS" : "FAIL",
      `table=${(await table.count()) > 0} excerpt=${revisionText.slice(0, 180)} shot=${shotPath}`,
      { shots: [shotPath], http: 200 }
    );
    if (!ok) defects.push("Targeted miss revision did not render.");
  } catch (error) {
    const file = await shot(page, "06-revision-error").catch(() => "");
    record(6, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Targeted revision failed.");
  }

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForLibrary(page);
    const restoredTitle = await page.getByLabel("Document").evaluate((el) => {
      return el.selectedOptions?.[0]?.text ?? "";
    });
    await selectPassage(page);
    await page.getByTestId("lens-btn-test_me").click();
    await page.getByTestId("test-me-progress").waitFor({ timeout: 20000 });
    const progress = await page.getByTestId("test-me-progress").innerText();
    const review = await page.getByTestId("test-me-review").count();
    const shotPath = await shot(page, "07-refresh-resume");
    const ok = restoredTitle.toLowerCase().includes("science-circuit") && (review > 0 || /10 of 10/.test(progress));
    record(
      7,
      ok ? "PASS" : "FAIL",
      `title=${restoredTitle} progress=${progress} review=${review} shot=${shotPath}`,
      { shots: [shotPath], http: 200 }
    );
    if (!ok) defects.push("Refresh did not resume the science PDF and quiz progress.");
  } catch (error) {
    const file = await shot(page, "07-resume-error").catch(() => "");
    record(7, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Refresh resume failed.");
  }

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReader(page);
    await waitForLibrary(page);
    if (await page.getByLabel("Document").count()) {
      await selectDoc(page, "science-circuit-current").catch(() =>
        uploadPdf(page, sciencePdf, "science-circuit-current")
      );
    } else {
      await uploadPdf(page, sciencePdf, "science-circuit-current");
    }
    await closeWorkspace(page);
    await selectPassage(page);
    const toolbar = page.getByTestId("multi-lens-highlight-toolbar");
    await toolbar.waitFor({ timeout: 10000 });
    const overflow = await toolbar.evaluate((el) => el.scrollWidth - el.clientWidth);
    const labels = await toolbar.locator('[data-testid="highlight-toolbar-primary"] button').allInnerTexts();
    const mobileShot = await shot(page, "08-mobile-toolbar");
    const ok =
      overflow <= 4 &&
      ["Explain", "Illustrate", "Story", "Revise", "Test Me", "Save"].every((label) =>
        labels.some((text) => text.includes(label))
      );
    record(
      8,
      ok ? "PASS" : "FAIL",
      `overflow=${overflow} labels=${labels.join("|")} shot=${mobileShot}`,
      { shots: [mobileShot] }
    );
    if (!ok) defects.push("Mobile toolbar hid primary actions behind horizontal scroll.");
  } catch (error) {
    const file = await shot(page, "08-mobile-error").catch(() => "");
    record(8, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Mobile toolbar verification failed.");
  }
} finally {
  const ready = defects.length === 0 && steps.every((row) => row.status === "PASS");
  const results = {
    account: account.email,
    outDir,
    sciencePdf,
    mathPdf,
    ready,
    steps,
    defects,
  };
  writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ ready, defects, steps: steps.map((row) => ({ step: row.step, status: row.status })) }, null, 2));
  await browser.close();
  if (!ready) process.exitCode = 1;
}
