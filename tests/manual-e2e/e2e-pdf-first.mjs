import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "tmp-e2e-artifacts");
mkdirSync(outDir, { recursive: true });

const stamp = Date.now();
const account = {
  email: `oryzen.pdffirst.${stamp}@example.com`,
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
};

const results = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("response", (res) => {
  if (res.status() >= 400) consoleErrors.push(`${res.status()} ${res.url()}`);
});

async function shot(name) {
  const file = join(outDir, `pdf-first-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function record(id, status, evidence) {
  results.push({ id, status, evidence });
  console.log(`${status} ${id}: ${evidence}`);
}

async function selectDocument(name) {
  const select = page.getByLabel("Document");
  if ((await select.count()) === 0) return false;
  const options = await select.locator("option").allTextContents();
  const match = options.find((label) => label.toLowerCase().includes(name.toLowerCase()));
  if (!match) return false;
  await select.selectOption({ label: match });
  await page.waitForTimeout(800);
  return true;
}

async function selectPageText() {
  const mounted = page.locator('[data-testid^="pdf-mounted-page-"][data-active="true"]').first();
  await mounted.waitFor({ timeout: 20000 });
  await mounted.click({ position: { x: 40, y: 40 } });
  await page.waitForSelector('[data-testid="multi-lens-highlight-toolbar"]', { timeout: 8000 });
}

async function waitForCard() {
  await page.waitForSelector(
    '[data-testid="ai-lens-response-card"], [data-testid="ai-lens-error"]',
    { timeout: 25000 }
  );
}

try {
  const signup = await page.request.post("http://127.0.0.1:3000/api/auth/password", {
    data: {
      action: "sign_up",
      email: account.email,
      password: account.password,
      fullName: "PDF First",
      deviceId: `tablet-${stamp}`,
      deviceType: "tablet",
    },
  });
  const signupJson = await signup.json().catch(() => ({}));
  if (!signup.ok()) {
    throw new Error(`sign_up failed ${signup.status()} ${JSON.stringify(signupJson)}`);
  }
  await page.goto("http://127.0.0.1:3000/reader", { waitUntil: "networkidle" });
  if (page.url().includes("/pricing") || page.url().includes("/access")) {
    const start = page.getByRole("button", { name: /Start free|Continue|Begin/i });
    if (await start.count()) await start.click();
    await page.waitForTimeout(800);
  }
  if (!page.url().includes("/reader")) {
    await page.goto("http://127.0.0.1:3000/reader", { waitUntil: "networkidle" });
  }

  await page.goto("http://127.0.0.1:3000/reader", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="pdf-reading-canvas"]', { timeout: 20000 });
  await page.waitForSelector('[data-testid="pdf-empty-state"], canvas, [aria-label="Document"]', {
    timeout: 20000,
  });
  await page.waitForTimeout(4000);
  const docs = await page.getByLabel("Document").locator("option").allTextContents().catch(() => []);
  await selectDocument("newton").catch(() => false);
  await selectDocument("campaign").catch(() => false);
  await page.waitForTimeout(1500);
  const debug = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const box = canvas?.getBoundingClientRect();
    return {
      empty: Boolean(document.querySelector('[data-testid="pdf-empty-state"]')),
      render: document.querySelector("[data-render]")?.getAttribute("data-render"),
      canvas: box && { w: box.width, h: box.height, x: box.x, y: box.y },
    };
  });
  if (!debug.canvas || debug.canvas.w < 240 || debug.canvas.h < 240) {
    const body = await page.locator("body").innerText();
    throw new Error(
      `PDF did not render url=${page.url()} docs=${JSON.stringify(docs)} debug=${JSON.stringify(debug)} body=${body.slice(0, 400)}`
    );
  }
  const canvasBox = await page.locator("canvas").first().boundingBox();
  const hostBox = await page.getByTestId("pdf-reading-canvas").boundingBox();
  const sidePanel = await page.getByTestId("recommendations-panel").count();
  const centered =
    canvasBox &&
    hostBox &&
    canvasBox.width > 280 &&
    Math.abs(canvasBox.x + canvasBox.width / 2 - (hostBox.x + hostBox.width / 2)) < 160;
  const shot1 = await shot("01-open-pdf");
  record(
    "1",
    centered && sidePanel === 0 ? "PASS" : "FAIL",
    `canvas=${JSON.stringify(canvasBox)} host=${JSON.stringify(hostBox)} sidePanel=${sidePanel} ${shot1}`
  );

  const pageBefore = await page.locator("text=/\\d+ \\/ \\d+/").first().innerText();
  await page.getByTestId("fit-width-btn").click();
  await page.getByRole("button", { name: "Zoom In" }).click();
  if (await page.getByRole("button", { name: "Next Page" }).isEnabled()) {
    await page.getByRole("button", { name: "Next Page" }).click();
    await page.waitForTimeout(400);
  }
  await page.getByTestId("fit-page-btn").click();
  await page.waitForTimeout(400);
  const pageAfter = await page.locator("text=/\\d+ \\/ \\d+/").first().innerText();
  const shot2 = await shot("02-zoom-nav");
  record(
    "2",
    pageBefore !== pageAfter || (await page.getByTestId("fit-page-btn").getAttribute("aria-pressed")) === "true"
      ? "PASS"
      : "FAIL",
    `before=${pageBefore} after=${pageAfter} ${shot2}`
  );

  if (await page.getByRole("button", { name: "Previous Page" }).isEnabled()) {
    await page.getByRole("button", { name: "Previous Page" }).click();
    await page.waitForTimeout(300);
  }

  await selectPageText();
  const toolbar = await page.getByTestId("multi-lens-highlight-toolbar").count();
  const shot3 = await shot("03-highlight");
  record("3", toolbar > 0 ? "PASS" : "FAIL", `toolbar=${toolbar} ${shot3}`);

  const explainReq = page.waitForResponse(
    (res) => res.url().includes("/api/ai/lens") && res.request().method() === "POST"
  );
  await page.getByTestId("lens-btn-explain").click();
  const explainRes = await explainReq;
  await waitForCard();
  const explainText = await page.getByTestId("ai-lens-response-card").innerText();
  const shot4 = await shot("04-explain");
  record(
    "4",
    /Simple explanation|Important concepts|Key takeaway/i.test(explainText) &&
      !/\*\*[A-Za-z]/.test(explainText)
      ? "PASS"
      : "FAIL",
    `http=${explainRes.status()} chars=${explainText.length} ${shot4}`
  );

  await page.getByTestId("back-to-reading").click();
  await page.waitForTimeout(400);
  await selectPageText();
  const illReq = page.waitForResponse(
    (res) => res.url().includes("/api/ai/lens") && res.request().method() === "POST"
  );
  await page.getByTestId("lens-btn-illustrative").click();
  await illReq;
  await waitForCard();
  const flowchartTab = page.getByRole("button", { name: "Flowchart" });
  if (await flowchartTab.count()) await flowchartTab.click();
  const flowchartSvg = await page.locator('[data-testid="study-flowchart"] svg rect').count();
  const arrowProse = await page.getByTestId("ai-lens-response-card").innerText();
  const shot5 = await shot("05-flowchart");
  record(
    "5",
    flowchartSvg >= 3 && !/\[Core Idea\]\s*→/.test(arrowProse) ? "PASS" : "FAIL",
    `svgRects=${flowchartSvg} ${shot5}`
  );

  const mindTab = page.getByRole("button", { name: "Mind Map" });
  if (await mindTab.count()) {
    await mindTab.click();
  } else {
    await page.getByTestId("illustrate-tab-mind_map").click({ timeout: 5000 }).catch(() => {});
  }
  await page.waitForTimeout(200);
  const mindSvg = await page.locator('[data-testid="study-mind-map"] svg').count();
  const mindNodes = await page.locator('[data-testid="study-mind-map"] svg circle, [data-testid="study-mind-map"] svg rect').count();
  const mindText = (await page.getByTestId("study-mind-map").count())
    ? await page.getByTestId("study-mind-map").innerText()
    : await page.getByTestId("ai-lens-response-card").innerText();
  const shot6 = await shot("06-mindmap");
  record(
    "6",
    mindSvg > 0 && mindNodes >= 2 && !/\[Core Idea\]\s*→/.test(mindText) ? "PASS" : "FAIL",
    `svg=${mindSvg} nodes=${mindNodes} tabs=${await mindTab.count()} text=${mindText.slice(0, 80)} ${shot6}`
  );

  await page.getByTestId("back-to-reading").click();
  await page.waitForTimeout(300);
  await selectPageText();
  const revReq = page.waitForResponse(
    (res) => res.url().includes("/api/ai/lens") && res.request().method() === "POST"
  );
  await page.getByTestId("lens-btn-high_yield_revision").click();
  await revReq;
  await waitForCard();
  await page.getByTestId("revise-tab-table").click();
  const table = await page.locator('[data-testid="revision-table"]').count();
  const tableText = table ? await page.locator('[data-testid="revision-table"]').innerText() : "";
  const shot7 = await shot("07-revision-table");
  record(
    "7",
    table > 0 && !/\*\*/.test(tableText) ? "PASS" : "FAIL",
    `table=${table} rawStars=${/\*\*/.test(tableText)} ${shot7}`
  );

  await page.getByTestId("back-to-reading").click();
  const switched = await selectDocument("campaign");
  await page.waitForTimeout(600);
  await selectPageText();
  const memReq = page.waitForResponse(
    (res) => res.url().includes("/api/ai/lens") && res.request().method() === "POST"
  );
  await page.getByTestId("lens-btn-high_yield_revision").click();
  await memReq;
  await waitForCard();
  const memoryTab = page.getByRole("button", { name: "Memory Aid" });
  if (await memoryTab.count()) await memoryTab.click();
  const memory = (await page.getByTestId("memory-aid").count())
    ? await page.getByTestId("memory-aid").innerText()
    : await page.getByTestId("ai-lens-response-card").innerText();
  const shot8 = await shot("08-memory-aid");
  record(
    "8",
    memory.length > 20 && !/Vata|Pitta|Kapha|Ayurveda|Dosha/i.test(memory) ? "PASS" : "FAIL",
    `switched=${switched} memory=${memory.slice(0, 160)} ${shot8}`
  );

  await page.getByTestId("back-to-reading").click();
  await selectPageText();
  const quizReq = page.waitForResponse(
    (res) => res.url().includes("/api/ai/lens") && res.request().method() === "POST"
  );
  await page.getByTestId("lens-btn-test_me").click();
  await quizReq;
  await waitForCard();
  const quiz = await page.getByTestId("test-me-quiz").count();
  const options = await page.locator('[data-testid="test-me-quiz"] button').count();
  if (options > 0) await page.locator('[data-testid="test-me-quiz"] button').first().click();
  const shot9 = await shot("09-quiz");
  record("9", quiz > 0 && options >= 4 ? "PASS" : "FAIL", `quiz=${quiz} options=${options} ${shot9}`);

  const pageBeforeSave = await page.locator("text=/\\d+ \\/ \\d+/").first().innerText();
  await page.getByTestId("back-to-reading").click();
  await selectPageText();
  const saveReq = page.waitForResponse(
    (res) =>
      (res.url().includes("/api/ai/lens") || res.url().includes("/api/notes")) &&
      res.request().method() === "POST"
  );
  await page.getByTestId("lens-btn-save_passage").click();
  const saveRes = await saveReq;
  await page.waitForTimeout(800);
  const saveStatus = await page.locator("text=/Saved to My Notebook|Saved on this device|Sign in/i").first().innerText().catch(() => "");
  await page.goto("http://127.0.0.1:3000/notes", { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  const notesText = await page.locator("body").innerText();
  const notesPass = /p\.|Campaign|Newton|landing page|Saved|Notebook/i.test(notesText) &&
    !/Sign in to keep your notes/i.test(notesText);
  const shot10 = await shot("10-notes");
  record(
    "10",
    notesPass ? "PASS" : saveStatus.includes("Saved on this device") ? "BLOCKED" : "FAIL",
    `saveHttp=${saveRes.status()} status=${saveStatus} notes=${notesText.slice(0, 220)} ${shot10}`
  );

  await page.goto("http://127.0.0.1:3000/reader", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await selectPageText();
  await page.getByTestId("lens-btn-explain").click();
  await waitForCard();
  const pageWhileOpen = await page.locator("text=/\\d+ \\/ \\d+/").first().innerText();
  await page.getByTestId("back-to-reading").click();
  await page.waitForTimeout(400);
  const pageAfterClose = await page.locator("text=/\\d+ \\/ \\d+/").first().innerText();
  const workspaceGone = (await page.getByTestId("study-result-workspace").count()) === 0;
  const shot11 = await shot("11-close-drawer");
  record(
    "11",
    pageWhileOpen === pageAfterClose && workspaceGone ? "PASS" : "FAIL",
    `open=${pageWhileOpen} close=${pageAfterClose} gone=${workspaceGone} beforeSave=${pageBeforeSave} ${shot11}`
  );

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(500);
  const tabletCanvas = await page.locator("canvas").first().boundingBox();
  const shot12a = await shot("12-tablet");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const mobileCanvas = await page.locator("canvas").first().boundingBox();
  const mobileToolbar = await page.getByRole("button", { name: "Next Page" }).count();
  const shot12b = await shot("12-mobile");
  record(
    "12",
    Boolean(tabletCanvas && mobileCanvas && mobileToolbar && tabletCanvas.width > 200 && mobileCanvas.width > 160)
      ? "PASS"
      : "FAIL",
    `tablet=${JSON.stringify(tabletCanvas)} mobile=${JSON.stringify(mobileCanvas)} ${shot12a} ${shot12b}`
  );
} catch (error) {
  record("script", "FAIL", error instanceof Error ? error.message : String(error));
  await shot("script-error").catch(() => {});
} finally {
  writeFileSync(join(outDir, "pdf-first-results.json"), JSON.stringify({ results, consoleErrors }, null, 2));
  console.log(JSON.stringify({ results, consoleErrors: consoleErrors.slice(0, 8) }, null, 2));
  await browser.close();
}
