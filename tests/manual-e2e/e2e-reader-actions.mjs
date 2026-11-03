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

const pages = Array.from({ length: 15 }, (_, idx) => {
  const n = idx + 1;
  if (n === 4) {
    return "Newton first law | An object keeps a constant velocity unless a net force acts on it. That is Newtons first law.";
  }
  if (n === 13) {
    return "Campaign blueprint | A landing page should lead with one customer outcome, then show proof, then one clear call to action.";
  }
  return `Section ${n} | Supporting page ${n} for the marketing study workbook.`;
});
const pdfPath = join(outDir, "marketing-blueprint.pdf");
writeFileSync(pdfPath, buildPdf(pages));

const stamp = Date.now();
const account = {
  email: `oryzen.reader.${stamp}@example.com`,
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
};

const results = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
const failedRequests = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("response", (res) => {
  if (res.url().includes("/api/ai/lens") || res.url().includes("/api/notes")) {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
  }
});

async function shot(name) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function waitForResponseCard() {
  await page.waitForSelector('[data-testid="ai-lens-response-card"], [data-testid="ai-lens-error"]', {
    timeout: 20000,
  });
}

async function runLens(id, testId, checks) {
  const request = page.waitForResponse(
    (res) => res.url().includes("/api/ai/lens") && res.request().method() === "POST",
    { timeout: 20000 }
  );
  await page.getByTestId(testId).click();
  const res = await request;
  const json = await res.json().catch(() => ({}));
  await waitForResponseCard();
  await page.waitForTimeout(300);
  const card = page.getByTestId("ai-lens-response-card");
  const error = page.getByTestId("ai-lens-error");
  const cardText = (await card.count()) ? await card.innerText() : "";
  const errorText = (await error.count()) ? await error.innerText() : "";
  const fallback = (await page.getByTestId("ai-fallback-banner").count()) > 0;
  const rawStars = /\*\*[A-Za-z]/.test(cardText);
  const flowchart = (await page.getByTestId("study-flowchart").count()) > 0;
  const table = (await page.locator('[data-testid="ai-lens-response-card"] table').count()) > 0;
  const mcq = (await page.locator('[data-testid="ai-lens-response-card"] button').count()) > 0;
  const extra = checks
    ? await checks({ cardText, errorText, fallback, flowchart, table, mcq, json, status: res.status() })
    : true;
  const pass =
    res.ok() &&
    !errorText &&
    cardText.length > 40 &&
    !rawStars &&
    extra;
  const file = await shot(`lens-${id}`);
  results.push({
    id,
    status: pass ? "PASS" : "FAIL",
    evidence: `HTTP ${res.status()} fallback=${json.usedDeterministicFallback} reason=${json.fallbackReason} title=${json.payload?.title} cardChars=${cardText.length} rawStars=${rawStars} flowchart=${flowchart} table=${table} error=${errorText || "none"} shot=${file}`,
  });
  return { json, cardText };
}

