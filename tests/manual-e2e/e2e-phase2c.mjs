/**
 * ORYZEN Learn Phase 2C local browser acceptance.
 * Deterministic AI only. Reuses existing :3000. Does not deploy or migrate live.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://127.0.0.1:3000";
const outDir = join(process.cwd(), "tmp-e2e-artifacts", "phase2c");
mkdirSync(outDir, { recursive: true });

const stamp = Math.floor(Date.now() / 1000);
const account = {
  email: `oryzen.2c.${stamp}@example.com`,
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
  fullName: "Phase 2C Isolated",
};

function buildPdf(pages) {
  const objects = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  const pageObjNumbers = pages.map((_, idx) => 4 + idx * 2);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [ ${pageObjNumbers.map((n) => `${n} 0 R`).join(" ")} ] /Count ${pages.length} >>\nendobj\n`
  );
  objects.push("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  pages.forEach((rawText, idx) => {
    const pageObjNum = 4 + idx * 2;
    const contentObjNum = pageObjNum + 1;
    const [headingPart, bodyPart] = rawText.split("|").map((s) => s.trim());
    const safeHeading = (headingPart || `CHAPTER ${idx + 1}`).replace(/[()\\]/g, "");
    const safeBody = (bodyPart || "Study text").replace(/[()\\]/g, "");
    const streamContent = [
      "BT",
      "/F1 16 Tf",
      `48 710 Td (${safeHeading}) Tj`,
      "/F1 12 Tf",
      `0 -28 Td (${safeBody}) Tj`,
      "ET",
    ].join("\n");
    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`
    );
  });
  let pdfText = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdfText.length);
    pdfText += obj;
  }
  const xrefStart = pdfText.length;
  pdfText += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdfText += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdfText += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdfText, "utf8");
}

const scienceName = `phase2c-circuit-${stamp}`;
const mathName = `phase2c-triangle-${stamp}`;
const sciencePdf = join(outDir, `${scienceName}.pdf`);
const mathPdf = join(outDir, `${mathName}.pdf`);
writeFileSync(
  sciencePdf,
  buildPdf([
    "CIRCUIT CURRENT | An electric circuit needs a closed path. Current is the flow of electrons. A 2 ampere current means two coulombs of charge pass a point each second.",
    "RESISTANCE | Resistance limits current. A larger resistance in the same circuit lowers the electron flow.",
  ])
);
writeFileSync(
  mathPdf,
  buildPdf([
    "RIGHT TRIANGLE | The square of the hypotenuse of a right triangle equals the sum of the squares of the other two sides. If the sides are 3 cm and 4 cm, the hypotenuse is 5 cm.",
    "UNITS | Keep the centimetre unit with each length. 5 cm is not the same as 5 square centimetres.",
  ])
);

const AYURVEDA_RE = /tridosha|vata|pitta|kapha|prakriti|ayurved|dhee|dhriti|smriti/i;
const SCIENCE_RE = /circuit|electron|ampere|current|coulomb/i;
const MATH_RE = /triangle|hypotenuse|square|3 cm|4 cm|5 cm/i;

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
  await page.getByLabel("Document").waitFor({ timeout: 20000 });
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

async function runLens(page, testId, { delayMs = 0, mutate } = {}) {
  if (delayMs || mutate) {
    await page.route("**/api/ai/lens", async (route) => {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const response = await route.fetch();
      if (!mutate) {
        await route.fulfill({ response });
        return;
      }
      const json = await response.json();
      mutate(json);
      await route.fulfill({
        status: response.status(),
        headers: { "content-type": "application/json" },
        body: JSON.stringify(json),
      });
    });
  }
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
  if (delayMs || mutate) await page.unroute("**/api/ai/lens");
  return { res, json };
}

