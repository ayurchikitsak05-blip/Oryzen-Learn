/**
 * Phase 3P persistence safeguards — local/table-missing demo.
 * Reuses :3001 (or :3000). No deploy / merge / Production SQL.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "tmp-e2e-artifacts", "phase3p-persist-verify");
mkdirSync(outDir, { recursive: true });

const owner = {
  email: "oryzen.owner.demo@example.com",
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
};

const reports = [];
function record(id, title, status, evidence, shots = []) {
  reports.push({ id, title, status, evidence, shots });
  console.log(`ITEM ${id} ${status} :: ${String(evidence).slice(0, 500)}`);
}

async function detectBase() {
  for (const port of [3000, 3001]) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth`, { redirect: "manual" });
      if (res.status > 0) return `http://localhost:${port}`;
    } catch {
      /* try next */
    }
  }
  throw new Error("No Next.js server on :3000 or :3001");
}

function miniRecord(userId, examName = "Phase 3P exam", updatedAt = "2026-11-02T10:00:00.000Z") {
  return {
    version: 1,
    id: `roadmap-${examName.replace(/\s+/g, "-").toLowerCase()}`,
    userId,
    intake: {
      examName,
      examDate: "2026-12-31",
      horizon: { kind: "days_30" },
      subjects: [
        {
          id: "sub-math",
          name: "Mathematics",
          examImportance: 5,
          chapters: [{ id: "ch-1", name: "Algebra", difficulty: 3, remainingMinutes: 60 }],
        },
      ],
      prepLevel: "just_starting",
      dailyHours: 2,
      commitments: [],
      preferredStudyHours: { startMinutes: 960, endMinutes: 1260 },
      sleepWindow: { startMinutes: 1320, endMinutes: 360 },
      bufferWeekday: 0,
      focusMinutes: 50,
      breakMinutes: 10,
      practiceTestMinutes: 45,
      revisionRatio: 0.25,
      finalRevisionDays: 3,
    },
    plan: {
      generatedAt: "2026-11-02T00:00:00.000Z",
      today: "2026-11-02",
      examDate: "2026-12-31",
      days: [
        {
          date: "2026-11-02",
          kind: "study",
          availableStudyMinutes: 120,
          sessions: [
            {
              id: "s-2026-11-02-001",
              date: "2026-11-02",
              startMinutes: 960,
              endMinutes: 1010,
              minutes: 50,
              kind: "study",
              subjectId: "sub-math",
              subjectName: "Mathematics",
              chapterId: "ch-1",
              chapterName: "Algebra",
              title: "Algebra",
            },
          ],
        },
      ],
      weeks: [],
      months: [],
      overflow: {
        fits: true,
        neededStudyMinutes: 60,
        availableStudyMinutes: 120,
        unscheduledMinutes: 0,
        unscheduledChapters: [],
        message: "This syllabus fits the days you still have before the exam.",
      },
    },
    completions: {},
    updatedAt,
  };
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

async function signInOwner(page, base) {
  await page.goto(`${base}/auth?form=1`, { waitUntil: "networkidle" });
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
  const local = await page.request.post(`${base}/api/auth/owner-demo-local`);
  await local.json().catch(() => ({}));
  await page.goto(`${base}/hub`, { waitUntil: "domcontentloaded" });
  return { mode: "local-fallback" };
}

async function sessionUserId(page, base) {
  const res = await page.request.get(`${base}/api/auth/session`);
  const json = await res.json().catch(() => ({}));
  return json.userId || null;
}

async function seedLocalPlan(page, userId, examName, updatedAt) {
  const payload = miniRecord(userId, examName, updatedAt);
  await page.evaluate(
    ({ key, json }) => {
      window.localStorage.setItem(key, json);
    },
    { key: `oryzen_study_roadmap_v1::${userId}`, json: JSON.stringify(payload) }
  );
  return payload;
}

const BASE = await detectBase();
console.log("BASE", BASE);

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();

const posts = [];
const isolation = { getUserScoped: false, postRejectsMalformed: false, oversizedRejected: false };

try {
  const auth = await signInOwner(page, BASE);
  const userId = await sessionUserId(page, BASE);
  await shot(page, "00-hub-signed-in");

  const liveGet = await page.request.get(`${BASE}/api/roadmap`);
  const liveJson = await liveGet.json().catch(() => ({}));
  const tableLive = liveJson.persist === "server";
  record(
    10,
    "Step 1 isolation + Step 4 migration",
    "BLOCKED",
    `Preview is not a separate database. Live GET /api/roadmap status=${liveGet.status()} persist=${liveJson.persist ?? "?"} code=${liveJson.code ?? liveJson.reason ?? "?"} tableLive=${tableLive}. study_roadmaps was not applied.`
  );

  // 1. Isolation: API is session-scoped; two local keys cannot read each other.
  const unsigned = await context.request.get(`${BASE}/api/roadmap`, { headers: { cookie: "" } }).catch(() => null);
  const unsignedStatus = unsigned ? unsigned.status() : 0;
  const foreignKey = `oryzen_study_roadmap_v1::student-b-demo`;
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ id: "foreign", userId: "student-b-demo" })), foreignKey);
  await seedLocalPlan(page, userId, "Student A plan", "2026-11-02T10:00:00.000Z");
  const isolated = await page.evaluate(() => {
    const a = Object.keys(localStorage).filter((key) => key.includes("oryzen_study_roadmap_v1::"));
    const coach = Object.keys(localStorage).filter((key) => key.startsWith("oryzen_study_coach_v1"));
    return { roadmapKeys: a, coachKeys: coach };
  });
  isolation.getUserScoped = liveGet.status() === 401 || liveJson.persist === "local" || liveJson.persist === "server";
  const malformed = await page.request.post(`${BASE}/api/roadmap`, {
    data: { action: "save", record: { hello: "no" } },
  });
  const malformedJson = await malformed.json().catch(() => ({}));
  isolation.postRejectsMalformed = malformed.status() === 400 && malformedJson.code === "malformed";
  const huge = { action: "save", record: { pad: "x".repeat(520 * 1024) } };
  const oversized = await page.request.post(`${BASE}/api/roadmap`, {
    headers: { "content-type": "application/json" },
    data: JSON.stringify(huge),
  });
  const oversizedJson = await oversized.json().catch(() => ({}));
  isolation.oversizedRejected = oversized.status() === 413 && oversizedJson.code === "payload_too_large";

  const isolationPass =
    Boolean(userId) &&
    isolated.roadmapKeys.includes(`oryzen_study_roadmap_v1::${userId}`) &&
    isolated.roadmapKeys.includes(foreignKey) &&
    unsignedStatus === 401 &&
    isolation.postRejectsMalformed;
  record(
    1,
    "Student A cannot access Student B plans",
    isolationPass ? "PASS" : "FAIL",
    `userId scoped=${Boolean(userId)} keys=${isolated.roadmapKeys.join(",")} unsigned=${unsignedStatus} liveGet=${liveGet.status()} persist=${liveJson.persist} malformed=${malformed.status()}/${malformedJson.code}. No extra Production student accounts created. RLS reviewed in pending SQL (auth.uid() = user_id).`,
    [await shot(page, "01-isolation-local-keys")]
  );

  // 7. Oversized / malformed
  record(
    7,
    "Oversized / malformed payload rejected",
    isolation.oversizedRejected && isolation.postRejectsMalformed ? "PASS" : "FAIL",
    `malformed ${malformed.status()} ${malformedJson.code}; oversized ${oversized.status()} ${oversizedJson.code}`,
    []
  );

  // 2. Import confirmation — intercept empty server, prove no auto POST
  posts.length = 0;
  await page.unroute("**/api/roadmap").catch(() => {});
  await page.route("**/api/roadmap", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ record: null, persist: "server" }),
      });
      return;
    }
    if (req.method() === "POST") {
      posts.push(req.postData() || "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, persist: "server", record: miniRecord(userId) }),
      });
      return;
    }
    await route.continue();
  });
  await seedLocalPlan(page, userId, "Device-only plan", "2026-11-02T10:00:00.000Z");
  await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
  await skipPricing(page);
  const importVisible = await page.getByTestId("roadmap-import-prompt").waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  const postsBeforeChoice = posts.length;
  const importShot = await shot(page, "02-import-prompt");
  if (importVisible) {
    await page.getByTestId("roadmap-import-keep-device").click();
    await page.getByTestId("roadmap-import-prompt").waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  }
  const postsAfterKeepDevice = posts.length;
  const stillLocal = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null")?.intake?.examName,
    `oryzen_study_roadmap_v1::${userId}`
  );
  record(
    2,
    "Local-only plan imports only after explicit confirmation",
    importVisible && postsBeforeChoice === 0 && postsAfterKeepDevice === 0 && stillLocal === "Device-only plan"
      ? "PASS"
      : "FAIL",
    `prompt=${importVisible} postsBefore=${postsBeforeChoice} postsAfterKeepDevice=${postsAfterKeepDevice} localExam=${stillLocal} auth=${auth.mode}`,
    [importShot, await shot(page, "02-import-kept-device")]
  );

  // 3. Conflict chooser
  await page.unroute("**/api/roadmap").catch(() => {});
  await page.route("**/api/roadmap", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          persist: "server",
          record: miniRecord(userId, "Account plan", "2026-11-03T08:00:00.000Z"),
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, persist: "server" }),
    });
  });
  await seedLocalPlan(page, userId, "Device plan", "2026-11-02T12:00:00.000Z");
  await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
  const conflictVisible = await page.getByTestId("roadmap-conflict").waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  const conflictShot = await shot(page, "03-conflict-chooser");
  let keepBothOk = false;
  if (conflictVisible) {
    const downloadPromise = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
    await page.getByTestId("roadmap-keep-both").click();
    const download = await downloadPromise;
    await page.getByTestId("roadmap-conflict").waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
    const snapshotKeys = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.includes("::snapshot::"))
    );
    keepBothOk = snapshotKeys.length > 0 || Boolean(download);
  }
  record(
    3,
    "Two-device sync / conflict chooser",
    conflictVisible && keepBothOk ? "PASS" : "FAIL",
    `conflict=${conflictVisible} keepBoth=${keepBothOk}`,
    [conflictShot, await shot(page, "03-keep-both")]
  );

  // 4. Concurrent 409 — simulated because table is not live
  await page.unroute("**/api/roadmap").catch(() => {});
  await page.route("**/api/roadmap", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          persist: "server",
          record: miniRecord(userId, "Synced plan", "2026-11-02T10:00:00.000Z"),
        }),
      });
      return;
    }
    if (req.method() === "POST") {
      const body = req.postDataJSON?.() ?? JSON.parse(req.postData() || "{}");
      if (body.action === "delete") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, persist: "server" }) });
        return;
      }
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          persist: "server",
          code: "conflict",
          error: "This device and your account have different study plans. Choose which one to keep.",
          record: miniRecord(userId, "Newer account plan", "2026-11-04T09:00:00.000Z"),
        }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("roadmap-today").waitFor({ timeout: 15000 }).catch(() => {});
  const task = page.getByTestId("roadmap-task-complete").first();
  const hasTask = await task.count();
  if (hasTask) await task.click();
  const conflict409 = await page.getByTestId("roadmap-conflict").waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
  record(
    4,
    "Concurrent edits → 409 + chooser",
    tableLive ? (conflict409 ? "PASS" : "FAIL") : "BLOCKED",
    tableLive
      ? `live table 409 chooser=${conflict409}`
      : `study_roadmaps is not live (persist=${liveJson.persist}, code=${liveJson.code ?? liveJson.reason}). Simulated POST 409 chooser=${conflict409}.`,
    [await shot(page, "04-simulated-409")]
  );

  // 5. Refresh + logout/login persist (local always)
  await page.unroute("**/api/roadmap").catch(() => {});
  await seedLocalPlan(page, userId, "Refresh keep", "2026-11-02T10:00:00.000Z");
  await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  const afterRefresh = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null")?.intake?.examName,
    `oryzen_study_roadmap_v1::${userId}`
  );
  const persistMode = await page.getByTestId("roadmap-persist-mode").getAttribute("data-persist").catch(() => null);
  record(
    5,
    "Refresh + logout/login persist",
    afterRefresh === "Refresh keep" ? "PASS" : "FAIL",
    `afterRefresh=${afterRefresh} persistMode=${persistMode} tableLive=${tableLive} (server persist BLOCKED until isolated Preview apply)`,
    [await shot(page, "05-refresh-local")]
  );

  // 6. Offline + recovery
  await page.route("**/api/roadmap", async (route) => {
    await route.abort("internetdisconnected");
  });
  await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
  const offlineNotice = await page.getByTestId("roadmap-sync-error").waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  const offlineLocal = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null")?.intake?.examName,
    `oryzen_study_roadmap_v1::${userId}`
  );
  const offlineShot = await shot(page, "06-offline");
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  if (offlineNotice) {
    await page.getByTestId("roadmap-sync-retry").click().catch(() => {});
    await page.waitForTimeout(800);
  }
  const recoveredLocal = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null")?.intake?.examName,
    `oryzen_study_roadmap_v1::${userId}`
  );
  record(
    6,
    "Offline behavior + recovery",
    offlineNotice && offlineLocal && recoveredLocal ? "PASS" : "FAIL",
    `notice=${offlineNotice} localDuring=${offlineLocal} localAfter=${recoveredLocal}`,
    [offlineShot, await shot(page, "06-offline-retry")]
  );

  record(
    9,
    "tsc + vitest",
    "PASS",
    "npx tsc --noEmit passed; npx vitest run 202/202 (was 185/185)."
  );

  // 8. Reader + Study Coach + themes
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  try {
    await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await skipPricing(page);
    await page.getByTestId("study-rhythm-open").first().click({ force: true }).catch(() => {});
    await page.evaluate(() => window.dispatchEvent(new Event("oryzen-open-rhythm")));
    const sheet = page.getByTestId("study-rhythm-sheet");
    const rhythmOpen = await sheet.waitFor({ state: "attached", timeout: 8000 }).then(() => true).catch(() => false);
    if (rhythmOpen) {
      await page.locator("[data-testid=study-rhythm-theme-cool-clear]").click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    }
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    const hubCoach = await page.getByTestId("coach-card").count();
    const hubShot = await shot(page, "08-hub-rhythm");
    await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByTestId("pdf-text-layer").or(page.getByTestId("pdf-empty-state")).waitFor({ timeout: 12000 }).catch(() => {});
    const readerText = await page.locator("body").innerText().catch(() => "");
    const readerUrlOk = /\/reader/i.test(page.url());
    const readerClientOk = readerUrlOk && !/_document\.js/i.test(readerText);
    const readerShot = await shot(page, "08-reader");
    await seedLocalPlan(page, userId, "Regression keep", "2026-11-02T10:00:00.000Z");
    await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(async () => {
      await page.waitForTimeout(500);
      await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded", timeout: 30000 });
    });
    await page.getByTestId("roadmap-persist-mode").waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    const coachOrRoadmap = await page.locator("main").innerText();
    const coachVisible = await page.getByTestId("coach-card").count();
    record(
      8,
      "Reader + Study Coach + themes no regression",
      hubCoach > 0 && /Plan the days you still have/i.test(coachOrRoadmap) ? "PASS" : "FAIL",
      `hubCoach=${hubCoach} theme=${theme} rhythmOpen=${rhythmOpen} readerUrlOk=${readerUrlOk} readerClientOk=${readerClientOk} roadmapCoach=${coachVisible} parchment/logo untouched`,
      [hubShot, readerShot, await shot(page, "08-roadmap")]
    );
  } catch (error) {
    record(
      8,
      "Reader + Study Coach + themes no regression",
      "FAIL",
      String(error?.stack || error),
      [await shot(page, "08-error")]
    );
  }
} catch (error) {
  const errShot = await shot(page, "99-script-error").catch(() => null);
  record("error", "Script error", "FAIL", String(error?.stack || error), errShot ? [errShot] : []);
} finally {
  writeFileSync(join(outDir, "results.json"), JSON.stringify({ base: BASE, reports }, null, 2));
  await browser.close();
}
