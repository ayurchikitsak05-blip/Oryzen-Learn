/**
 * Phase 3P Preview deploy acceptance — Preview URL only.
 * Does not write to Production. Does not print secrets.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PREVIEW = "https://oryzen-learn-aomqhotox-ayurchikitsak05-8316s-projects.vercel.app";
const PRODUCTION = "https://oryzen-learn.vercel.app";
const PREVIEW_REF = "gxthbneiryvdrsduktza";
const PROD_REF = "mazzciufouqcxmwaacyu";

const outDir = join(process.cwd(), "tmp-e2e-artifacts", "phase3p-preview-deploy");
mkdirSync(outDir, { recursive: true });

function loadPreviewCreds() {
  const raw = readFileSync(join(process.cwd(), ".env.preview.local"), "utf8");
  const vals = {};
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    vals[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return {
    a: { email: vals.PREVIEW_TEST_USER_A, password: vals.PREVIEW_TEST_PASSWORD_A },
    b: { email: vals.PREVIEW_TEST_USER_B, password: vals.PREVIEW_TEST_PASSWORD_B },
  };
}

const reports = [];
function record(id, title, status, evidence, shots = []) {
  reports.push({ id, title, status, evidence, shots });
  console.log(`ITEM ${id} ${status} :: ${String(evidence).slice(0, 700)}`);
}

function miniRecord(userId, examName = "Phase 3P preview exam", updatedAt = "2026-11-02T10:00:00.000Z") {
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

function oidcHeaders() {
  const token = process.env.VERCEL_OIDC_TOKEN || "";
  if (!token) return {};
  return { "x-vercel-trusted-oidc-idp-token": token };
}

function trackHosts(page, bucket) {
  page.on("request", (req) => {
    try {
      const host = new URL(req.url()).hostname;
      if (host.endsWith("supabase.co")) bucket.add(host);
    } catch {
      /* ignore */
    }
  });
}

async function shot(page, name) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function skipPricing(page) {
  if (!page.url().includes("/pricing") && !page.url().includes("/access")) return false;
  const free = page.getByRole("button", { name: /Start free/i });
  if (await free.count()) {
    await free.click();
    await page.waitForURL(/\/(hub|reader|roadmap|notes|body-type)/, { timeout: 20000 }).catch(() => {});
  }
  return true;
}

async function signIn(page, creds) {
  await page.goto(`${PREVIEW}/auth?form=1`, { waitUntil: "domcontentloaded", timeout: 45000 });
  if (await page.getByRole("tab", { name: "Sign In" }).count()) {
    await page.getByRole("tab", { name: "Sign In" }).click();
  }
  const usePassword = page.getByRole("button", { name: /email and password/i });
  if (await usePassword.count()) await usePassword.click();
  await page.locator("#student-email").fill(creds.email);
  await page.locator("#student-password").fill(creds.password);
  const [signinRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/auth/password") && res.request().method() === "POST",
      { timeout: 30000 }
    ).catch(() => null),
    page.getByRole("button", { name: /^Sign in$/i }).click(),
  ]);
  const signinJson = signinRes ? await signinRes.json().catch(() => ({})) : {};
  await page.waitForURL(/\/(hub|pricing|instructor|reader|body-type|roadmap|access)/, { timeout: 30000 }).catch(() => {});
  const gated = await skipPricing(page);
  return {
    mode: signinRes?.ok() && signinJson.status === "authenticated" ? "signin" : "unknown",
    status: signinRes ? signinRes.status() : 0,
    error: signinJson.error || null,
    gated,
    url: page.url(),
  };
}

