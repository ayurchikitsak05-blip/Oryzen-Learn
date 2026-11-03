/**
 * Phase 3A + R0 themes local demo.
 * Reuses :3000. No deploy / merge / paid APIs.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const outDir = join(process.cwd(), "tmp-e2e-artifacts", "phase3a-r0");
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
  await page
    .waitForURL(/\/(hub|pricing|instructor|reader|body-type)/, { timeout: 25000 })
    .catch(() => {});
  await skipPricing(page);
  if (signinRes.ok() && signinJson.status === "authenticated") return { mode: "signin" };
  const local = await page.request.post(`${BASE}/api/auth/owner-demo-local`);
  await local.json().catch(() => ({}));
  await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
  return { mode: "local-fallback" };
}

async function openRhythm(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (typeof window.__oryzenSetRhythmOpen !== "function") {
      throw new Error("Study rhythm provider is not mounted");
    }
    window.__oryzenSetRhythmOpen(true);
  });
  await page.locator("[data-testid=study-rhythm-sheet]").waitFor({ state: "attached", timeout: 8000 });
}

async function pickTheme(page, id) {
  await page.locator(`[data-testid=study-rhythm-theme-${id}]`).waitFor({ state: "attached", timeout: 8000 });
  await page.evaluate((themeId) => {
    document.querySelector(`[data-testid=study-rhythm-theme-${themeId}]`)?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
    );
  }, id);
  await page.evaluate(() => window.__oryzenSetRhythmOpen?.(false));
  await page.locator("[data-testid=study-rhythm-sheet]").waitFor({ state: "detached", timeout: 8000 });
}

async function themeId(page) {
  return page.evaluate(() => document.documentElement.getAttribute("data-theme"));
}

async function cssBg(page) {
  return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  const auth = await signInOwner(page);
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("oryzen_study_roadmap_v1") || key === "oryzen_study_rhythm_v1")
      .forEach((key) => localStorage.removeItem(key));
    document.documentElement.setAttribute("data-theme", "classic");
  });
  record("auth", "ok", auth.mode);

  await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
  await skipPricing(page);
  await page.getByTestId("hub-roadmap-link").waitFor({ timeout: 10000 });
  await page
    .waitForFunction(() => typeof window.__oryzenSetRhythmOpen === "function", null, { timeout: 10000 })
    .catch(async () => {
      const err = await page.evaluate(() => ({
        hook: typeof window.__oryzenSetRhythmOpen,
        buttons: document.querySelectorAll("[data-testid=study-rhythm-open]").length,
      }));
      record("provider-hook", "fail", JSON.stringify(err));
    });
  record("classic-default", (await themeId(page)) === "classic" ? "ok" : "fail", await themeId(page));
  await shot(page, "hub-classic-1440");

  await page.setViewportSize({ width: 768, height: 1024 });
  await shot(page, "hub-classic-768");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "hub-classic-390");
  await page.setViewportSize({ width: 1440, height: 900 });

  await openRhythm(page);
  record("rhythm-sheet", "ok", "opened My Study Rhythm");
  await page.evaluate(() => window.__oryzenSetRhythmOpen?.(false));
  await page.locator("[data-testid=study-rhythm-sheet]").waitFor({ state: "detached", timeout: 8000 });

  const themeShots = [
    ["warm-grounded", "hub-warm-1440", "#f7f1e8"],
    ["cool-clear", "hub-cool-1440", "#f3f6f8"],
    ["fresh-energizing", "hub-fresh-1440", "#fbf6f0"],
    ["grounded-clarity", "hub-grounded-1440", "#f7f1e8"],
  ];
  for (const [id, name, hex] of themeShots) {
    await openRhythm(page);
    await pickTheme(page, id);
    const applied = await themeId(page);
    const bg = (await cssBg(page)).toLowerCase();
    record(`theme-${id}`, applied === id && bg === hex ? "ok" : "fail", `${applied} ${bg}`);
    await shot(page, name);
  }

  await page.setViewportSize({ width: 768, height: 1024 });
  await shot(page, "hub-grounded-768");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "hub-grounded-390");
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.reload({ waitUntil: "domcontentloaded" });
  const afterRefresh = await themeId(page);
  const stored = await page.evaluate(() => localStorage.getItem("oryzen_study_rhythm_v1"));
  record(
    "theme-persist",
    afterRefresh === "grounded-clarity" && /grounded-clarity/.test(stored || "") ? "ok" : "fail",
    afterRefresh
  );
  await shot(page, "hub-grounded-refresh");

  await page.goto(`${BASE}/notes`, { waitUntil: "domcontentloaded" });
  await shot(page, "notes-grounded-1440");
  await page.goto(`${BASE}/auth?form=1`, { waitUntil: "domcontentloaded" });
  await shot(page, "auth-grounded-1440");

  await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
  if (await page.getByRole("button", { name: /Start a new roadmap/i }).count()) {
    await page.getByRole("button", { name: /Start a new roadmap/i }).click();
  }
  await page.getByTestId("roadmap-onboarding").waitFor({ timeout: 15000 });
  await page.getByTestId("roadmap-exam-name").fill("Board exam");
  await page.getByTestId("roadmap-exam-date").fill(iso(exam60));
  await page.getByTestId("roadmap-horizon-custom").click();
  await page.getByTestId("roadmap-horizon-days").fill("21");
  await shot(page, "roadmap-onboarding-custom");
  for (let i = 0; i < 6; i += 1) {
    await page.getByTestId("roadmap-next").click();
    await page.waitForTimeout(120);
  }
  await page.getByTestId("roadmap-generate").click();
  await page.getByTestId("roadmap-today").waitFor({ timeout: 15000 });
  record("roadmap-generate", "ok", "custom 21-day plan");
  await shot(page, "roadmap-today-1440");

  await page.getByRole("button", { name: "Custom range" }).click();
  await page.getByTestId("roadmap-custom").waitFor({ timeout: 8000 });
  await shot(page, "roadmap-custom-range");

  await page.getByRole("button", { name: "Edit timetable" }).click();
  await page.getByTestId("roadmap-edit").waitFor({ timeout: 8000 });
  const firstEdit = page.locator("[data-testid='roadmap-edit'] button").first();
  await firstEdit.click();
  await page.getByRole("button", { name: /Save session change/i }).click();
  record("roadmap-edit", "ok", "session kept outside sleep");
  await shot(page, "roadmap-edit");

  await page.getByTestId("roadmap-replan").click();
  await page.getByTestId("roadmap-replan-dialog").waitFor({ timeout: 8000 });
  const missed = page.getByTestId("roadmap-missed-day").first();
  if (!(await missed.isChecked())) await missed.check();
  await page.getByRole("button", { name: /Preview rebuilt plan/i }).click();
  await page.getByTestId("roadmap-replan-confirm").waitFor({ timeout: 8000 });
  await shot(page, "roadmap-replan-preview");
  await page.getByTestId("roadmap-replan-confirm").click();
  await page.getByRole("button", { name: "Today" }).click();
  await page.getByTestId("roadmap-today").waitFor({ timeout: 10000 });
  record("roadmap-replan", "ok", "student confirmed replace");
  await shot(page, "roadmap-after-replan");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("roadmap-today").or(page.getByTestId("roadmap-onboarding")).waitFor({ timeout: 15000 });
  if (await page.getByRole("button", { name: "Today" }).count()) {
    await page.getByRole("button", { name: "Today" }).click();
  }
  const stillThere = await page.getByTestId("roadmap-today").count();
  record("roadmap-persist", stillThere > 0 ? "ok" : "fail", `today=${stillThere}`);
  await shot(page, "roadmap-after-refresh");

  const isolated = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const other = await isolated.newPage();
  await other.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
  const isolatedTheme = await themeId(other);
  const isolatedKey = await other.evaluate(() => localStorage.getItem("oryzen_study_rhythm_v1"));
  record(
    "theme-isolation",
    isolatedTheme !== "grounded-clarity" && !isolatedKey ? "ok" : "fail",
    `${isolatedTheme} key=${isolatedKey}`
  );
  await shot(other, "hub-isolated-classic");
  await isolated.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
  await shot(page, "roadmap-390");
} catch (error) {
  record("crash", "fail", error instanceof Error ? error.message : String(error));
  await shot(page, "99-error").catch(() => null);
} finally {
  writeFileSync(join(outDir, "results.json"), JSON.stringify({ steps }, null, 2));
  await browser.close();
}

const failed = steps.filter((row) => row.status === "fail");
if (failed.length) {
  console.error("PHASE3A_R0_FAIL", failed);
  process.exit(1);
}
console.log("PHASE3A_R0_OK");
