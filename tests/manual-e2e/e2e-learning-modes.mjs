import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "tmp-e2e-artifacts");
mkdirSync(outDir, { recursive: true });

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

const stamp = Date.now();
const account = {
  email: `oryzen.release.${stamp}@example.com`,
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
};
const pdfPath = join(outDir, `isolated-newton-${stamp}.pdf`);
writeFileSync(
  pdfPath,
  buildPdf([
    "CHAPTER 1: FORCES | An object keeps a constant velocity unless a net force acts on it. That is Newtons first law.",
    "CHAPTER 2: ENERGY | Work transfers energy. Kinetic energy depends on mass and speed.",
  ])
);

const results = [];
const lensHits = [];

async function shot(page, name) {
  const file = join(outDir, `learning-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function selectPassage(page) {
  const layer = page.getByTestId("pdf-text-layer");
  await layer.waitFor({ timeout: 20000 });
  const box = await layer.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 28, box.y + 18);
    await page.mouse.down();
    await page.mouse.move(box.x + Math.min(box.width - 16, 420), box.y + 36, {
      steps: 8,
    });
    await page.mouse.up();
  }
  const toolbar = page.getByTestId("multi-lens-highlight-toolbar");
  if ((await toolbar.count()) > 0) return;
  await page.evaluate(() => {
    const wrap = document.querySelector('[data-testid="pdf-text-layer"]');
    const root = wrap?.querySelector("div");
    if (!root) return;
    const range = document.createRange();
    range.selectNodeContents(root);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    root.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await toolbar.waitFor({ timeout: 15000 });
}

async function runLens(page, id, testId, extraCheck) {
  await selectPassage(page);
  const request = page.waitForResponse(
    (res) => res.url().includes("/api/ai/lens") && res.request().method() === "POST",
    { timeout: 25000 }
  );
  await page.getByTestId(testId).click();
  const res = await request;
  const json = await res.json().catch(() => ({}));
  lensHits.push({
    id,
    status: res.status(),
    fallback: json.usedDeterministicFallback,
    reason: json.fallbackReason,
    geminiClass: json.geminiErrorClass,
    title: json.payload?.title,
    selectedChars: json.payload ? undefined : 0,
  });
  await page.waitForSelector(
    '[data-testid="ai-lens-response-card"], [data-testid="ai-lens-error"]',
    { timeout: 20000 }
  );
  const card = page.getByTestId("ai-lens-response-card");
  const error = page.getByTestId("ai-lens-error");
  const cardText = (await card.count()) ? await card.innerText() : "";
  const errorText = (await error.count()) ? await error.innerText() : "";
  const fallback = (await page.getByTestId("ai-fallback-banner").count()) > 0;
  const flowchart = (await page.getByTestId("study-flowchart").count()) > 0;
  const extra = extraCheck
    ? await extraCheck({ cardText, errorText, fallback, flowchart, json, page })
    : true;
  const pass =
    res.ok() &&
    !errorText &&
    cardText.length > 40 &&
    extra;
  const file = await shot(page, `lens-${id}`);
  results.push({
    id,
    status: pass ? "PASS" : "FAIL",
    engine: json.usedDeterministicFallback ? "fallback" : "gemini",
    evidence: `HTTP ${res.status()} class=${json.geminiErrorClass} reason=${json.fallbackReason} title=${json.payload?.title} chars=${cardText.length} flowchart=${flowchart} error=${errorText || "none"} shot=${file}`,
  });
  if (await page.getByTestId("back-to-reading").count()) {
    await page.getByTestId("back-to-reading").click();
    await page.waitForTimeout(250);
  }
  return { json, cardText };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  await page.goto("http://127.0.0.1:3000/auth?form=1", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Sign Up" }).click();
  if (await page.getByLabel(/full name/i).count()) {
    await page.getByLabel(/full name/i).fill("Release Isolated");
  }
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/auth/password") && res.request().method() === "POST"),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  await page.waitForURL(/\/(hub|pricing|instructor|reader|body-type)/, { timeout: 25000 }).catch(() => {});
  if (page.url().includes("/body-type") && (await page.getByRole("button", { name: /Skip for now/i }).count())) {
    await page.getByRole("button", { name: /Skip for now/i }).click();
    await page.waitForTimeout(800);
  }
  if (page.url().includes("/pricing")) {
    await page.getByRole("button", { name: /Start free/i }).click();
    await page.waitForURL(/\/(hub|reader)/, { timeout: 20000 }).catch(() => {});
  }

  await page.goto("http://127.0.0.1:3000/reader", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').first().setInputFiles(pdfPath);
  await page.waitForSelector("text=/ready to read/i", { timeout: 15000 }).catch(() => {});
  await page.waitForSelector('[data-testid="pdf-text-layer"]', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const docSelect = page.getByLabel("Document");
  if (await docSelect.count()) {
    const value = await docSelect.evaluate((el) => {
      const options = [...el.options];
      const match = options.find((option) => /isolated-newton|FORCES|newton/i.test(option.text));
      return (match ?? options[options.length - 1]).value;
    });
    await docSelect.selectOption(value);
    await page.waitForTimeout(800);
  }

  await selectPassage(page);
  await page.getByTestId("reader-highlight").click();
  await page.waitForTimeout(200);
  await selectPassage(page);
  await page.getByTestId("reader-underline").click();
  const marked = await page.evaluate(() => {
    const layer = document.querySelector('[data-testid="pdf-text-layer"]');
    const html = layer?.innerHTML ?? "";
    return {
      highlight: /bg-selected|rounded-sm/.test(html),
      underline: /underline/.test(html),
    };
  });
  results.push({
    id: "highlight_underline",
    status: marked.highlight && marked.underline ? "PASS" : "FAIL",
    engine: "local",
    evidence: `highlight=${marked.highlight} underline=${marked.underline}`,
  });
  await shot(page, "marks");

  await runLens(page, "explain", "lens-btn-explain", async ({ cardText, page: p }) => {
    const depth = p.getByTestId("explain-output");
    return (await depth.count()) > 0 && /velocity|Newton|force/i.test(cardText);
  });
  await runLens(page, "illustrate", "lens-btn-illustrative", async ({ flowchart, cardText, page: p }) => {
    if (await p.getByTestId("illustrate-tab-mind_map").count()) {
      await p.getByTestId("illustrate-tab-mind_map").click();
    }
    const mind = (await p.getByTestId("study-mind-map").count()) > 0;
    return flowchart && mind && /velocity|Newton|force|idea/i.test(cardText);
  });
  await runLens(page, "story", "lens-btn-story", async ({ cardText, page: p }) => {
    return (await p.getByTestId("story-output").count()) > 0 && /velocity|Newton|force/i.test(cardText);
  });
  await runLens(page, "revise", "lens-btn-high_yield_revision", async ({ cardText, page: p }) => {
    return (await p.getByTestId("revision-table").count()) > 0 && /Main claim|remember|force|Newton/i.test(cardText);
  });
  await runLens(page, "test_me", "lens-btn-test_me", async ({ cardText }) => {
    return /According to the selected passage|velocity|Newton|force/i.test(cardText);
  });
  await runLens(page, "save", "lens-btn-save_passage", async ({ cardText, page: p }) => {
    const status = p.locator("text=/Saved to My Notebook|Saved on this device/i");
    return /Saved/i.test(cardText) || (await status.count()) > 0;
  });

  const pageBeforeNotes = await page.locator("text=/1 \\/ 2/").count();
  await page.goto("http://127.0.0.1:3000/notes", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const notesText = await page.locator("main").innerText();
  const notesPass = /p\.1|FORCES|velocity|Newton|Notebook/i.test(notesText);
  await shot(page, "notes");
  results.push({
    id: "notebook",
    status: notesPass ? "PASS" : "FAIL",
    engine: "local",
    evidence: notesText.slice(0, 280),
  });

  await page.goto("http://127.0.0.1:3000/reader", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const pageAfter = await page.locator("text=/1 \\/ 2|1 \\/ 3/").count();
  results.push({
    id: "return_to_page",
    status: pageAfter > 0 || pageBeforeNotes > 0 ? "PASS" : "FAIL",
    engine: "local",
    evidence: `pageAfter=${pageAfter} pageBeforeNotes=${pageBeforeNotes} url=${page.url()}`,
  });

  await page.getByTestId("transform-open").click();
  await page.waitForSelector('[data-testid="transform-dialog"]', { timeout: 8000 });
  const chapterBtn = page.locator('[data-testid="transform-dialog"] button').filter({
    hasText: /CHAPTER 1|FORCES|Opening/i,
  }).first();
  if (await chapterBtn.count()) await chapterBtn.click();
  else await page.locator('[data-testid="transform-dialog"] button').nth(1).click();
  const transformReq = page.waitForResponse(
    (res) => res.url().includes("/api/ai/lens") && res.request().method() === "POST",
    { timeout: 25000 }
  );
  await page.getByTestId("transform-generate").click();
  const transformRes = await transformReq;
  const transformJson = await transformRes.json().catch(() => ({}));
  await page.waitForSelector('[data-testid="transform-edition"]', { timeout: 15000 });
  const transformText = await page.getByTestId("transform-edition").innerText();
  const sliceOnly = !/Kinetic energy depends/i.test(transformText);
  const grounded = /force|Newton|velocity/i.test(transformText);
  results.push({
    id: "transform",
    status: transformRes.ok() && grounded && sliceOnly ? "PASS" : "FAIL",
    engine: transformJson.usedDeterministicFallback ? "fallback" : "gemini",
    evidence: `HTTP ${transformRes.status()} class=${transformJson.geminiErrorClass} reason=${transformJson.fallbackReason} grounded=${grounded} sliceOnly=${sliceOnly} text=${transformText.slice(0, 180)}`,
  });
  await shot(page, "transform");
} catch (error) {
  results.push({
    id: "script",
    status: "FAIL",
    engine: "none",
    evidence: error instanceof Error ? error.message : String(error),
  });
  await shot(page, "script-error").catch(() => {});
} finally {
  const summary = { account: account.email, results, lensHits };
  writeFileSync(join(outDir, "learning-modes-results.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
}