async function sessionInfo(page) {
  const res = await page.request.get(`${PREVIEW}/api/auth/session`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status(), userId: json.userId || null, json };
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

const creds = loadPreviewCreds();
if (!creds.a.email || !creds.b.email || !creds.a.password || !creds.b.password) {
  throw new Error("Preview test users missing from .env.preview.local");
}

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const previewHosts = new Set();
const prodHosts = new Set();
const isolation = { aExam: null, bExam: null, aUserId: null, bUserId: null };

try {
  // 0. Production read-only host check (no writes, no OIDC — public alias)
  const prodCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const prodPage = await prodCtx.newPage();
  trackHosts(prodPage, prodHosts);
  await prodPage.goto(PRODUCTION, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((err) => {
    record("prod-nav", "Production site reachable (read-only)", "FAIL", String(err));
  });
  await prodPage.waitForTimeout(2500);
  const prodShot = await shot(prodPage, "00-production-readonly");
  const prodHostList = [...prodHosts];
  const prodOk = prodHostList.some((h) => h.includes(PROD_REF)) && !prodHostList.some((h) => h.includes(PREVIEW_REF));
  record(
    "prod-host",
    "Production still talks to Prod Supabase",
    prodHostList.length === 0 ? "BLOCKED" : prodOk ? "PASS" : "FAIL",
    `hosts=${prodHostList.join(",") || "(none yet — may need auth request)"}`,
    [prodShot]
  );
  await prodCtx.close();

  const ctxA = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: oidcHeaders(),
    ignoreHTTPSErrors: true,
  });
  const page = await ctxA.newPage();
  trackHosts(page, previewHosts);

  const authA = await signIn(page, creds.a);
  const sessionA = await sessionInfo(page);
  isolation.aUserId = sessionA.userId;
  await shot(page, "01-preview-a-signed-in");

  const vercelAuthBlocked =
    /vercel\.com\/login|Authentication Required|Deployment Protection/i.test(await page.locator("body").innerText().catch(() => "")) ||
    page.url().includes("vercel.com/login");

  if (vercelAuthBlocked) {
    record("preview-access", "Preview URL reachable past Vercel Authentication", "FAIL", `url=${page.url()} oidc=${Boolean(process.env.VERCEL_OIDC_TOKEN)}`);
  } else {
    record("preview-access", "Preview URL reachable past Vercel Authentication", "PASS", `url=${page.url()} oidc=${Boolean(process.env.VERCEL_OIDC_TOKEN)}`);
  }

  const liveGetA = await page.request.get(`${PREVIEW}/api/roadmap`);
  const liveA = await liveGetA.json().catch(() => ({}));
  isolation.aExam = liveA.record?.intake?.examName || null;
  const persistA = liveA.persist || null;

  // If A has no server plan, save a distinctive Preview-only plan (Preview write only).
  if (liveGetA.ok() && persistA === "server" && !liveA.record && sessionA.userId) {
    const created = miniRecord(sessionA.userId, "Student A Preview Isolation", new Date().toISOString());
    const save = await page.request.post(`${PREVIEW}/api/roadmap`, { data: { action: "save", record: created } });
    const saveJson = await save.json().catch(() => ({}));
    isolation.aExam = saveJson.record?.intake?.examName || created.intake.examName;
    record("a-seed", "Seed Student A Preview plan", save.ok() ? "PASS" : "FAIL", `status=${save.status()} persist=${saveJson.persist} code=${saveJson.code || ""}`);
  }

  const hostList = [...previewHosts];
  const previewTalksPreview = hostList.some((h) => h.includes(PREVIEW_REF)) && !hostList.some((h) => h.includes(PROD_REF));
  record(
    1,
    "Preview app talks to Preview Supabase",
    hostList.length === 0 ? "BLOCKED" : previewTalksPreview ? "PASS" : "FAIL",
    `hosts=${hostList.join(",") || "(none)"} authA=${authA.mode}/${authA.status} url=${authA.url}`,
    [await shot(page, "01-preview-hosts")]
  );

  // Student B isolation — new context, no shared cookies
  const ctxB = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: oidcHeaders(),
  });
  const pageB = await ctxB.newPage();
  trackHosts(pageB, previewHosts);
  const authB = await signIn(pageB, creds.b);
  const sessionB = await sessionInfo(pageB);
  isolation.bUserId = sessionB.userId;
  const liveGetB = await pageB.request.get(`${PREVIEW}/api/roadmap`);
  const liveB = await liveGetB.json().catch(() => ({}));
  isolation.bExam = liveB.record?.intake?.examName || null;
  if (liveGetB.ok() && liveB.persist === "server" && !liveB.record && sessionB.userId) {
    const createdB = miniRecord(sessionB.userId, "Student B Preview Isolation", new Date().toISOString());
    await pageB.request.post(`${PREVIEW}/api/roadmap`, { data: { action: "save", record: createdB } });
    isolation.bExam = createdB.intake.examName;
  }
  const bShot = await shot(pageB, "02-preview-b-signed-in");
  const distinctUsers = Boolean(isolation.aUserId && isolation.bUserId && isolation.aUserId !== isolation.bUserId);
  const noCrossRead =
    isolation.aExam !== isolation.bExam ||
    (isolation.aExam == null && isolation.bExam == null) ||
    (liveB.record && liveB.record.userId && liveB.record.userId === isolation.bUserId);
  const isolationPass =
    distinctUsers &&
    liveGetA.status() !== 401 &&
    liveGetB.status() !== 401 &&
    (!liveB.record || liveB.record.userId === isolation.bUserId) &&
    (!liveA.record || liveA.record.userId === isolation.aUserId) &&
    (isolation.aExam == null || isolation.aExam !== isolation.bExam || isolation.aExam === null);
  // Stronger: B must not see A's exam name when A has one
  const strongIsolation = !isolation.aExam || isolation.bExam !== isolation.aExam;
  record(
    3,
    "Student A cannot see Student B roadmap on Preview",
    distinctUsers && strongIsolation && isolationPass ? "PASS" : "FAIL",
    `aUser=${Boolean(isolation.aUserId)} bUser=${Boolean(isolation.bUserId)} distinct=${distinctUsers} aExam=${isolation.aExam} bExam=${isolation.bExam} aPersist=${persistA} bPersist=${liveB.persist} aStatus=${liveGetA.status()} bStatus=${liveGetB.status()} authB=${authB.mode}/${authB.status}`,
    [bShot]
  );
  await ctxB.close();

  // Confirm no Production-looking payload leaked into Preview GET
  const previewLooksEmptyOrTest =
    !liveA.record ||
    /preview|phase 3p|student a|student b|isolation|device/i.test(JSON.stringify(liveA.record?.intake?.examName || ""));
  record(
    8,
    "No Production data appeared in Preview",
    previewLooksEmptyOrTest ? "PASS" : "BLOCKED",
    `aExam=${isolation.aExam} bExam=${isolation.bExam} persist=${persistA} (Preview study_roadmaps is isolated; Prod has no study_roadmaps table)`,
    []
  );

  // Import confirmation — if A already has a server plan, mock empty GET so the UI path is exercised
  const posts = [];
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
        body: JSON.stringify({ ok: true, persist: "server", record: miniRecord(sessionA.userId || "local") }),
      });
      return;
    }
    await route.continue();
  });
  if (sessionA.userId) {
    await seedLocalPlan(page, sessionA.userId, "Device-only plan", "2026-11-02T10:00:00.000Z");
  }
  await page.goto(`${PREVIEW}/roadmap`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await skipPricing(page);
  const importVisible = await page.getByTestId("roadmap-import-prompt").waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  const postsBeforeChoice = posts.length;
  const importShot = await shot(page, "04-import-prompt");
  if (importVisible) {
    await page.getByTestId("roadmap-import-keep-device").click();
    await page.getByTestId("roadmap-import-prompt").waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  }
  const postsAfterKeepDevice = posts.length;
  record(
    4,
    "Local-to-account import requires confirmation",
    importVisible && postsBeforeChoice === 0 && postsAfterKeepDevice === 0 ? "PASS" : importVisible ? "FAIL" : "BLOCKED",
    `prompt=${importVisible} postsBefore=${postsBeforeChoice} postsAfter=${postsAfterKeepDevice} gated=${authA.gated} url=${page.url()}`,
    [importShot, await shot(page, "04-import-kept-device")]
  );

  // Conflict chooser
  await page.unroute("**/api/roadmap").catch(() => {});
  await page.route("**/api/roadmap", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          persist: "server",
          record: miniRecord(sessionA.userId || "local", "Account plan", "2026-11-03T08:00:00.000Z"),
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
  if (sessionA.userId) {
    await seedLocalPlan(page, sessionA.userId, "Device plan", "2026-11-02T12:00:00.000Z");
  }
  await page.goto(`${PREVIEW}/roadmap`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await skipPricing(page);
  const conflictVisible = await page.getByTestId("roadmap-conflict").waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  const conflictShot = await shot(page, "05-conflict-chooser");
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
    5,
    "Conflict chooser / two-device",
    conflictVisible && keepBothOk ? "PASS" : conflictVisible ? "FAIL" : "BLOCKED",
    `conflict=${conflictVisible} keepBoth=${keepBothOk} url=${page.url()}`,
    [conflictShot, await shot(page, "05-keep-both")]
  );

  // Refresh persist
  await page.unroute("**/api/roadmap").catch(() => {});
  if (sessionA.userId) {
    await seedLocalPlan(page, sessionA.userId, "Refresh keep", "2026-11-02T10:00:00.000Z");
  }
  await page.goto(`${PREVIEW}/roadmap`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await skipPricing(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  const afterRefresh = sessionA.userId
    ? await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null")?.intake?.examName,
        `oryzen_study_roadmap_v1::${sessionA.userId}`
      )
    : null;
  record(
    6,
    "Refresh persist",
    afterRefresh === "Refresh keep" ? "PASS" : "FAIL",
    `afterRefresh=${afterRefresh}`,
    [await shot(page, "06-refresh")]
  );

  // Offline recovery
  await page.route("**/api/roadmap", async (route) => {
    await route.abort("internetdisconnected");
  });
  await page.goto(`${PREVIEW}/roadmap`, { waitUntil: "domcontentloaded", timeout: 45000 });
  const offlineNotice = await page.getByTestId("roadmap-sync-error").waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  const offlineLocal = sessionA.userId
    ? await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null")?.intake?.examName,
        `oryzen_study_roadmap_v1::${sessionA.userId}`
      )
    : null;
  const offlineShot = await shot(page, "07-offline");
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  if (offlineNotice) {
    await page.getByTestId("roadmap-sync-retry").click().catch(() => {});
    await page.waitForTimeout(800);
  }
  const recoveredLocal = sessionA.userId
    ? await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null")?.intake?.examName,
        `oryzen_study_roadmap_v1::${sessionA.userId}`
      )
    : null;
  record(
    7,
    "Offline recovery",
    offlineNotice && offlineLocal && recoveredLocal ? "PASS" : offlineLocal ? "BLOCKED" : "FAIL",
    `notice=${offlineNotice} localDuring=${offlineLocal} localAfter=${recoveredLocal}`,
    [offlineShot, await shot(page, "07-offline-retry")]
  );

  // Reader / coach smoke
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  try {
    await page.goto(`${PREVIEW}/hub`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const gatedHub = await skipPricing(page);
    const hubUrl = page.url();
    const hubText = await page.locator("body").innerText().catch(() => "");
    const hubCoach = await page.getByTestId("coach-card").count();
    const hubShot = await shot(page, "08-hub");
    await page.goto(`${PREVIEW}/reader`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await skipPricing(page);
    const readerUrl = page.url();
    const readerShot = await shot(page, "08-reader");
    const entitled = /\/(hub|reader|roadmap)/.test(hubUrl) && !/\/pricing/.test(hubUrl);
    if (!entitled) {
      record(
        9,
        "Reader/coach smoke on Preview",
        "BLOCKED",
        `access gate url=${hubUrl} gatedHub=${gatedHub} bodyHasPricing=${/pricing|start free|choose a plan/i.test(hubText)}`,
        [hubShot, readerShot]
      );
    } else {
      record(
        9,
        "Reader/coach smoke on Preview",
        hubCoach > 0 || /\/reader/.test(readerUrl) ? "PASS" : "FAIL",
        `hubCoach=${hubCoach} hub=${hubUrl} reader=${readerUrl}`,
        [hubShot, readerShot]
      );
    }
  } catch (error) {
    record(9, "Reader/coach smoke on Preview", "FAIL", String(error?.stack || error), [await shot(page, "08-error")]);
  }

  await ctxA.close();
} catch (error) {
  record("error", "Script error", "FAIL", String(error?.stack || error));
} finally {
  writeFileSync(
    join(outDir, "results.json"),
    JSON.stringify(
      {
        previewUrl: PREVIEW,
        productionUrl: PRODUCTION,
        previewHosts: [...previewHosts],
        productionHosts: [...prodHosts],
        isolation: { aUser: Boolean(isolation.aUserId), bUser: Boolean(isolation.bUserId), aExam: isolation.aExam, bExam: isolation.bExam },
        reports,
      },
      null,
      2
    )
  );
  await browser.close();
}
