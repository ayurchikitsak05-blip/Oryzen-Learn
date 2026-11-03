import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const preview = process.env.ORYZEN_PREVIEW_URL;
if (!preview) {
  console.error("ORYZEN_PREVIEW_URL missing");
  process.exit(1);
}
const token = process.env.VERCEL_OIDC_TOKEN;
const headers = token ? { "x-vercel-trusted-oidc-idp-token": token } : {};

const outDir = join(dirname(fileURLToPath(import.meta.url)), "tmp-e2e-artifacts");
mkdirSync(outDir, { recursive: true });
const stamp = Math.floor(Date.now() / 1000);
const userA = { email: `oryzen.release.${stamp}.p@example.com`, password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "" };
const userB = { email: `oryzen.release.${stamp}.pb@example.com`, password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "" };
const results = [];
const record = (id, status, evidence) => {
  results.push({ id, status, evidence });
  console.log(`\n=== PREVIEW ${id} ${status} ===\n${evidence}\n`);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  extraHTTPHeaders: headers,
});
const page = await context.newPage();

async function signUp(target, account) {
  await target.goto(`${preview}/auth?form=1`, { waitUntil: "networkidle" });
  await target.getByRole("tab", { name: "Sign Up" }).click();
  await target.getByLabel("Email").fill(account.email);
  await target.getByLabel("Password").fill(account.password);
  const [response] = await Promise.all([
    target.waitForResponse((res) => res.url().includes("/api/auth/password") && res.request().method() === "POST"),
    target.getByRole("button", { name: "Create account" }).click(),
  ]);
  await target.waitForURL(/\/(hub|pricing|instructor)/, { timeout: 25_000 }).catch(() => {});
  return { status: response.status(), json: await response.json().catch(() => ({})), url: target.url() };
}

async function api(target, path) {
  return target.evaluate(async (path) => {
    const res = await fetch(path, { credentials: "same-origin" });
    return { status: res.status, json: await res.json().catch(() => null) };
  }, path);
}

try {
  const auth = await page.goto(`${preview}/auth?form=1`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(outDir, "preview-auth-1280.png"), fullPage: true });
  await page.setViewportSize({ width: 768, height: 900 });
  await page.screenshot({ path: join(outDir, "preview-auth-768.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(outDir, "preview-auth-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  record("AUTH", auth?.ok() && page.url().includes("/auth") ? "PASS" : "FAIL", `HTTP ${auth?.status()} url=${page.url()} title=${await page.title()}`);

  const created = await signUp(page, userA);
  await page.screenshot({ path: join(outDir, "preview-hub.png"), fullPage: true });
  record("A", created.status === 200 && created.url.includes("/hub") ? "PASS" : "FAIL", `password ${created.status} next=${created.json.next} url=${created.url}`);

  await page.goto(`${preview}/notes`, { waitUntil: "networkidle" });
  const notesBefore = await api(page, "/api/notes");
  await page.getByLabel("New subject").fill("Preview Anatomy");
  await page.getByRole("button", { name: "Add" }).click();
  await page.waitForTimeout(800);
  await page.getByLabel("Note title", { exact: true }).fill("Preview note");
  await page.getByLabel("Note", { exact: true }).fill("Preview persistence.");
  await page.getByRole("button", { name: "Save note" }).click();
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: "networkidle" });
  const persist = await page.locator("text=Preview note").count();
  const notesAfter = await api(page, "/api/notes");
  record("C", notesAfter.status === 200 && persist > 0 ? "PASS" : "FAIL", `GET notes ${notesBefore.status}->${notesAfter.status} persist=${persist} subjects=${notesAfter.json?.subjects?.length} notes=${notesAfter.json?.notes?.length}`);

  await page.goto(`${preview}/vaults`, { waitUntil: "networkidle" });
  const vaults = await api(page, "/api/vaults");
  record("VAULTS", vaults.status === 200 ? "PASS" : "FAIL", `GET /api/vaults ${vaults.status} count=${vaults.json?.vaults?.length ?? "n/a"} error=${vaults.json?.error ?? "none"}`);

  await page.goto(`${preview}/hub`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/auth/, { timeout: 15_000 }).catch(() => {});
  const signedOut = await api(page, "/api/notes");
  record("G", signedOut.status === 401 ? "PASS" : "FAIL", `after sign out GET /api/notes ${signedOut.status} url=${page.url()}`);

  const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: headers });
  const pageB = await contextB.newPage();
  const createdB = await signUp(pageB, userB);
  const notesB = await api(pageB, "/api/notes");
  record("H", createdB.status === 200 && (notesB.json?.notes?.length ?? 0) === 0 ? "PASS" : "FAIL", `user B signup ${createdB.status} notes ${notesB.status} count=${notesB.json?.notes?.length}`);
  await contextB.close();
} catch (error) {
  record("SCRIPT", "FAIL", error instanceof Error ? error.message : String(error));
} finally {
  writeFileSync(join(outDir, "preview-results.json"), JSON.stringify({ preview, userA, userB, results }, null, 2));
  await browser.close();
}