async function closeWorkspace(page) {
  const back = page.getByTestId("back-to-reading");
  const close = page.getByLabel("Close study response");
  if (await back.count()) {
    await back.click({ force: true });
    await page.waitForTimeout(250);
    return;
  }
  if (await close.count()) {
    await close.click({ force: true });
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
let storageState = null;
let scienceQuizJson = null;

try {
  // --- Step 1: launch + isolated signup ---
  try {
    const health = await page.request.get(`${BASE}/api/health`);
    await page.goto(`${BASE}/auth?form=1`, { waitUntil: "networkidle" });
    const authShot = await shot(page, "01-auth");
    await page.getByRole("tab", { name: "Sign Up" }).click();
    if (await page.getByLabel(/full name/i).count()) {
      await page.getByLabel(/full name/i).fill(account.fullName);
    }
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    const [signupRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/auth/password") && res.request().method() === "POST"
      ),
      page.getByRole("button", { name: "Create account" }).click(),
    ]);
    const signupJson = await signupRes.json().catch(() => ({}));
    await page
      .waitForURL(/\/(hub|pricing|instructor|reader|body-type)/, { timeout: 25000 })
      .catch(() => {});
    if (page.url().includes("/body-type")) {
      const skip = page.getByRole("button", { name: /Skip for now/i });
      if (await skip.count()) {
        await skip.click();
        await page.waitForTimeout(600);
      }
    }
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
    const hubShot = await shot(page, "01-hub-signed-in");
    const brand = await page.locator('img[alt="Oryzen Learn"]').count();
    const ok =
      signupRes.ok() &&
      signupJson.status === "authenticated" &&
      (page.url().includes("/hub") || page.url().includes("/reader")) &&
      brand > 0;
    record(1, ok ? "PASS" : "FAIL", `HTTP ${signupRes.status()} next=${signupJson.next} url=${page.url()} brand=${brand} shots=${authShot} ${hubShot}`, {
      shots: [authShot, hubShot],
      http: signupRes.status(),
      account: account.email,
    });
    if (!ok) defects.push("Isolated signup did not land on hub/reader with original logo.");
    storageState = await desktop.storageState();
  } catch (error) {
    const file = await shot(page, "01-auth-error").catch(() => "");
    record(1, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Step 1 signup failed.");
  }

  // --- Step 2: science PDF, original file ---
  try {
    await gotoReader(page);
    await waitForLibrary(page);
    await uploadPdf(page, sciencePdf, scienceName);
    const text = await layerText(page);
    const canvasShot = await shot(page, "02-science-original-pdf");
    const selectedTitle = await page.getByLabel("Document").inputValue().catch(() => "");
    const titleText = await page.getByLabel("Document").evaluate((el) => {
      const opt = el.selectedOptions?.[0];
      return opt?.text ?? "";
    });
    const grounded = assertGrounded(text, SCIENCE_RE);
    const original =
      grounded.ok &&
      titleText.toLowerCase().includes("phase2c-circuit") &&
      !titleText.toLowerCase().includes("constitution");
    record(
      2,
      original ? "PASS" : "FAIL",
      `title=${titleText} selected=${selectedTitle} hasSource=${grounded.hasSource} ayurvedaSwap=${grounded.swapped} excerpt=${text.slice(0, 160)} shot=${canvasShot}`,
      { shots: [canvasShot], http: 200, layerExcerpt: text.slice(0, 240) }
    );
    if (!original) defects.push("Uploaded science PDF was not shown as the original file.");
  } catch (error) {
    const file = await shot(page, "02-science-error").catch(() => "");
    record(2, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Science PDF upload/reader failed.");
  }

  // --- Step 3: simple explanation ---
  try {
    const { res, json } = await runLens(page, "lens-btn-explain");
    await page.getByTestId("explain-depth-simple").click();
    const card = page.getByTestId("ai-lens-response-card");
    await card.waitFor({ timeout: 10000 });
    const simple = page.getByTestId("explain-class-band");
    const simpleText = (await simple.count()) ? await simple.innerText() : "";
    const cardText = await card.innerText();
    const explain = json.payload?.explain ?? {};
    const shotPath = await shot(page, "03-simple-explanation");
    const grounded = assertGrounded(`${simpleText}\n${cardText}\n${explain.simpleExplanation ?? ""}`, SCIENCE_RE);
    const structured = Boolean(
      explain.simpleExplanation &&
        explain.standardExplanation &&
        explain.keyTakeaway &&
        Array.isArray(explain.importantConcepts) &&
        explain.importantConcepts.length > 0
    );
    const ok =
      res.ok() &&
      structured &&
      grounded.ok &&
      json.usedDeterministicFallback === true;
    record(
      3,
      ok ? "PASS" : "FAIL",
      `HTTP ${res.status()} structured=${structured} grounded=${grounded.ok} fallback=${json.fallbackReason} simple=${simpleText.slice(0, 140)} shot=${shotPath}`,
      { shots: [shotPath], http: res.status() }
    );
    if (!ok) defects.push("Simple explanation missing structure or source grounding.");
    await closeWorkspace(page);
  } catch (error) {
    const file = await shot(page, "03-explain-error").catch(() => "");
    record(3, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Explain lens failed.");
  }

  // --- Step 4: 10 MCQs ---
  try {
    const { res, json } = await runLens(page, "lens-btn-test_me");
    scienceQuizJson = json;
    const mcqs = json.payload?.mcqs ?? [];
    const quiz = page.getByTestId("test-me-quiz");
    await quiz.waitFor({ timeout: 10000 });
    const progress = await page.getByTestId("test-me-progress").innerText();
    const shotPath = await shot(page, "04-ten-mcqs");
    const groundedQs = mcqs.filter((item) =>
      SCIENCE_RE.test(`${item.question} ${item.options?.join(" ")} ${item.explanation}`)
    ).length;
    const ayurvedaLeak = mcqs.some((item) =>
      AYURVEDA_RE.test(`${item.question} ${item.options?.join(" ")}`)
    );
    const ok = res.ok() && mcqs.length === 10 && !ayurvedaLeak && /10/.test(progress);
    record(
      4,
      ok ? "PASS" : "FAIL",
      `HTTP ${res.status()} count=${mcqs.length} progress=${progress} groundedQs=${groundedQs} ayurvedaLeak=${ayurvedaLeak} shot=${shotPath}`,
      { shots: [shotPath], http: res.status(), mcqCount: mcqs.length }
    );
    if (!ok) defects.push(`Test Me returned ${mcqs.length} questions, expected 10.`);
  } catch (error) {
    const file = await shot(page, "04-mcq-error").catch(() => "");
    record(4, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("MCQ generation failed.");
  }

  // --- Step 5: wrong answers → weak concepts ---
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
      !/none — keep the same claims/i.test(weakText) &&
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

  // --- Step 6: targeted revision ---
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

  // --- Step 7: refresh resumes ---
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForLibrary(page);
    const restoredTitle = await page.getByLabel("Document").evaluate((el) => {
      return el.selectedOptions?.[0]?.text ?? "";
    });
    if (!restoredTitle.toLowerCase().includes(scienceName.toLowerCase())) {
      await selectDoc(page, scienceName);
    }
    await page.waitForSelector('[data-testid="pdf-text-layer"]', { timeout: 20000 });
    const { res, json } = await runLens(page, "lens-btn-test_me");
    await page.getByTestId("test-me-quiz").waitFor({ timeout: 10000 });
    const progress = await page.getByTestId("test-me-progress").innerText();
    const review = await page.getByTestId("test-me-review").count();
    const stored = await page.evaluate(() => {
      try {
        return window.localStorage.getItem("oryzen_reader_quiz_progress_v1") || "";
      } catch {
        return "";
      }
    });
    const shotPath = await shot(page, "07-refresh-resume");
    const ok =
      res.ok() &&
      /10 of 10 answered|10 of 10/.test(progress) &&
      review > 0 &&
      stored.includes("weakConcepts");
    record(
      7,
      ok ? "PASS" : "FAIL",
      `HTTP ${res.status()} progress=${progress} review=${review} storedChars=${stored.length} shot=${shotPath}`,
      { shots: [shotPath], http: res.status() }
    );
    if (!ok) defects.push("Quiz progress did not resume after refresh.");
    await closeWorkspace(page);
  } catch (error) {
    const file = await shot(page, "07-refresh-error").catch(() => "");
    record(7, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Refresh resume failed.");
  }

  // --- Step 8: mathematics PDF ---
  try {
    await uploadPdf(page, mathPdf, mathName);
    const text = await layerText(page);
    const groundedPdf = assertGrounded(text, MATH_RE);
    const titleText = await page.getByLabel("Document").evaluate((el) => el.selectedOptions?.[0]?.text ?? "");
    const pdfShot = await shot(page, "08-math-original-pdf");
    const { res, json } = await runLens(page, "lens-btn-explain");
    await page.getByTestId("explain-depth-simple").click();
    const simple = (await page.getByTestId("explain-class-band").innerText()) ?? "";
    const explainShot = await shot(page, "08-math-explanation");
    await closeWorkspace(page);
    const quiz = await runLens(page, "lens-btn-test_me");
    const mcqs = quiz.json.payload?.mcqs ?? [];
    const quizShot = await shot(page, "08-math-mcqs");
    const groundedExplain = assertGrounded(
      `${simple}\n${json.payload?.explain?.simpleExplanation ?? ""}`,
      MATH_RE
    );
    const ok =
      groundedPdf.ok &&
      titleText.toLowerCase().includes("phase2c-triangle") &&
      res.ok() &&
      groundedExplain.ok &&
      quiz.res.ok() &&
      mcqs.length === 10;
    record(
      8,
      ok ? "PASS" : "FAIL",
      `title=${titleText} pdfGrounded=${groundedPdf.ok} explainHTTP=${res.status()} quizCount=${mcqs.length} simple=${simple.slice(0, 120)} shots=${pdfShot} ${explainShot} ${quizShot}`,
      { shots: [pdfShot, explainShot, quizShot], http: res.status() }
    );
    if (!ok) defects.push("Mathematics PDF path did not stay source-grounded with 10 MCQs.");
    await closeWorkspace(page);
  } catch (error) {
    const file = await shot(page, "08-math-error").catch(() => "");
    record(8, "FAIL", error instanceof Error ? error.message : String(error), { shots: [file] });
    defects.push("Mathematics path failed.");
  }
} catch (error) {
  record("script", "FAIL", error instanceof Error ? error.message : String(error));
}

// --- Step 9: mobile 390 + loading/error/quota ---
try {
  if (!storageState) throw new Error("No signed-in storage state for mobile pass");
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    storageState,
  });
  const mpage = await mobile.newPage();
  await mpage.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
  if (mpage.url().includes("/auth")) throw new Error("Mobile session missing");
  await waitForLibrary(mpage);
  await uploadPdf(mpage, sciencePdf, scienceName);
  const layoutShot = await shot(mpage, "09-mobile-390-reader");
  const openVisible = await mpage.getByText("Open", { exact: true }).first().isVisible();
  const layerVisible = await mpage.getByTestId("pdf-text-layer").isVisible();
  const overflow = await mpage.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = window.scrollX;
    window.scrollTo(240, window.scrollY);
    const windowScrolled = window.scrollX > prev + 1;
    window.scrollTo(prev, window.scrollY);
    return {
      scrollWidth: html.scrollWidth,
      clientWidth: html.clientWidth,
      windowScrolled,
      htmlOverflowX: getComputedStyle(html).overflowX,
      bodyOverflowX: getComputedStyle(body).overflowX,
    };
  });

  await mpage.route("**/api/ai/lens", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1600));
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "LOCAL TEST HARNESS: forced lens error" }),
    });
  });
  await selectPassage(mpage);
  const loadingClicked = mpage.getByTestId("lens-btn-explain").click();
  await mpage.waitForSelector('[data-testid="ai-lens-loading-skeleton"]', { timeout: 2500 });
  const loadingShot = await shot(mpage, "09-mobile-loading");
  const loadingSeen = (await mpage.getByTestId("ai-lens-loading-skeleton").count()) > 0;
  await loadingClicked.catch(() => {});
  await mpage.waitForSelector('[data-testid="ai-lens-error"]', { timeout: 10000 });
  const errorShot = await shot(mpage, "09-mobile-error");
  const errorText = await mpage.getByTestId("ai-lens-error").innerText();
  await mpage.unroute("**/api/ai/lens");
  await closeWorkspace(mpage);

  // LOCAL TEST HARNESS: rewrite a real deterministic payload as wallet_exhausted.
  // No paid API is called. Wallet spend cannot be filled without paid keys.
  await mpage.route("**/api/ai/lens", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.usedDeterministicFallback = true;
    json.fallbackReason = "wallet_exhausted";
    json.budgetBlocked = true;
    if (json.payload) json.payload.used_fallback = true;
    await route.fulfill({
      status: response.status(),
      headers: { "content-type": "application/json" },
      body: JSON.stringify(json),
    });
  });
  const wallet = await runLens(mpage, "lens-btn-explain");
  const banner = mpage.getByTestId("ai-fallback-banner");
  await banner.waitFor({ timeout: 8000 });
  const bannerText = await banner.innerText();
  const walletShot = await shot(mpage, "09-mobile-wallet-cap");
  const readerStill = await mpage.getByTestId("pdf-text-layer").isVisible();
  await mpage.unroute("**/api/ai/lens");
  await closeWorkspace(mpage);
  const usableShot = await shot(mpage, "09-mobile-reader-after-quota");

  const walletOk = /budget is used up|keep reading/i.test(bannerText) && readerStill && wallet.res.ok();
  const layoutOk = openVisible && layerVisible && overflow.windowScrolled === false;
  const errorOk = /forced lens error|couldn|try again/i.test(errorText);
  const ok = layoutOk && loadingSeen && errorOk && walletOk;
  record(
    9,
    ok ? "PASS" : "FAIL",
    `layoutOk=${layoutOk} open=${openVisible} layer=${layerVisible} overflow=${overflow.scrollWidth}/${overflow.clientWidth} loadingSeen=${loadingSeen} error=${errorText.slice(0, 80)} banner=${bannerText} readerAfter=${readerStill} shots=${layoutShot} ${loadingShot} ${errorShot} ${walletShot} ${usableShot}`,
    {
      shots: [layoutShot, loadingShot, errorShot, walletShot, usableShot],
      http: wallet.res.status(),
      harness:
        "LOCAL TEST HARNESS: 500 error + wallet_exhausted rewrite. No paid provider called. Gateway wallet hard-stop covered by vitest.",
    }
  );
  if (!loadingSeen) {
    defects.push("Loading skeleton was not captured (timing). Error and quota banners were still exercised.");
  }
  if (!ok) defects.push("Mobile 390 layout or quota/error states failed.");
  await mobile.close();
} catch (error) {
  record(9, "FAIL", error instanceof Error ? error.message : String(error));
  defects.push("Mobile pass failed.");
}

await browser.close();

const summary = {
  account: account.email,
  outDir,
  sciencePdf,
  mathPdf,
  steps,
  defects,
};
writeFileSync(join(outDir, "results.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
const failed = steps.filter((row) => row.status !== "PASS");
process.exit(failed.length ? 1 : 0);
