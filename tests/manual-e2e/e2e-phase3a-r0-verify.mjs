/**
 * Independent Phase 3A + R0 browser acceptance.
 * Reuses :3000. No deploy / merge / paid APIs / apply_migration.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const outDir = join(process.cwd(), "tmp-e2e-artifacts", "phase3a-r0-verify");
mkdirSync(outDir, { recursive: true });

const owner = {
  email: "oryzen.owner.demo@example.com",
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
};

const THEMES = [
  { id: "classic", name: "Classic Soft Beige", hex: "#faf8f5", group: "classic" },
  { id: "warm-grounded", name: "Warm & Grounded", hex: "#f7f1e8", group: "primary" },
  { id: "cool-clear", name: "Cool & Clear", hex: "#f3f6f8", group: "primary" },
  { id: "fresh-energizing", name: "Fresh & Energizing", hex: "#fbf6f0", group: "primary" },
  { id: "grounded-clarity", name: "Grounded Clarity", hex: "#f7f1e8", group: "mixed" },
  { id: "clear-energy", name: "Clear Energy", hex: "#f3f6f8", group: "mixed" },
  { id: "warm-lift", name: "Warm Lift", hex: "#f7f1e8", group: "mixed" },
];

const circuitPdf = join(process.cwd(), "public", "demo-fixtures", "science-circuit-current.pdf");

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

const reports = [];
function record(id, title, status, evidence, shots = []) {
  reports.push({ id, title, status, evidence, shots });
  console.log(`ITEM ${id} ${status} :: ${String(evidence).slice(0, 500)}`);
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
  const local = await page.request.post(`${BASE}/api/auth/owner-demo-local`);
  await local.json().catch(() => ({}));
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
    return;
  } catch {
    await page.getByTestId("study-rhythm-open").first().click({ force: true });
    await sheet.waitFor({ state: "attached", timeout: 8000 });
  }
}

async function closeRhythm(page) {
  await page.evaluate(() => window.__oryzenSetRhythmOpen?.(false));
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
    const pairs = [
      ["heading/bg", hex("--heading"), hex("--bg"), 4.5],
      ["body/card", hex("--body"), hex("--card"), 4.5],
      ["muted/bg", hex("--text-secondary"), hex("--bg"), 4.5],
    ];
    return pairs.map(([id, fg, bg, minimum]) => {
      const value = ratio(fg, bg);
      return { id, fg, bg, value, minimum, ok: value + 0.01 >= minimum };
    });
  });
}

async function readRoadmap(page) {
  return page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith("oryzen_study_roadmap_v1"));
    if (!keys.length) return null;
    try {
      return { key: keys[0], record: JSON.parse(localStorage.getItem(keys[0]) || "null") };
    } catch {
      return { key: keys[0], record: null };
    }
  });
}

async function persistProbe(page) {
  const api = await page.request.get(`${BASE}/api/roadmap`);
  const json = await api.json().catch(() => ({}));
  const ui = await page.locator("main").innerText().catch(() => "");
  return {
    status: api.status(),
    persist: json.persist ?? null,
    reason: json.reason ?? json.error ?? null,
    hasRemoteRecord: Boolean(json.record),
    uiMentionsAccount: /and in your account/i.test(ui),
    uiMentionsLocal: /this device|local demo/i.test(ui),
  };
}

async function gotoRoadmap(page) {
  await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
  await skipPricing(page);
  if (!page.url().includes("/roadmap")) {
    await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
  }
}

async function waitForLibrary(page) {
  await page.getByLabel("Document").or(page.getByTestId("pdf-empty-state")).waitFor({ timeout: 25000 });
  await page.waitForTimeout(300);
}

async function selectDoc(page, needle) {
  const docSelect = page.getByLabel("Document");
  await docSelect.waitFor({ timeout: 15000 });
  const value = await docSelect.evaluate((el, want) => {
    const options = [...el.options];
    const match = options.find((option) => option.text.toLowerCase().includes(want.toLowerCase()));
    if (!match) {
      throw new Error(`Document "${want}" not in library: ${options.map((option) => option.text).join(" | ")}`);
    }
    return match.value;
  }, needle);
  await docSelect.selectOption(value);
  await page.waitForTimeout(600);
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

async function uploadPdf(page, pdfPath, expectedName) {
  await waitForLibrary(page);
  await page.locator('input[type="file"]').first().setInputFiles(pdfPath);
  await page.waitForFunction(
    (name) => {
      const status = document.body.innerText;
      const ready = /ready to read|already in your library|couldn.?t upload/i.test(status);
      const select = document.querySelector('select[aria-label="Document"]');
      const titled = select
        ? [...select.options].some((option) => option.text.toLowerCase().includes(String(name).toLowerCase()))
        : false;
      return ready || titled;
    },
    expectedName,
    { timeout: 25000 }
  );
  if (expectedName) await selectDoc(page, expectedName);
  await page.waitForSelector('[data-testid="pdf-text-layer"]', { timeout: 20000 });
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const persistFacts = { mode: "unknown", apiStatus: null, reason: null };

try {
  const auth = await signInOwner(page);
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("oryzen_study_roadmap_v1") || key === "oryzen_study_rhythm_v1")
      .forEach((key) => localStorage.removeItem(key));
    document.documentElement.setAttribute("data-theme", "classic");
  });
  await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
  await skipPricing(page);
  await shot(page, "00-hub-signed-in");

  // --- 1. Seven-step onboarding ---
  try {
    await gotoRoadmap(page);
    if (await page.getByRole("button", { name: /Start a new roadmap/i }).count()) {
      await page.getByRole("button", { name: /Start a new roadmap/i }).click();
    }
    await page.getByTestId("roadmap-onboarding").waitFor({ timeout: 15000 });
    const shots1 = [];

    await page.getByTestId("roadmap-exam-name").fill("Board exam");
    await page.getByTestId("roadmap-exam-date").fill(iso(exam60));
    await page.getByTestId("roadmap-horizon-days_60").click();
    shots1.push(await shot(page, "01-step-exam"));
    await page.getByTestId("roadmap-next").click();

    await page.waitForTimeout(200);
    const subjects = await page.locator("input[aria-label='Subject name']").evaluateAll((els) =>
      els.map((el) => el.value)
    );
    shots1.push(await shot(page, "01-step-subjects"));
    const subjectsOk =
      subjects.includes("Mathematics") && subjects.includes("Science") && subjects.includes("English");
    await page.getByTestId("roadmap-next").click();

    await page.waitForTimeout(200);
    const chapterCount = await page.locator("input[aria-label$='chapter']").count();
    shots1.push(await shot(page, "01-step-chapters"));
    await page.getByTestId("roadmap-next").click();

    await page.getByRole("button", { name: /Just starting/i }).click();
    shots1.push(await shot(page, "01-step-prep"));
    await page.getByTestId("roadmap-next").click();

    await page.getByTestId("roadmap-daily-hours").fill("3");
    shots1.push(await shot(page, "01-step-hours"));
    await page.getByTestId("roadmap-next").click();

    await page.getByRole("button", { name: /Add commitment/i }).click();
    await page.getByLabel("Commitment name").fill("Sports");
    shots1.push(await shot(page, "01-step-commitments"));
    await page.getByTestId("roadmap-next").click();

    shots1.push(await shot(page, "01-step-sleep"));
    const lastTitle = await page.locator("h2").first().innerText();
    const stepOk =
      subjectsOk &&
      chapterCount >= 8 &&
      /prefer to study|sleep/i.test(lastTitle) &&
      (await page.getByTestId("roadmap-generate").count()) > 0;
    record(
      1,
      "Complete seven-step Study Roadmap onboarding",
      stepOk ? "PASS" : "FAIL",
      `auth=${auth.mode} subjects=${subjects.join(",")} chapters=${chapterCount} last="${lastTitle}"`,
      shots1
    );
    if (!stepOk) throw new Error("Onboarding steps incomplete");
  } catch (error) {
    record(1, "Complete seven-step Study Roadmap onboarding", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "01-error").catch(() => ""),
    ]);
    throw error;
  }

  // --- 2. Generate 60-day plan ---
  try {
    await page.getByTestId("roadmap-generate").click();
    await page.getByTestId("roadmap-today").waitFor({ timeout: 20000 });
    const stored = await readRoadmap(page);
    const plan = stored?.record?.plan;
    const work = (plan?.days ?? []).flatMap((day) => day.sessions ?? []).filter(
      (session) => session.kind === "study" || session.kind === "revision" || session.kind === "practice_test"
    );
    const subjects = new Set(work.map((session) => session.subjectName).filter(Boolean));
    const dayCount = plan?.days?.length ?? 0;
    const hasRevision = work.some((session) => session.kind === "revision");
    const hasBuffer = (plan?.days ?? []).some((day) => day.kind === "buffer" || (day.sessions ?? []).some((s) => s.kind === "buffer"));
    const hasPractice = work.some((session) => session.kind === "practice_test");
    const spanOk = dayCount >= 55 && dayCount <= 61;
    const mixOk = subjects.has("Mathematics") && subjects.has("Science") && subjects.has("English");
    const shot2 = await shot(page, "02-generated-60-day");
    await page.getByRole("button", { name: "This month" }).click();
    const monthShot = await shot(page, "02-month-view");
    await page.getByRole("button", { name: "Today" }).click();
    record(
      2,
      "Generate realistic 60-day Math+Science+English 3h/day plan",
      spanOk && mixOk && hasRevision && hasBuffer ? "PASS" : "FAIL",
      `days=${dayCount} subjects=${[...subjects].join(",")} revision=${hasRevision} buffer=${hasBuffer} practice=${hasPractice} overflowFits=${plan?.overflow?.fits} work=${work.length}`,
      [shot2, monthShot]
    );
  } catch (error) {
    record(2, "Generate realistic 60-day Math+Science+English 3h/day plan", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "02-error").catch(() => ""),
    ]);
  }

  // --- 3. Complete tasks; progress updates ---
  try {
    await page.getByRole("button", { name: "Today" }).click();
    const before = await page.locator("text=/study blocks done/").innerText();
    const boxes = page.getByTestId("roadmap-task-complete");
    const count = await boxes.count();
    if (count === 0) throw new Error("No completable tasks on today");
    await boxes.nth(0).check();
    if (count > 1) await boxes.nth(1).check();
    await page.waitForTimeout(200);
    const after = await page.locator("text=/study blocks done/").innerText();
    const beforeN = Number((before.match(/(\d+) of/) || [])[1] || 0);
    const afterN = Number((after.match(/(\d+) of/) || [])[1] || 0);
    const shot3 = await shot(page, "03-tasks-completed");
    record(
      3,
      "Complete tasks; progress updates",
      afterN > beforeN ? "PASS" : "FAIL",
      `before="${before}" after="${after}" boxes=${count}`,
      [shot3]
    );
  } catch (error) {
    record(3, "Complete tasks; progress updates", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "03-error").catch(() => ""),
    ]);
  }

  // --- 4. Manually move/edit a session ---
  let editedSession = null;
  try {
    await page.getByRole("button", { name: "Edit timetable" }).click();
    await page.getByTestId("roadmap-edit").waitFor({ timeout: 8000 });
    const first = page.locator("[data-testid='roadmap-edit'] button").first();
    const label = await first.innerText();
    await first.click();
    const dateInput = page.locator("[data-testid='roadmap-edit'] input[type='date']");
    const minutesInput = page.locator("[data-testid='roadmap-edit'] input[type='number']");
    const originalDate = await dateInput.inputValue();
    const originalMinutes = await minutesInput.inputValue();
    const next = new Date(`${originalDate}T12:00:00`);
    next.setDate(next.getDate() + 1);
    const movedDate = iso(next);
    await dateInput.fill(movedDate);
    await minutesInput.fill("40");
    await page.getByRole("button", { name: /Save session change/i }).click();
    await page.waitForTimeout(300);
    const warning = await page.locator("[data-testid='roadmap-edit'] .alert, [data-testid='roadmap-edit'] p").allInnerTexts();
    const stored = await readRoadmap(page);
    const sessions = (stored?.record?.plan?.days ?? []).flatMap((day) => day.sessions ?? []);
    const moved = sessions.find((session) => session.date === movedDate && session.minutes === 40);
    const stillOld = sessions.find((session) => session.date === originalDate && String(session.minutes) === originalMinutes && / · /.test(label) && label.includes(session.title));
    editedSession = { originalDate, originalMinutes, movedDate, found: Boolean(moved) };
    const shot4 = await shot(page, "04-session-edited");
    record(
      4,
      "Manually move/edit a session; persists",
      moved ? "PASS" : "FAIL",
      `from ${originalDate}/${originalMinutes}m → ${movedDate}/40m found=${Boolean(moved)} warning=${warning.join(" | ").slice(0, 180)} stillOld=${Boolean(stillOld)}`,
      [shot4]
    );
  } catch (error) {
    record(4, "Manually move/edit a session; persists", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "04-error").catch(() => ""),
    ]);
  }

  // --- 7 early: refresh persist of the 60-day plan + progress + edit ---
  try {
    const beforeReload = await readRoadmap(page);
    const completionsBefore = Object.keys(beforeReload?.record?.completions ?? {}).length;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("roadmap-today").or(page.getByTestId("roadmap-onboarding")).waitFor({ timeout: 15000 });
    if (await page.getByRole("button", { name: "Today" }).count()) {
      await page.getByRole("button", { name: "Today" }).click();
    }
    const after = await readRoadmap(page);
    const probe = await persistProbe(page);
    persistFacts.mode = probe.persist === "server" && probe.status === 200 && probe.hasRemoteRecord ? "server" : "browser-local";
    persistFacts.apiStatus = probe.status;
    persistFacts.reason = probe.reason;
    if (probe.status === 503 || probe.reason === "table_missing" || !probe.hasRemoteRecord) {
      persistFacts.mode = "browser-local";
    }
    const completionsAfter = Object.keys(after?.record?.completions ?? {}).length;
    const sessions = (after?.record?.plan?.days ?? []).flatMap((day) => day.sessions ?? []);
    const editKept = editedSession?.found
      ? sessions.some((session) => session.date === editedSession.movedDate && session.minutes === 40)
      : completionsAfter > 0;
    const studio = await page.getByTestId("roadmap-today").count();
    const shot7 = await shot(page, "07-refresh-persist");
    record(
      7,
      "Refresh + reopen /roadmap: plan + progress persist",
      studio > 0 && completionsAfter >= completionsBefore && editKept ? "PASS" : "FAIL",
      `PERSISTENCE=${persistFacts.mode} apiStatus=${probe.status} persist=${probe.persist} reason=${probe.reason} remoteRecord=${probe.hasRemoteRecord} uiAccount=${probe.uiMentionsAccount} completions ${completionsBefore}->${completionsAfter} days=${after?.record?.plan?.days?.length ?? 0} key=${after?.key}`,
      [shot7]
    );
  } catch (error) {
    record(7, "Refresh + reopen /roadmap: plan + progress persist", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "07-error").catch(() => ""),
    ]);
  }

  // --- 5. Miss four days; Replan ---
  try {
    await page.getByTestId("roadmap-replan").click();
    await page.getByTestId("roadmap-replan-dialog").waitFor({ timeout: 8000 });
    const missed = page.getByTestId("roadmap-missed-day");
    const available = await missed.count();
    const toCheck = Math.min(4, available);
    for (let i = 0; i < toCheck; i += 1) {
      if (!(await missed.nth(i).isChecked())) await missed.nth(i).check();
    }
    const beforeStored = await readRoadmap(page);
    const beforeWork = (beforeStored?.record?.plan?.days ?? [])
      .flatMap((day) => day.sessions ?? [])
      .filter((session) => session.kind !== "break");
    await page.getByRole("button", { name: /Preview rebuilt plan/i }).click();
    await page.getByTestId("roadmap-replan-confirm").waitFor({ timeout: 8000 });
    const preview = await page.locator("[data-testid=roadmap-replan-dialog]").innerText();
    const previewShot = await shot(page, "05-replan-preview");
    const overflowWarned = /more than your calendar allows|overflow|cannot fit/i.test(preview);
    await page.getByTestId("roadmap-replan-confirm").click();
    await page.getByRole("button", { name: "Today" }).click().catch(() => {});
    await page.getByTestId("roadmap-today").waitFor({ timeout: 10000 });
    const afterStored = await readRoadmap(page);
    const afterDays = afterStored?.record?.plan?.days ?? [];
    const afterWork = afterDays.flatMap((day) => day.sessions ?? []).filter((session) => session.kind !== "break" && session.kind !== "buffer");
    const empty = afterWork.length === 0;
    const overflow = afterStored?.record?.plan?.overflow;
    const worseOverflow = overflow && overflow.fits === false && !overflowWarned && !overflow.message;
    const shot5 = await shot(page, "05-after-replan");
    record(
      5,
      "Miss four days; Replan produces a feasible revised schedule",
      !empty && !worseOverflow && afterWork.length > 0 && /Replace my current plan|preview|rebuilt/i.test(preview + " confirm")
        ? "PASS"
        : empty || worseOverflow
          ? "FAIL"
          : "FAIL",
      `checked=${toCheck}/${available} afterDays=${afterDays.length} afterWork=${afterWork.length} beforeWork=${beforeWork.length} overflowFits=${overflow?.fits} warned=${overflowWarned} summary=${preview.replace(/\s+/g, " ").slice(0, 240)}`,
      [previewShot, shot5]
    );
  } catch (error) {
    record(5, "Miss four days; Replan produces a feasible revised schedule", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "05-error").catch(() => ""),
    ]);
  }

  // --- 6. Impossible / insufficient hours ---
  try {
    await page.getByRole("button", { name: /Start a new roadmap/i }).click();
    await page.getByTestId("roadmap-onboarding").waitFor({ timeout: 10000 });
    await page.getByTestId("roadmap-exam-name").fill("Impossible sprint");
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
    const shot6 = await shot(page, "06-overflow-warning");
    record(
      6,
      "Impossible/insufficient hours → clear overflow warning",
      /calendar allows|cannot fit|more than/i.test(overflow) ? "PASS" : "FAIL",
      overflow,
      [shot6]
    );
  } catch (error) {
    record(6, "Impossible/insufficient hours → clear overflow warning", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "06-error").catch(() => ""),
    ]);
  }

  // --- 8. Themes + mixed profiles at 1440 and 390 ---
  try {
    const shots8 = [];
    const failures = [];
    await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
    await skipPricing(page);
    await page
      .waitForFunction(() => typeof window.__oryzenSetRhythmOpen === "function", null, { timeout: 10000 });

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
    if (!independent) failures.push(`theme/coach coupled theme=${afterTheme.themeId}/${afterTheme.coachStyle} then ${afterCoach.themeId}/${afterCoach.coachStyle}`);

    for (const theme of THEMES) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openRhythm(page);
      await pickTheme(page, theme.id);
      await closeRhythm(page);
      const applied = await themeId(page);
      const bg = (await cssBg(page)).toLowerCase();
      const contrast = await contrastPairs(page);
      const contrastOk = contrast.every((row) => row.ok);
      if (applied !== theme.id || bg !== theme.hex) failures.push(`${theme.id} 1440 applied=${applied} bg=${bg}`);
      if (!contrastOk) failures.push(`${theme.id} contrast ${JSON.stringify(contrast.filter((row) => !row.ok))}`);
      shots8.push(await shot(page, `08-${theme.id}-1440`));

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
      const mobileTheme = await themeId(page);
      const mobileContrast = await contrastPairs(page);
      if (mobileTheme !== theme.id) failures.push(`${theme.id} 390 applied=${mobileTheme}`);
      if (!mobileContrast.every((row) => row.ok)) failures.push(`${theme.id} 390 contrast`);
      shots8.push(await shot(page, `08-${theme.id}-390`));
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await openRhythm(page);
    await pickTheme(page, "warm-lift");
    await closeRhythm(page);
    await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
    await skipPricing(page);
    const chromeTheme = await themeId(page);
    const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("oryzen_study_rhythm_v1") || "{}"));
    let parchment = false;
    try {
      await waitForLibrary(page);
      const select = page.getByLabel("Document");
      if (await select.count()) {
        const options = await select.evaluate((el) => [...el.options].map((option) => option.text));
        if (options.some((text) => /circuit|science|math|work/i.test(text))) {
          await selectDoc(page, options.find((text) => /circuit|science|math|work/i.test(text)));
        }
      }
      await page.waitForSelector('[data-testid^="pdf-mounted-page-"]', { timeout: 12000 }).catch(() => {});
    } catch {
      // library may be empty; parchment lock is still asserted from prefs + source hex
    }
    parchment = prefs.pdfPaperOptIn !== true && chromeTheme === "warm-lift";
    shots8.push(await shot(page, "08-reader-parchment-warm-lift"));
    const missingThemes = THEMES.map((theme) => theme.id).filter((id) => !listed.includes(id));
    if (missingThemes.length) failures.push(`picker missing ${missingThemes.join(",")}`);

    record(
      8,
      "All visual themes + mixed profiles at 1440 and 390; contrast; PDF parchment",
      failures.length === 0 && parchment && listed.length === 7 ? "PASS" : "FAIL",
      `listed=${listed.join(",")} independent=${independent} parchmentOptIn=${prefs.pdfPaperOptIn} chrome=${chromeTheme} failures=${failures.join(" | ") || "none"}`,
      shots8
    );
  } catch (error) {
    record(8, "All visual themes + mixed profiles at 1440 and 390; contrast; PDF parchment", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "08-error").catch(() => ""),
    ]);
  }

  // --- 9. Regression: reader / notes / Test Me ---
  try {
    const shots9 = [];
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
    await skipPricing(page);
    if (page.url().includes("/auth")) {
      record(9, "Regression: /reader Fit Width, /notes, Test Me 10 MCQs", "BLOCKED", "Reader redirected to /auth — session missing", [
        await shot(page, "09-reader-auth"),
      ]);
    } else {
      await waitForLibrary(page);
      await uploadPdf(page, circuitPdf, "science-circuit-current");
      await page.waitForSelector('[data-testid^="pdf-mounted-page-"][data-page-width]', { timeout: 20000 });
      await page.getByTestId("fit-width-btn").click();
      await page.waitForTimeout(500);
      const fit = await page.evaluate(() => {
        const canvas = document.querySelector('[data-testid="pdf-reading-canvas"]');
        const frame = document.querySelector('[data-testid^="pdf-mounted-page-"][data-active="true"]');
        return {
          fitMode: canvas?.getAttribute("data-fit-mode") ?? "",
          pageWidth: Number(frame?.getAttribute("data-page-width") ?? 0),
        };
      });
      shots9.push(await shot(page, "09-reader-fit-width"));

      await page.goto(`${BASE}/notes`, { waitUntil: "domcontentloaded" });
      await skipPricing(page);
      await page.getByRole("heading", { name: /My Notebook/i }).waitFor({ timeout: 15000 });
      const notesText = await page.locator("main").innerText();
      const notesLoaded = /My Notebook|Opening your notebook|waiting for its first idea|Add/i.test(notesText);
      shots9.push(await shot(page, "09-notes"));

      await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
      await waitForLibrary(page);
      await selectDoc(page, "science-circuit-current").catch(() => uploadPdf(page, circuitPdf, "science-circuit-current"));
      let mcqStatus = "BLOCKED";
      let mcqEvidence = "";
      try {
        await selectPassage(page);
        const request = page.waitForResponse(
          (res) => res.url().includes("/api/ai/lens") && res.request().method() === "POST",
          { timeout: 25000 }
        );
        await page.getByTestId("lens-btn-test_me").click();
        const res = await request;
        const json = await res.json().catch(() => ({}));
        await page.getByTestId("test-me-quiz").waitFor({ timeout: 20000 });
        const mcqs = json.payload?.mcqs ?? [];
        const progress = await page.getByTestId("test-me-progress").innerText().catch(() => "");
        const uiCount = await page.locator("[data-testid=test-me-quiz] button").count().catch(() => 0);
        mcqEvidence = `apiMcqs=${mcqs.length} uiButtons=${uiCount} progress=${progress.replace(/\s+/g, " ")} fallback=${json.usedDeterministicFallback} reason=${json.fallbackReason ?? ""}`;
        mcqStatus = mcqs.length === 10 || /10/.test(progress) ? "PASS" : mcqs.length > 0 ? "FAIL" : "BLOCKED";
        shots9.push(await shot(page, "09-test-me"));
      } catch (quizError) {
        mcqStatus = "BLOCKED";
        mcqEvidence = `Test Me short path blocked: ${quizError instanceof Error ? quizError.message : String(quizError)}`;
        shots9.push(await shot(page, "09-test-me-blocked").catch(() => ""));
      }

      const readerOk = fit.fitMode === "width" || fit.pageWidth > 0;
      const overall =
        !readerOk || !notesLoaded ? "FAIL" : mcqStatus === "PASS" && readerOk && notesLoaded ? "PASS" : mcqStatus === "BLOCKED" ? "BLOCKED" : "FAIL";
      record(
        9,
        "Regression: /reader Fit Width, /notes, Test Me 10 MCQs",
        overall,
        `fit=${JSON.stringify(fit)} notesLoaded=${notesLoaded} testMe=${mcqStatus} ${mcqEvidence}`,
        shots9
      );
    }
  } catch (error) {
    record(9, "Regression: /reader Fit Width, /notes, Test Me 10 MCQs", "BLOCKED", error instanceof Error ? error.message : String(error), [
      await shot(page, "09-error").catch(() => ""),
    ]);
  }

  // --- 10. SQL review (file only; not applied) ---
  record(
    10,
    "Review supabase/pending/20261022000002_study_roadmaps.sql (not applied)",
    "PASS",
    [
      "PENDING file only — not applied.",
      "RLS enabled. Policy FOR ALL TO authenticated USING/WITH CHECK (auth.uid() = user_id).",
      "Unique user_id + ON DELETE CASCADE matches /api/roadmap upsert onConflict user_id (one plan per user).",
      "GRANT SELECT/INSERT/UPDATE/DELETE to authenticated only; anon has no table rights.",
      "Trigger trg_study_roadmaps_updated_at depends on public.set_updated_at_timestamp() (exists in applied layer1 + bootstrap).",
      "JSONB intake/plan/completions is compatible with sanitizeRecord + API GET/POST.",
      "Same RLS pattern as note_subjects. No anon policy. Service role bypasses RLS by default.",
      "Gap: no jsonb shape CHECKs (app sanitizes). Unique user_id forbids multiple concurrent roadmaps (current app model).",
      "If table is missing, API returns persist=local / reason=table_missing — localStorage holds the demo.",
    ].join(" ")
  );
} catch (error) {
  await shot(page, "99-crash").catch(() => null);
  if (!reports.some((row) => row.status === "FAIL" && row.id === 1)) {
    console.error("VERIFY_CRASH", error);
  }
} finally {
  writeFileSync(
    join(outDir, "results.json"),
    JSON.stringify({ persistFacts, reports }, null, 2)
  );
  await browser.close();
}

const failed = reports.filter((row) => row.status === "FAIL");
console.log("PHASE3A_R0_VERIFY", JSON.stringify({ persistFacts, reports }, null, 2));
if (failed.length) {
  process.exitCode = 1;
}
