/**
 * Phase 3A — My Study Roadmap local demo.
 * Reuses :3000. No deploy / merge / paid APIs.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const outDir = join(process.cwd(), "tmp-e2e-artifacts", "phase3a");
mkdirSync(outDir, { recursive: true });

const owner = {
  email: "oryzen.owner.demo@example.com",
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
};

function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const today = new Date();
const exam60 = new Date(today);
exam60.setDate(exam60.getDate() + 60);
const examSoon = new Date(today);
examSoon.setDate(examSoon.getDate() + 1);

const steps = [];
function record(step, status, evidence) {
  steps.push({ step, status, evidence });
  console.log(`STEP ${step} ${status} :: ${String(evidence).slice(0, 400)}`);
}

async function shot(page, name) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function skipPricing(page) {
  if (!page.url().includes("/pricing")) return;
  const free = page.getByRole("button", { name: /Start free/i });
  if (await free.count()) {
    await free.click();
    await page.waitForURL(/\/(hub|reader|roadmap)/, { timeout: 20000 }).catch(() => {});
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
  await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
  return { mode: "local-fallback" };
}

async function clickThroughOnboarding(page) {
  for (let i = 0; i < 6; i += 1) {
    await page.getByTestId("roadmap-next").click();
    await page.waitForTimeout(150);
  }
  await page.getByTestId("roadmap-generate").click();
  await page.getByTestId("roadmap-today").waitFor({ timeout: 15000 });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  const auth = await signInOwner(page);
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("oryzen_study_roadmap_v1"))
      .forEach((key) => localStorage.removeItem(key));
  });
  record("auth", "ok", auth.mode);
  await shot(page, "01-auth-or-hub");

  await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
  await skipPricing(page);
  const primary = await page.locator("header nav[aria-label='Primary']").innerText();
  const hasCoreNav =
    /Learning Space/.test(primary) &&
    /Read/.test(primary) &&
    /Library/.test(primary) &&
    /Notebook/.test(primary) &&
    !/Roadmap/.test(primary);
  record("hub-nav", hasCoreNav ? "ok" : "fail", primary.replace(/\s+/g, " "));
  await page.getByTestId("hub-roadmap-link").waitFor({ timeout: 10000 });
  await shot(page, "02-hub-roadmap-card");
  await page.getByTestId("hub-roadmap-link").click();
  await page.waitForURL(/\/roadmap/, { timeout: 15000 });

  await page.getByTestId("roadmap-onboarding").waitFor({ timeout: 15000 });
  await page.getByTestId("roadmap-exam-date").fill(iso(exam60));
  await shot(page, "03-onboarding-exam");
  await clickThroughOnboarding(page);
  record("onboarding", "ok", "60-day plan generated");
  await shot(page, "04-today");

  const task = page.getByTestId("roadmap-task-complete").first();
  await task.check();
  record("complete-task", (await task.isChecked()) ? "ok" : "fail", "first today task marked");
  await shot(page, "05-task-done");

  await page.getByTestId("roadmap-replan").click();
  await page.getByTestId("roadmap-replan-dialog").waitFor({ timeout: 8000 });
  const missed = page.getByTestId("roadmap-missed-day").first();
  if (!(await missed.isChecked())) await missed.check();
  await page.getByRole("button", { name: /Preview rebuilt plan/i }).click();
  await page.getByTestId("roadmap-replan-confirm").waitFor({ timeout: 8000 });
  await shot(page, "06-replan-preview");
  await page.getByTestId("roadmap-replan-confirm").click();
  await page.getByTestId("roadmap-today").waitFor({ timeout: 10000 });
  record("replan", "ok", "student confirmed replace");
  await shot(page, "07-after-replan");

  await page.getByRole("button", { name: /Start a new roadmap/i }).click();
  await page.getByTestId("roadmap-onboarding").waitFor({ timeout: 10000 });
  await page.getByTestId("roadmap-exam-date").fill(iso(examSoon));
  await page.getByTestId("roadmap-next").click();
  await page.getByTestId("roadmap-next").click();
  await page.getByTestId("roadmap-next").click();
  await page.getByTestId("roadmap-next").click();
  await page.getByTestId("roadmap-daily-hours").fill("1");
  await page.getByTestId("roadmap-next").click();
  await page.getByTestId("roadmap-next").click();
  await page.getByTestId("roadmap-generate").click();
  await page.getByTestId("roadmap-overflow").waitFor({ timeout: 15000 });
  const overflow = await page.getByTestId("roadmap-overflow").innerText();
  record("overflow", /calendar allows/i.test(overflow) ? "ok" : "fail", overflow);
  await shot(page, "08-overflow");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
  await shot(page, "09-hub-mobile");
  await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
  await shot(page, "10-roadmap-mobile");
} catch (error) {
  record("crash", "fail", error instanceof Error ? error.message : String(error));
  await shot(page, "99-error").catch(() => null);
} finally {
  writeFileSync(join(outDir, "results.json"), JSON.stringify({ steps }, null, 2));
  await browser.close();
}

const failed = steps.filter((row) => row.status === "fail");
if (failed.length) {
  console.error("PHASE3A_FAIL", failed);
  process.exit(1);
}
console.log("PHASE3A_OK");