try {
  await page.goto("http://127.0.0.1:3000/auth?form=1", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Sign Up" }).click();
  if (await page.getByLabel(/full name/i).count()) {
    await page.getByLabel(/full name/i).fill("Reader Test");
  }
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/auth/password") && res.request().method() === "POST"),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  await page.waitForURL(/\/(hub|pricing|instructor|reader)/, { timeout: 25000 }).catch(() => {});
  if (page.url().includes("/pricing")) {
    await page.getByRole("button", { name: /Start free/i }).click();
    await page.waitForURL(/\/(hub|reader)/, { timeout: 20000 }).catch(() => {});
  }

  await page.goto("http://127.0.0.1:3000/reader", { waitUntil: "networkidle" });
  const expand = page.getByRole("button", { name: "Expand reader toolbar" });
  if (await expand.count()) await expand.click().catch(() => {});
  await page.locator('input[type="file"]').first().setInputFiles(pdfPath);
  await page.waitForTimeout(2500);

  const next = page.getByRole("button", { name: "Next Page" });
  for (let i = 0; i < 12; i += 1) {
    if (await next.isDisabled()) break;
    await next.click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(800);
  const pageLabel = await page.locator("text=/13 \\/ 15/").count();
  if (!pageLabel) {
    // Jump via page grid if the next button is gated by extraction
    if (await page.getByRole("button", { name: "Page grid" }).count()) {
      await page.getByRole("button", { name: "Page grid" }).click();
      await page.getByText("Page 13", { exact: false }).first().click();
      await page.waitForTimeout(800);
    }
  }

  const explore = page.getByRole("button", { name: "Explore this passage" }).first();
  if (await explore.count()) {
    await explore.click();
  } else {
    await page.getByRole("button", { name: "Explain this passage" }).first().click();
    await waitForResponseCard();
  }
  await page.waitForSelector('[data-testid="multi-lens-highlight-toolbar"]', { timeout: 15000 });
  await shot("page-13-selected");

  await runLens("ayurvedic", "lens-btn-ayurvedic", ({ cardText }) =>
    /landing page|customer outcome|study/i.test(cardText) && !/Vata|Pitta|Kapha/.test(cardText)
  );
  await runLens("illustrative", "lens-btn-illustrative", ({ flowchart, cardText }) =>
    flowchart && /visual map|core idea|landing|customer/i.test(cardText)
  );
  await runLens("revision", "lens-btn-high_yield_revision", ({ table, cardText }) =>
    table && /Main claim|remember/i.test(cardText)
  );
  await runLens("save", "lens-btn-save_passage", ({ cardText }) => {
    const statusText = page.locator("text=/Saved to My Notebook|Saved on this device/i");
    return Promise.resolve(
      /Saved to My Notebook|Saved on this device|Saved/i.test(cardText)
    ).then(async (fromCard) => fromCard || (await statusText.count()) > 0);
  });
  await runLens("test_me", "lens-btn-test_me", ({ cardText }) =>
    /According to the selected passage|landing page|customer outcome/i.test(cardText)
  );
  await runLens("explain", "lens-btn-explain", ({ cardText }) =>
    /Explanation|landing page|customer outcome/i.test(cardText)
  );

  await page.goto("http://127.0.0.1:3000/notes", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const notesText = await page.locator("main").innerText();
  const notesPass = /p\.13|Campaign blueprint|landing page|Saved passages/i.test(notesText);
  await shot("notes-after-save");
  results.push({
    id: "notes_refresh",
    status: notesPass ? "PASS" : "FAIL",
    evidence: notesText.slice(0, 400),
  });

  await page.goto("http://127.0.0.1:3000/reader", { waitUntil: "networkidle" });
  const expand2 = page.getByRole("button", { name: "Expand reader toolbar" });
  if (await expand2.count()) await expand2.click().catch(() => {});
  for (let i = 0; i < 20; i += 1) {
    const prev = page.getByRole("button", { name: "Previous Page" });
    if (await prev.isDisabled()) break;
    await prev.click();
    await page.waitForTimeout(120);
  }
  const next2 = page.getByRole("button", { name: "Next Page" });
  for (let i = 0; i < 3; i += 1) await next2.click();
  await page.waitForTimeout(800);
  if (await page.getByRole("button", { name: "Explore this passage" }).count()) {
    await page.getByRole("button", { name: "Explore this passage" }).first().click();
  }
  await page.waitForSelector('[data-testid="multi-lens-highlight-toolbar"]', { timeout: 15000 });
  await runLens("explain_physics", "lens-btn-explain", ({ cardText }) =>
    /Newton|velocity|force/i.test(cardText) && !/Vata|Pitta|Kapha/.test(cardText)
  );
  await runLens("test_me_physics", "lens-btn-test_me", ({ cardText }) =>
    /velocity|Newton|force/i.test(cardText)
  );

  results.push({
    id: "console_network",
    status: failedRequests.length === 0 ? "PASS" : "FAIL",
    evidence: `consoleErrors=${consoleErrors.length} failedApi=${failedRequests.join(" | ") || "none"} console=${consoleErrors.slice(0, 3).join(" | ") || "none"}`,
  });
} catch (error) {
  results.push({
    id: "script",
    status: "FAIL",
    evidence: error instanceof Error ? error.message : String(error),
  });
  await shot("script-error").catch(() => {});
} finally {
  console.log(JSON.stringify({ results, consoleErrors, failedRequests }, null, 2));
  await browser.close();
}
