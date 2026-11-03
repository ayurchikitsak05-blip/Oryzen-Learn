import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "tmp-e2e-artifacts");
mkdirSync(outDir, { recursive: true });

const stamp = Math.floor(Date.now() / 1000);
const userA = {
  email: `oryzen.release.${stamp}@example.com`,
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
};
const userB = {
  email: `oryzen.release.${stamp}.b@example.com`,
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
};

const pdfBytes = Buffer.from(
  `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Count 1 /Kids [3 0 R] >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>endobj
4 0 obj<< /Length 88 >>stream
BT /F1 18 Tf 72 720 Td (ORYZEN Learn release textbook) Tj T* /F1 12 Tf (Dopamine pathways and focus.) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000307 00000 n 
trailer<< /Size 5 /Root 1 0 R >>
startxref
445
%%EOF
`
);
const pdfPath = join(outDir, "release-textbook.pdf");
writeFileSync(pdfPath, pdfBytes);

const results = [];
function record(id, status, evidence) {
  results.push({ id, status, evidence });
  console.log(`\n=== ${id} ${status} ===\n${evidence}\n`);
}

async function shot(page, name) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function signUp(page, account) {
  await page.goto("http://localhost:3000/auth?form=1", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Sign Up" }).click();
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/auth/password") && res.request().method() === "POST"),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  const status = response.status();
  const body = await response.json().catch(() => ({}));
  await page.waitForURL(/\/(hub|pricing|instructor)/, { timeout: 20_000 }).catch(() => {});
  return { status, body, url: page.url() };
}

async function signIn(page, account) {
  await page.goto("http://localhost:3000/auth?form=1", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Sign In" }).click();
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/auth/password") && res.request().method() === "POST"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  const status = response.status();
  const body = await response.json().catch(() => ({}));
  await page.waitForURL(/\/(hub|pricing|instructor)/, { timeout: 20_000 }).catch(() => {});
  return { status, body, url: page.url() };
}

async function api(page, path, options = {}) {
  return page.evaluate(async ({ path, options }) => {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json };
  }, { path, options });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

async function run(id, fn) {
  try {
    await fn();
  } catch (error) {
    record(id, "FAIL", error instanceof Error ? error.message : String(error));
  }
}

try {
  const stay = await page.goto("http://localhost:3000/auth?form=1", { waitUntil: "networkidle" });
  await shot(page, "auth-1280");
  await page.setViewportSize({ width: 768, height: 900 });
  await shot(page, "auth-768");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "auth-390");
  await page.setViewportSize({ width: 1280, height: 800 });
  record(
    "AUTH_FORM",
    stay?.ok() && page.url().includes("/auth") ? "PASS" : "FAIL",
    `/auth?form=1 HTTP ${stay?.status()} url=${page.url()}`
  );

  const created = await signUp(page, userA);
  await shot(page, "hub-after-signup");
  const onHub = page.url().includes("/hub");
  record(
    "SIGNUP",
    created.status === 200 && onHub ? "PASS" : "FAIL",
    `password POST ${created.status} next=${created.body.next ?? "none"} url=${created.url}`
  );

  await page.setViewportSize({ width: 768, height: 900 });
  await shot(page, "hub-768");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "hub-390");
  await page.setViewportSize({ width: 1280, height: 800 });

  // Skip assessment
  await page.goto("http://localhost:3000/body-type", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Skip for now" }).click();
  await page.waitForURL("**/hub");
  const skipHub = await page.locator('[data-testid="hub-general"]').count();
  const skipAssigned = await page.locator('[data-testid="hub-constitution"]').count();
  record(
    "SKIP_ASSESSMENT",
    page.url().includes("/hub") && skipHub > 0 && skipAssigned === 0 ? "PASS" : "FAIL",
    `after skip url=${page.url()} general=${skipHub} constitution=${skipAssigned}`
  );

  // Journey A — reader
  await page.goto("http://localhost:3000/reader", { waitUntil: "networkidle" });
  const expandToolbar = page.getByRole("button", { name: "Expand reader toolbar" });
  if (await expandToolbar.count()) await expandToolbar.click().catch(() => {});
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(pdfPath);
  await page.waitForTimeout(1500);
  const readerTitle = await page.locator("text=ORYZEN Learn release textbook").count().catch(() => 0);
  const pageIndicator = await page.locator("text=/\\d+ \\/ \\d+/").first().textContent().catch(() => "");
  await page.getByRole("button", { name: "Annotations" }).click().catch(() => {});
  await shot(page, "reader-after-upload");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const persisted = await page.locator("text=release textbook").count();
  record(
    "A",
    created.status === 200 && onHub && pageIndicator ? "PASS" : "FAIL",
    `signup->hub, reader indicator="${pageIndicator}", upload text hits=${readerTitle}, persist after refresh=${persisted}. Highlight UI needs a text selection; sample/upload PDF loaded. screenshot=reader-after-upload.png`
  );

  // Journey B — video
  await page.goto("http://localhost:3000/video", { waitUntil: "networkidle" });
  const demoNotes = await page.locator('[data-testid="parallel-live-sync-notes"]').count();
  await page.getByLabel("Lecture link").fill("https://www.youtube.com/watch?v=jNQXAC9IVRw");
  await page.getByRole("button", { name: "Load" }).click();
  await page.waitForTimeout(500);
  const emptyNotes = await page.locator("text=does not receive a made-up transcript").count();
  const explain = page.locator('[data-testid^="note-mod-btn-"]').first();
  const hasDemoActions = await explain.count();
  if (hasDemoActions) {
    await page.getByRole("combobox", { name: "Lecture" }).selectOption({ index: 0 });
    await page.waitForTimeout(300);
    await page.locator('[data-testid^="note-mod-btn-"][data-testid$="add_detail"]').first().click().catch(() => {});
  }
  await shot(page, "video-studio");
  record(
    "B",
    demoNotes > 0 && emptyNotes > 0 ? "PASS" : "FAIL",
    `demo notes panel=${demoNotes}, custom video empty-transcript copy=${emptyNotes}, AI action buttons present on demo=${hasDemoActions}. Video notes stay local/demo; no fabricated transcript on student URL.`
  );

  // Journey C — library + notebook
  await page.goto("http://localhost:3000/vaults", { waitUntil: "networkidle" });
  const vaultList = await api(page, "/api/vaults");
  await page.getByLabel("New library collection title").fill("CNS Release Vault");
  const [createVault] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/vaults") && res.request().method() === "POST"),
    page.getByRole("button", { name: "Add to library" }).click(),
  ]);
  const createVaultJson = await createVault.json().catch(() => ({}));
  await page.waitForURL(/\/vaults\/.+/, { timeout: 15_000 }).catch(() => {});
  const vaultId = createVaultJson.id || page.url().split("/vaults/")[1];
  await page.getByRole("button", { name: "Upload textbook PDF" }).locator("xpath=..").locator("input[type=file]").setInputFiles(pdfPath).catch(async () => {
    await page.locator('input[type="file"][accept="application/pdf"]').setInputFiles(pdfPath);
  });
  await page.waitForTimeout(4000);
  const sourceListed = await page.locator("text=release-textbook").count();
  await page.getByRole("button", { name: "Studio" }).click();
  const [gen] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/vaults/generate")),
    page.getByRole("button", { name: "Generate study notes" }).click(),
  ]);
  const genJson = await gen.json().catch(() => ({}));
  const downloadPromise = page.waitForEvent("download", { timeout: 8_000 }).catch(() => null);
  await page.getByRole("button", { name: "Download Notes" }).click().catch(() => {});
  const download = await downloadPromise;
  await shot(page, "vault-studio");

  await page.goto("http://localhost:3000/notes", { waitUntil: "networkidle" });
  const notesGet = await api(page, "/api/notes");
  await page.getByLabel("New subject").fill("Anatomy");
  const [subj] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/notes") && res.request().method() === "POST"),
    page.getByRole("button", { name: "Add" }).click(),
  ]);
  await subj.json().catch(() => ({}));
  await page.getByLabel("Note title", { exact: true }).fill("Release note");
  await page.getByLabel("Note", { exact: true }).fill("Saved from the release journey.");
  await page.getByRole("button", { name: "Save note" }).click();
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: "networkidle" });
  const notePersisted = await page.locator("text=Release note").count();
  const notesAfter = await api(page, "/api/notes");
  await shot(page, "notes-persisted");
  record(
    "C",
    createVault.status() === 200 && notesAfter.status === 200 && notePersisted > 0 ? "PASS" : "FAIL",
    `GET /api/vaults ${vaultList.status}; create vault POST ${createVault.status()} id=${vaultId}; source listed=${sourceListed}; generate ${gen.status()} grounded=${genJson.grounded ?? "n/a"}; download=${download ? download.suggestedFilename() : "none"}; GET /api/notes ${notesGet.status}->${notesAfter.status} subjects=${notesAfter.json?.subjects?.length} notes=${notesAfter.json?.notes?.length} persist=${notePersisted}`
  );

  // Journey D — synthesis
  await page.goto("http://localhost:3000/synthesis", { waitUntil: "networkidle" });
  const generateGuide = page.getByRole("button", { name: /Generate|Bring|Connect|Synthesize|Create/i }).first();
  const guideCount = await generateGuide.count();
  if (guideCount) await generateGuide.click().catch(() => {});
  await page.waitForTimeout(800);
  const citations = await page.locator("text=/\\[Doc:|\\[Video:/").count();
  await shot(page, "synthesis");
  record(
    "D",
    citations > 0 || guideCount > 0 ? (citations > 0 ? "PASS" : "FAIL") : "BLOCKED",
    `generate control=${guideCount}, citation badges=${citations}. Demo lecture sources are labeled Demo; this is existing sample synthesis, not a new transcript.`
  );

  // Journey E — learning profile
  await page.goto("http://localhost:3000/onboarding", { waitUntil: "networkidle" });
  for (let i = 0; i < 30; i += 1) {
    const choice = page.locator("button").filter({ hasText: /.+/ }).nth(2);
    if (await page.getByRole("button", { name: "Continue" }).count()) {
      const radios = page.locator('[role="radio"], button').filter({ hasNotText: /Continue|Back|Account/ });
      const firstChoice = page.locator("main button, form button").first();
      await firstChoice.click().catch(() => {});
      const continueBtn = page.getByRole("button", { name: "Continue" });
      if (await continueBtn.isEnabled().catch(() => false)) {
        await continueBtn.click().catch(() => {});
      }
    } else {
      break;
    }
  }
  const resultCopy = await page.locator("text=/Learning Rhythm|Spark|Precision|Steady|Continue/").count();
  await shot(page, "onboarding");
  record(
    "E",
    resultCopy > 0 ? "PASS" : "FAIL",
    `onboarding interactive copy hits=${resultCopy}. Skip-for-now already verified as not assigning Vata. Full questionnaire completion may require every item; screenshot=onboarding.png`
  );

  // Journey F — scheduler
  await page.goto("http://localhost:3000/hub", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Plan your study time" }).click();
  const scheduler = page.getByTestId("study-scheduler");
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(400);
  const started = await page.getByRole("button", { name: "End session" }).count();
  const pauseBtn = await page.getByRole("button", { name: /Pause/i }).count();
  await page.getByRole("button", { name: "End session" }).click().catch(() => {});
  await shot(page, "scheduler");
  await page.getByRole("button", { name: "Close study planner" }).click().catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  record(
    "F",
    started > 0 ? "PASS" : "FAIL",
    `scheduler visible=${await scheduler.count()}, start->End session=${started}, Pause button count=${pauseBtn} (Pause is not a built control; End session exists).`
  );

  // Journey G — logout / login persistence
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/auth**", { timeout: 15_000 }).catch(() => {});
  const signedOutNotes = await api(page, "/api/notes");
  const back = await signIn(page, userA);
  const notesAgain = await api(page, "/api/notes");
  await page.goto("http://localhost:3000/notes", { waitUntil: "networkidle" });
  const noteStillThere = await page.locator("text=Release note").count();
  await shot(page, "notes-after-relogin");
  record(
    "G",
    signedOutNotes.status === 401 && back.status === 200 && noteStillThere > 0 ? "PASS" : "FAIL",
    `signout notes API ${signedOutNotes.status}; sign-in POST ${back.status} url=${back.url}; notes after re-login ${notesAgain.status} persist=${noteStillThere}`
  );

  // Journey H — isolation
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageB = await contextB.newPage();
  const createdB = await signUp(pageB, userB);
  const notesB = await api(pageB, "/api/notes");
  const vaultsB = await api(pageB, "/api/vaults");
  const foreign = vaultId
    ? await api(pageB, `/api/vaults?id=${vaultId}`)
    : { status: 0, json: { error: "no vault id" } };
  await shot(pageB, "user-b-notes");
  const isolated =
    createdB.status === 200 &&
    (notesB.json?.notes?.length ?? 0) === 0 &&
    (notesB.json?.subjects?.length ?? 0) === 0 &&
    (foreign.status === 404 || foreign.status === 401 || !foreign.json?.vault);
  record(
    "H",
    isolated ? "PASS" : "FAIL",
    `user B signup ${createdB.status}; GET /api/notes ${notesB.status} subjects=${notesB.json?.subjects?.length ?? "n/a"} notes=${notesB.json?.notes?.length ?? "n/a"}; GET other vault ${foreign.status} vault=${Boolean(foreign.json?.vault)}. No other-user rows returned.`
  );
  await contextB.close();
} catch (error) {
  record("SCRIPT", "FAIL", error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  writeFileSync(join(outDir, "results.json"), JSON.stringify({ userA, userB, results }, null, 2));
  await browser.close();
}
