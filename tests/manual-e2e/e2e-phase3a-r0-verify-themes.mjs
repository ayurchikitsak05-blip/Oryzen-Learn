/**
 * Fresh-session item 8 only: all 7 themes at 1440 and 390.
 * Reuses :3000. No deploy / merge / paid APIs.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const outDir = join(process.cwd(), "tmp-e2e-artifacts", "phase3a-r0-verify");
mkdirSync(outDir, { recursive: true });

const owner = {
  email: "oryzen.owner.demo@example.com",
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
};

const THEMES = [
  { id: "classic", hex: "#faf8f5" },
  { id: "warm-grounded", hex: "#f7f1e8" },
  { id: "cool-clear", hex: "#f3f6f8" },
  { id: "fresh-energizing", hex: "#fbf6f0" },
  { id: "grounded-clarity", hex: "#f7f1e8" },
  { id: "clear-energy", hex: "#f3f6f8" },
  { id: "warm-lift", hex: "#f7f1e8" },
];

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
    await page.waitForURL(/\/(hub|reader|roadmap|notes)/, { timeout: 20000 }).catch(() => {});
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
  await page.request.post(`${BASE}/api/auth/owner-demo-local`);
  await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
  return { mode: "local-fallback" };
}

async function openRhythm(page) {
  await page.locator("[data-testid=study-rhythm-open]").first().waitFor({ timeout: 15000 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event("oryzen-open-rhythm"));
  });
  const sheet = page.locator("[data-testid=study-rhythm-sheet]");
  try {
    await sheet.waitFor({ state: "attached", timeout: 2500 });
  } catch {
    await page.getByTestId("study-rhythm-open").first().click({ force: true });
    await sheet.waitFor({ state: "attached", timeout: 8000 });
  }
}

async function closeRhythm(page) {
  await page.evaluate(() => window.dispatchEvent(new Event("oryzen-close-rhythm")));
  await page.locator("[data-testid=study-rhythm-sheet]").waitFor({ state: "detached", timeout: 8000 });
}

async function pickTheme(page, id) {
  await page.locator(`[data-testid=study-rhythm-theme-${id}]`).waitFor({ state: "attached", timeout: 8000 });
  await page.evaluate((themeId) => {
    document.querySelector(`[data-testid=study-rhythm-theme-${themeId}]`)?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
    );
  }, id);
}

async function themeId(page) {
  return page.evaluate(() => document.documentElement.getAttribute("data-theme"));
}

async function cssBg(page) {
  return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
}

async function contrastPairs(page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const hex = (name) => style.getPropertyValue(name).trim();
    const channel = (value) => {
      const scaled = value / 255;
      return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    };
    const lum = (rawHex) => {
      const raw = rawHex.replace("#", "").trim();
      const full = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw;
      const n = Number.parseInt(full, 16);
      return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
    };
    const ratio = (fg, bg) => {
      const a = lum(fg);
      const b = lum(bg);
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return (hi + 0.05) / (lo + 0.05);
    };
    return [
      ["heading/bg", hex("--heading"), hex("--bg"), 4.5],
      ["body/card", hex("--body"), hex("--card"), 4.5],
      ["muted/bg", hex("--text-secondary"), hex("--bg"), 4.5],
    ].map(([id, fg, bg, minimum]) => {
      const value = ratio(fg, bg);
      return { id, fg, bg, value, minimum, ok: value + 0.01 >= minimum };
    });
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const shots = [];
const failures = [];
let evidence = "";

try {
  const auth = await signInOwner(page);
  await page.evaluate(() => {
    localStorage.removeItem("oryzen_study_rhythm_v1");
    document.documentElement.setAttribute("data-theme", "classic");
  });
  await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
  await skipPricing(page);
  await page.waitForFunction(() => typeof window.__oryzenSetRhythmOpen === "function", null, {
    timeout: 15000,
  });

  await openRhythm(page);
  const listed = await page.locator("[data-testid^=study-rhythm-theme-]").evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-testid")?.replace("study-rhythm-theme-", ""))
  );
  await pickTheme(page, "classic");
  await page.getByRole("radio", { name: /Courage & Calm/i }).click();
  await closeRhythm(page);

  await openRhythm(page);
  await pickTheme(page, "cool-clear");
  const afterTheme = await page.evaluate(() => JSON.parse(localStorage.getItem("oryzen_study_rhythm_v1") || "{}"));
  await page.getByRole("radio", { name: /Challenge & Mastery/i }).click();
  const afterCoach = await page.evaluate(() => JSON.parse(localStorage.getItem("oryzen_study_rhythm_v1") || "{}"));
  await closeRhythm(page);
  const independent =
    afterTheme.themeId === "cool-clear" &&
    afterTheme.coachStyle === "calm" &&
    afterCoach.themeId === "cool-clear" &&
    afterCoach.coachStyle === "mastery";
  if (!independent) {
    failures.push(
      `theme/coach coupled theme=${afterTheme.themeId}/${afterTheme.coachStyle} then ${afterCoach.themeId}/${afterCoach.coachStyle}`
    );
  }

  for (const theme of THEMES) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRhythm(page);
    await pickTheme(page, theme.id);
    await closeRhythm(page);
    const applied = await themeId(page);
    const bg = (await cssBg(page)).toLowerCase();
    const contrast = await contrastPairs(page);
    if (applied !== theme.id || bg !== theme.hex) failures.push(`${theme.id} 1440 applied=${applied} bg=${bg}`);
    if (!contrast.every((row) => row.ok)) failures.push(`${theme.id} contrast ${JSON.stringify(contrast.filter((row) => !row.ok))}`);
    shots.push(await shot(page, `08-${theme.id}-1440`));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
    const mobileTheme = await themeId(page);
    const mobileContrast = await contrastPairs(page);
    if (mobileTheme !== theme.id) failures.push(`${theme.id} 390 applied=${mobileTheme}`);
    if (!mobileContrast.every((row) => row.ok)) failures.push(`${theme.id} 390 contrast`);
    shots.push(await shot(page, `08-${theme.id}-390`));
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await openRhythm(page);
  await pickTheme(page, "warm-lift");
  await closeRhythm(page);
  await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
  await skipPricing(page);
  const chromeTheme = await themeId(page);
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("oryzen_study_rhythm_v1") || "{}"));
  shots.push(await shot(page, "08-reader-parchment-warm-lift"));
  const parchment = prefs.pdfPaperOptIn !== true && chromeTheme === "warm-lift";
  const missing = THEMES.map((theme) => theme.id).filter((id) => !listed.includes(id));
  if (missing.length) failures.push(`picker missing ${missing.join(",")}`);
  if (!parchment) failures.push(`parchment lock failed chrome=${chromeTheme} optIn=${prefs.pdfPaperOptIn}`);

  evidence = `auth=${auth.mode} listed=${listed.join(",")} independent=${independent} parchmentOptIn=${prefs.pdfPaperOptIn} chrome=${chromeTheme} failures=${failures.join(" | ") || "none"}`;
  console.log(failures.length ? "ITEM 8 FAIL" : "ITEM 8 PASS", evidence);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  evidence = failures.join(" | ");
  shots.push(await shot(page, "08-error").catch(() => ""));
  console.log("ITEM 8 FAIL", evidence);
} finally {
  const resultsPath = join(outDir, "results.json");
  const current = JSON.parse(readFileSync(resultsPath, "utf8"));
  const next = {
    persistFacts: current.persistFacts,
    reports: current.reports.map((row) =>
      row.id === 8
        ? {
            id: 8,
            title: "All visual themes + mixed profiles at 1440 and 390; contrast; PDF parchment",
            status: failures.length === 0 ? "PASS" : "FAIL",
            evidence,
            shots,
          }
        : row
    ),
  };
  writeFileSync(resultsPath, JSON.stringify(next, null, 2));
  await browser.close();
}

if (failures.length) process.exitCode = 1;
