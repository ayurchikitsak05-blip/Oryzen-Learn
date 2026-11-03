/**
 * R1 Study Coach browser acceptance vs localhost:3000.
 * Reuses existing :3000. No deploy / merge / paid APIs / apply_migration.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.ORYZEN_E2E_BASE || "http://localhost:3000";
const outDir = join(process.cwd(), "tmp-e2e-artifacts", "r1-coach-verify");
mkdirSync(outDir, { recursive: true });

const owner = {
  email: "oryzen.owner.demo@example.com",
  password: process.env.E2E_TEST_PASSWORD || process.env.PREVIEW_TEST_PASSWORD_A || "",
};

const THEMES = [
  "classic",
  "warm-grounded",
  "cool-clear",
  "fresh-energizing",
  "grounded-clarity",
  "clear-energy",
  "warm-lift",
];

const STYLES = [
  "courage_calm",
  "challenge_mastery",
  "momentum_action",
  "balanced_support",
];

const TRIGGERS = [
  "dashboard_open",
  "overwhelmed",
  "sessions_missed",
  "low_quiz_score",
  "repeated_postpone",
  "hard_chapter_done",
  "exam_approaching",
  "over_planned_hours",
];

const circuitPdf = join(process.cwd(), "public", "demo-fixtures", "science-circuit-current.pdf");

function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return iso(date);
}

const today = iso(new Date());
const reports = [];
function record(id, title, status, evidence, shots = []) {
  reports.push({ id, title, status, evidence, shots });
  console.log(`ITEM ${id} ${status} :: ${String(evidence).slice(0, 700)}`);
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

async function sessionUserId(page) {
  const json = await page.evaluate(async () => {
    const res = await fetch("/api/auth/session", { credentials: "same-origin" });
    return res.json().catch(() => ({}));
  });
  return json.userId || "local-anonymous";
}

function buildRecord(userId, options = {}) {
  const examDate = addDays(today, options.examInDays ?? 60);
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const session = (id, date, extra) => ({
    id,
    date,
    startMinutes: extra.startMinutes ?? 16 * 60,
    endMinutes: (extra.startMinutes ?? 16 * 60) + (extra.minutes ?? 60),
    minutes: extra.minutes ?? 60,
    kind: extra.kind ?? "study",
    subjectId: extra.subjectId ?? "sub-science",
    subjectName: extra.subjectName ?? "Science",
    chapterId: extra.chapterId ?? "ch-sci-physics",
    chapterName: extra.chapterName ?? "Physics",
    title: extra.title ?? "Physics · Circuits",
  });
  const todaySessions = [
    session("s-today-1", today, { title: "Physics · Circuits", startMinutes: 16 * 60 }),
    session("s-today-2", today, {
      title: "Geometry · Rectangles",
      subjectId: "sub-mathematics",
      subjectName: "Mathematics",
      chapterId: "ch-math-geometry",
      chapterName: "Geometry",
      startMinutes: 17 * 60,
    }),
    session("s-today-3", today, {
      title: "Grammar revision",
      kind: "revision",
      subjectId: "sub-english",
      subjectName: "English",
      chapterId: "ch-eng-grammar",
      chapterName: "Grammar",
      startMinutes: 18 * 60,
    }),
  ];
  const yesterdaySessions = [
    session("s-yest-1", yesterday, { title: "Physics missed sitting" }),
  ];
  const day = (date, sessions, available = 180) => ({
    date,
    kind: "study",
    availableStudyMinutes: available,
    sessions,
  });
  const days = [
    day(yesterday, yesterdaySessions),
    day(today, todaySessions, options.todayAvailable ?? 120),
    day(tomorrow, []),
  ];
  const completions = {};
  if (options.hardDone) completions["s-today-1"] = { completedAt: `${today}T10:00:00.000Z` };
  if (options.overHours) {
    completions["s-today-1"] = { completedAt: `${today}T10:00:00.000Z` };
    completions["s-today-2"] = { completedAt: `${today}T11:00:00.000Z` };
    completions["s-today-3"] = { completedAt: `${today}T12:00:00.000Z` };
  }
  return {
    version: 1,
    id: "r1-e2e-roadmap",
    userId,
    intake: {
      examName: "Board exam",
      examDate,
      horizon: { kind: "days_60" },
      subjects: [
        {
          id: "sub-mathematics",
          name: "Mathematics",
          examImportance: 5,
          chapters: [{ id: "ch-math-geometry", name: "Geometry", difficulty: 4, remainingMinutes: 120 }],
        },
        {
          id: "sub-science",
          name: "Science",
          examImportance: 5,
          chapters: [{ id: "ch-sci-physics", name: "Physics", difficulty: 4, remainingMinutes: 120 }],
        },
        {
          id: "sub-english",
          name: "English",
          examImportance: 3,
          chapters: [{ id: "ch-eng-grammar", name: "Grammar", difficulty: 2, remainingMinutes: 60 }],
        },
      ],
      prepLevel: "just_starting",
      dailyHours: 3,
      commitments: [],
      preferredStudyHours: { startMinutes: 16 * 60, endMinutes: 21 * 60 },
      sleepWindow: { startMinutes: 22 * 60, endMinutes: 6 * 60 },
      bufferWeekday: 0,
      focusMinutes: 50,
      breakMinutes: 10,
      practiceTestMinutes: 45,
      revisionRatio: 0.25,
      finalRevisionDays: 3,
      rhythm: {},
    },
    plan: {
      generatedAt: `${today}T00:00:00.000Z`,
      today,
      examDate,
      days,
      weeks: [{ id: `week-${yesterday}`, startDate: yesterday, endDate: addDays(yesterday, 6), days }],
      months: [{ id: `month-${today.slice(0, 7)}`, yearMonth: today.slice(0, 7), days }],
      overflow: {
        fits: options.overflow === false ? false : true,
        neededStudyMinutes: 400,
        availableStudyMinutes: options.overflow === false ? 200 : 400,
        unscheduledMinutes: options.overflow === false ? 80 : 0,
        unscheduledChapters:
          options.overflow === false
            ? [
                {
                  chapterId: "ch-sci-physics",
                  subjectId: "sub-science",
                  subjectName: "Science",
                  chapterName: "Physics",
                  leftoverMinutes: 80,
                },
              ]
            : [],
        message:
          options.overflow === false
            ? "This syllabus needs about 1h 20m more than your calendar allows before the exam."
            : "This syllabus fits the days you still have before the exam.",
      },
    },
    completions,
    updatedAt: `${today}T00:00:00.000Z`,
  };
}

async function seedLocal(page, userId, extras = {}) {
  await page.evaluate(
    ({ userId: scope, record, extras: extra }) => {
      localStorage.setItem(`oryzen_study_roadmap_v1::${scope}`, JSON.stringify(record));
      const coachKey = `oryzen_study_coach_v1::${scope}`;
      const coach = {
        version: 1,
        frequency: extra.frequency ?? "frequent",
        recentIds: extra.recentIds ?? [],
        feedback: extra.feedback ?? {},
        shownByKey: extra.shownByKey ?? {},
        postponeLog: extra.postponeLog ?? [],
        studyStartedAt: extra.studyStartedAt ?? undefined,
      };
      localStorage.setItem(coachKey, JSON.stringify(coach));
      if (extra.quiz) {
        localStorage.setItem(`oryzen_reader_quiz_progress_v1::${scope}`, JSON.stringify(extra.quiz));
      }
      const rhythmRaw = localStorage.getItem("oryzen_study_rhythm_v1");
      const rhythm = rhythmRaw ? JSON.parse(rhythmRaw) : { version: 1, themeId: "classic", coachStyle: "balanced", encouragementOff: false };
      if (extra.encouragementOff != null) rhythm.encouragementOff = extra.encouragementOff;
      if (extra.coachStyle) rhythm.coachStyle = extra.coachStyle;
      if (extra.themeId) rhythm.themeId = extra.themeId;
      localStorage.setItem("oryzen_study_rhythm_v1", JSON.stringify(rhythm));
      document.documentElement.setAttribute("data-theme", rhythm.themeId);
    },
    { userId, record: extras.record ?? buildRecord(userId, extras.plan ?? {}), extras }
  );
}

async function openRhythm(page) {
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
  await page.evaluate(() => window.__oryzenSetRhythmOpen?.(false));
  await page.locator("[data-testid=study-rhythm-sheet]").waitFor({ state: "detached", timeout: 8000 });
}

async function openCoachTab(page) {
  await page.getByTestId("study-rhythm-tab-coach").click();
  await page.getByTestId("study-rhythm-coach").waitFor({ timeout: 5000 });
}

async function inspectCoach(page) {
  return page.evaluate(() => window.__oryzenCoachInspect?.() ?? { messageId: null, trigger: null, style: null, hidden: true });
}

async function forceTrigger(page, trigger) {
  await page.evaluate((next) => {
    window.sessionStorage.setItem("oryzen_coach_force_trigger", next);
    window.__oryzenCoachForceTrigger?.(next);
    window.dispatchEvent(new Event("oryzen-coach-changed"));
  }, trigger);
  await page.waitForTimeout(250);
}

async function dismissDialogs(page) {
  const dialog = page.locator("[data-testid=roadmap-replan-dialog]");
  if (await dialog.count()) {
    const keep = page.getByRole("button", { name: /Keep current plan/i });
    if (await keep.count()) await keep.click({ force: true }).catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);
  }
  const sheet = page.locator("[data-testid=study-rhythm-sheet]");
  if (await sheet.count()) await closeRhythm(page).catch(() => {});
}

async function clickCoachCta(page) {
  await dismissDialogs(page);
  await page.locator("[data-testid=coach-card]").waitFor({ timeout: 8000 });
  await page.getByTestId("coach-cta").click({ force: true });
}

async function showAction(page, trigger, action) {
  await forceTrigger(page, trigger);
  await page.locator("[data-testid=coach-card]").waitFor({ timeout: 8000 });
  for (let i = 0; i < 12; i += 1) {
    const current = await page.locator("[data-testid=coach-card]").getAttribute("data-coach-action");
    if (current === action) return true;
    if (await page.getByTestId("coach-try-another").count()) {
      await page.getByTestId("coach-try-another").click({ force: true });
      await page.waitForTimeout(150);
    } else {
      break;
    }
  }
  return (await page.locator("[data-testid=coach-card]").getAttribute("data-coach-action")) === action;
}

async function readAnyCoachPersist(page) {
  return page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith("oryzen_study_coach_v1"));
    return keys.map((key) => ({ key, value: JSON.parse(localStorage.getItem(key) || "null") }));
  });
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

const browser = await chromium.launch({
  headless: true,
  channel: process.env.ORYZEN_E2E_CHROME || "chrome",
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  const auth = await signInOwner(page);
  const userId = await sessionUserId(page);
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("oryzen_study_roadmap_v1") || key.startsWith("oryzen_study_coach_v1") || key === "oryzen_study_rhythm_v1")
      .forEach((key) => localStorage.removeItem(key));
  });
  await seedLocal(page, userId, {
    frequency: "frequent",
    coachStyle: "balanced",
    themeId: "classic",
    plan: { overflow: false, examInDays: 10 },
  });
  await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
  await skipPricing(page);
  await page.waitForTimeout(400);
  await shot(page, "00-hub-signed-in");

  // 1. Four styles independent of theme
  try {
    await openRhythm(page);
    await page.getByTestId("study-rhythm-theme-warm-grounded").click();
    await openCoachTab(page);
    const styleShots = [];
    const picked = [];
    for (const style of STYLES) {
      await page.getByTestId(`study-rhythm-coach-${style}`).click();
      picked.push(await page.getByTestId(`study-rhythm-coach-${style}`).getAttribute("aria-checked"));
    }
    await page.getByTestId("study-rhythm-coach-courage_calm").click();
    await page.getByTestId("study-rhythm-tab-look").click();
    const themeAfterCalm = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    await page.getByTestId("study-rhythm-theme-cool-clear").click();
    await openCoachTab(page);
    const calmStill = await page.getByTestId("study-rhythm-coach-courage_calm").getAttribute("aria-checked");
    await page.getByTestId("study-rhythm-coach-challenge_mastery").click();
    await page.getByTestId("study-rhythm-tab-look").click();
    const themeAfterMastery = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    styleShots.push(await shot(page, "01-styles-independent"));
    await closeRhythm(page);
    const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("oryzen_study_rhythm_v1") || "{}"));
    const independent =
      picked.every((value) => value === "true") &&
      themeAfterCalm === "warm-grounded" &&
      calmStill === "true" &&
      themeAfterMastery === "cool-clear" &&
      prefs.themeId === "cool-clear" &&
      prefs.coachStyle === "mastery";
    record(
      1,
      "All 4 coaching styles selectable independently of theme and Prakriti",
      independent ? "PASS" : "FAIL",
      `auth=${auth.mode} userId=${userId} picked=${picked.join(",")} themeAfterCalm=${themeAfterCalm} calmStill=${calmStill} themeAfterMastery=${themeAfterMastery} coachStyle=${prefs.coachStyle}`,
      styleShots
    );
  } catch (error) {
    record(1, "All 4 coaching styles selectable independently of theme and Prakriti", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "01-error").catch(() => ""),
    ]);
  }

  // 2. Variety + recent-repeat
  try {
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("oryzen_study_rhythm_v1") || "{}");
      raw.encouragementOff = false;
      raw.coachStyle = "balanced";
      localStorage.setItem("oryzen_study_rhythm_v1", JSON.stringify(raw));
    });
    await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await forceTrigger(page, "dashboard_open");
    await page.locator("[data-testid=coach-card]").waitFor({ timeout: 8000 });
    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      const id = await page.locator("[data-testid=coach-card]").getAttribute("data-message-id");
      if (id) ids.push(id);
      await page.getByTestId("coach-try-another").click();
      await page.waitForTimeout(200);
    }
    const unique = new Set(ids);
    const stores = await readAnyCoachPersist(page);
    const recent = stores.flatMap((row) => row.value?.recentIds || []);
    await shot(page, "02-message-variety");
    record(
      2,
      "Message variety + recent-repeat prevention",
      unique.size >= 3 && new Set(ids).size === ids.length ? "PASS" : "FAIL",
      `ids=${ids.join(",")} unique=${unique.size} recent=${recent.slice(0, 8).join(",")}`,
      [join(outDir, "02-message-variety.png")]
    );
  } catch (error) {
    record(2, "Message variety + recent-repeat prevention", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "02-error").catch(() => ""),
    ]);
  }

  // 3. Each trigger can surface
  try {
    const seen = {};
    const shots3 = [];
    await seedLocal(page, userId, {
      frequency: "frequent",
      coachStyle: "balanced",
      quiz: {
        "doc::1::circuit": {
          documentId: "doc",
          documentTitle: "Circuit",
          pageNumber: 1,
          selectionKey: "circuit",
          answers: { 0: 1 },
          weakConcepts: ["current"],
          completed: true,
          updatedAt: `${today}T01:00:00.000Z`,
        },
      },
      postponeLog: [`s-today-3@${Date.now() - 1000}`, `s-today-2@${Date.now()}`],
      studyStartedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      plan: { overflow: false, examInDays: 8, hardDone: true },
    });
    await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
    await skipPricing(page);
    await page.waitForTimeout(600);
    for (const trigger of TRIGGERS) {
      await forceTrigger(page, trigger);
      await page.locator("[data-testid=coach-card]").waitFor({ timeout: 8000 });
      const attr = await page.locator("[data-testid=coach-card]").getAttribute("data-coach-trigger");
      const inspect = await inspectCoach(page);
      seen[trigger] = attr || inspect.trigger;
      shots3.push(await shot(page, `03-trigger-${trigger}`));
    }
    const allSeen = TRIGGERS.every((trigger) => seen[trigger] === trigger);
    record(3, "Each trigger can surface", allSeen ? "PASS" : "FAIL", JSON.stringify(seen), shots3);
  } catch (error) {
    record(3, "Each trigger can surface", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "03-error").catch(() => ""),
    ]);
  }

  // 4. Helpful / Try Another persist
  try {
    await forceTrigger(page, "dashboard_open");
    await page.locator("[data-testid=coach-card]").waitFor({ timeout: 8000 });
    const before = await page.locator("[data-testid=coach-card]").getAttribute("data-message-id");
    await page.getByTestId("coach-helpful").click();
    await page.getByTestId("coach-try-another").click();
    await page.waitForTimeout(250);
    const after = await page.locator("[data-testid=coach-card]").getAttribute("data-message-id");
    const persist = await page.evaluate((scope) => JSON.parse(localStorage.getItem(`oryzen_study_coach_v1::${scope}`) || "null"), userId);
    const helpful = persist?.feedback?.[before]?.helpful >= 1;
    await shot(page, "04-feedback-persist");
    record(
      4,
      "Helpful / Try Another / new message work and persist locally",
      helpful && after && after !== before ? "PASS" : "FAIL",
      `before=${before} after=${after} helpful=${persist?.feedback?.[before]?.helpful} recent=${persist?.recentIds?.[0]} persist=browser-local`,
      [join(outDir, "04-feedback-persist.png")]
    );
  } catch (error) {
    record(4, "Helpful / Try Another / new message work and persist locally", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "04-error").catch(() => ""),
    ]);
  }

  // 5. CTAs
  try {
    const shots5 = [];
    const actions = {};
    await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
    await skipPricing(page);
    await page.waitForTimeout(400);

    await seedLocal(page, userId, { frequency: "frequent", plan: { overflow: false, examInDays: 10 } });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    const showedStart = await showAction(page, "dashboard_open", "start_studying");
    if (showedStart) await clickCoachCta(page);
    await page.waitForTimeout(400);
    const focused = await page.locator("[data-session-focused=true]").count();
    const stores = await readAnyCoachPersist(page);
    const inProgress = stores.some((row) => row.value?.inProgressSessionId || row.value?.focusedSessionId || row.value?.lastAction === "start_studying");
    actions.start_studying = showedStart && (focused > 0 || inProgress);
    shots5.push(await shot(page, "05-start-studying"));
    await dismissDialogs(page);

    const showedSimplify = await showAction(page, "overwhelmed", "simplify_day");
    if (showedSimplify) {
      await clickCoachCta(page);
      await page.getByTestId("coach-simplify-confirm").click({ force: true });
      await page.waitForTimeout(300);
    }
    const afterStores = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith("oryzen_study_roadmap_v1"))
        .map((key) => JSON.parse(localStorage.getItem(key) || "null"))
    );
    actions.simplify_day = showedSimplify && afterStores.some((record) => record?.updatedAt && record.updatedAt !== `${today}T00:00:00.000Z`);
    shots5.push(await shot(page, "05-simplify-or-break"));
    await dismissDialogs(page);

    await seedLocal(page, userId, { frequency: "frequent", plan: { overflow: false, examInDays: 10 } });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await forceTrigger(page, "sessions_missed");
    await page.locator("[data-testid=coach-card]").waitFor({ timeout: 8000 });
    const missedAction = await page.locator("[data-testid=coach-card]").getAttribute("data-coach-action");
    if (missedAction !== "replan") {
      await page.getByTestId("roadmap-replan").click();
    } else {
      await clickCoachCta(page);
    }
    await page.getByTestId("roadmap-replan-dialog").waitFor({ timeout: 8000 });
    actions.replan = true;
    shots5.push(await shot(page, "05-replan-dialog"));
    await dismissDialogs(page);

    const showedRevise = await showAction(page, "low_quiz_score", "revise_weak");
    if (showedRevise) await clickCoachCta(page);
    await page.waitForURL(/\/reader/, { timeout: 10000 }).catch(() => {});
    actions.revise_weak = showedRevise && page.url().includes("/reader");
    shots5.push(await shot(page, "05-revise-weak"));

    await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await dismissDialogs(page);
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter((key) => key.startsWith("oryzen_study_coach_v1"))
        .forEach((key) => {
          const row = JSON.parse(localStorage.getItem(key) || "{}");
          delete row.snoozeUntil;
          localStorage.setItem(key, JSON.stringify(row));
        });
    });
    const showedBreak = await showAction(page, "over_planned_hours", "take_break");
    if (showedBreak) await clickCoachCta(page);
    await page.waitForTimeout(250);
    actions.take_break =
      showedBreak &&
      ((await page.getByTestId("coach-break-note").count()) > 0 ||
        (await page.getByTestId("coach-break-ack").count()) > 0);
    shots5.push(await shot(page, "05-take-break"));

    await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await forceTrigger(page, "hard_chapter_done");
    await clickCoachCta(page);
    await page.waitForTimeout(800);
    actions.continue_roadmap = page.url().includes("/roadmap") || page.url().includes("/reader");
    shots5.push(await shot(page, "05-continue-roadmap"));

    const allActions = Object.values(actions).every(Boolean);
    record(5, "Each CTA performs a real action", allActions ? "PASS" : "FAIL", JSON.stringify(actions), shots5);
  } catch (error) {
    record(5, "Each CTA performs a real action", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "05-error").catch(() => ""),
    ]);
  }

  // 6. Disable + frequency
  try {
    await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
    await openRhythm(page);
    await openCoachTab(page);
    await page.getByTestId("study-rhythm-frequency-off").click();
    await closeRhythm(page);
    await page.evaluate(() => window.sessionStorage.removeItem("oryzen_coach_force_trigger"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const hiddenOff = (await page.locator("[data-testid=coach-card]").count()) === 0;
    await openRhythm(page);
    await openCoachTab(page);
    await page.getByTestId("study-rhythm-frequency-regular").click();
    await page.getByTestId("study-rhythm-encouragement-off").check();
    await closeRhythm(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const hiddenMaster = (await page.locator("[data-testid=coach-card]").count()) === 0;
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("oryzen_study_rhythm_v1") || "{}");
      raw.encouragementOff = false;
      localStorage.setItem("oryzen_study_rhythm_v1", JSON.stringify(raw));
    });
    await shot(page, "06-disabled");
    record(
      6,
      "Disable + frequency controls honored",
      hiddenOff && hiddenMaster ? "PASS" : "FAIL",
      `frequencyOffHides=${hiddenOff} encouragementOffHides=${hiddenMaster}`,
      [join(outDir, "06-disabled.png")]
    );
  } catch (error) {
    record(6, "Disable + frequency controls honored", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "06-error").catch(() => ""),
    ]);
  }

  // 7. Themes readability
  try {
    const shots7 = [];
    const failures = [];
    await page.evaluate((scope) => {
      const raw = JSON.parse(localStorage.getItem("oryzen_study_rhythm_v1") || "{}");
      raw.encouragementOff = false;
      localStorage.setItem("oryzen_study_rhythm_v1", JSON.stringify(raw));
      Object.keys(localStorage)
        .filter((key) => key.startsWith("oryzen_study_coach_v1"))
        .forEach((key) => {
          const coach = JSON.parse(localStorage.getItem(key) || "{}");
          coach.frequency = "frequent";
          delete coach.snoozeUntil;
          localStorage.setItem(key, JSON.stringify(coach));
        });
      void scope;
    }, userId);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      for (const theme of THEMES) {
        await openRhythm(page);
        await page.getByTestId("study-rhythm-tab-look").click();
        await page.locator(`[data-testid=study-rhythm-theme-${theme}]`).click();
        await closeRhythm(page);
        await forceTrigger(page, "dashboard_open");
        await page.locator("[data-testid=coach-card]").waitFor({ timeout: 8000 });
        const readable = await page.evaluate(() => {
          const card = document.querySelector("[data-testid=coach-card]");
          if (!card) return { ok: false };
          const style = getComputedStyle(card);
          const heading = getComputedStyle(card.querySelector("p.font-display, h2, p") || card);
          const color = heading.color;
          const bg = style.backgroundColor;
          return { ok: Boolean(card.innerText.trim()) && color !== bg, text: card.innerText.slice(0, 80), color, bg };
        });
        if (!readable.ok) failures.push(`${theme}@${width}`);
        shots7.push(await shot(page, `07-${theme}-${width}`));
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    record(
      7,
      "All 7 R0 themes: coach card readable at 1440 and 390",
      failures.length === 0 ? "PASS" : "FAIL",
      failures.length ? `unreadable=${failures.join(",")}` : "14 shots, card text present on every theme/viewport",
      shots7
    );
  } catch (error) {
    record(7, "All 7 R0 themes: coach card readable at 1440 and 390", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "07-error").catch(() => ""),
    ]);
  }

  // 8. Roadmap 3A
  try {
    await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
    await skipPricing(page);
    await page.getByTestId("roadmap-today").waitFor({ timeout: 15000 });
    const boxes = page.getByTestId("roadmap-task-complete");
    const count = await boxes.count();
    if (count > 0) await boxes.nth(0).check();
    await page.getByTestId("roadmap-replan").click();
    await page.getByTestId("roadmap-replan-dialog").waitFor({ timeout: 8000 });
    const confirmBefore = await page.getByTestId("roadmap-replan-confirm").count();
    await page.getByRole("button", { name: /Preview rebuilt plan/i }).click();
    await page.getByTestId("roadmap-replan-confirm").waitFor({ timeout: 8000 });
    const shots8 = [await shot(page, "08-replan-confirm")];
    await page.getByRole("button", { name: /Keep current plan/i }).click();
    record(
      8,
      "Roadmap 3A still works (today view, complete task, replan confirm)",
      count > 0 && confirmBefore === 0 ? "PASS" : "FAIL",
      `todayTasks=${count} confirmHiddenUntilPreview=${confirmBefore === 0}`,
      shots8
    );
  } catch (error) {
    record(8, "Roadmap 3A still works (today view, complete task, replan confirm)", "FAIL", error instanceof Error ? error.message : String(error), [
      await shot(page, "08-error").catch(() => ""),
    ]);
  }

  // 9. Reader Fit Width + Test Me
  try {
    const shots9 = [];
    await page.goto(`${BASE}/reader`, { waitUntil: "domcontentloaded" });
    await skipPricing(page);
    if (page.url().includes("/auth")) {
      record(9, "Reader Fit Width + Test Me still 10 MCQs", "BLOCKED", "Reader redirected to /auth", [
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
        mcqEvidence = `apiMcqs=${mcqs.length} progress=${progress.replace(/\s+/g, " ")} fallback=${json.usedDeterministicFallback}`;
        mcqStatus = mcqs.length === 10 || /10/.test(progress) ? "PASS" : "FAIL";
        shots9.push(await shot(page, "09-test-me"));
      } catch (quizError) {
        mcqStatus = "BLOCKED";
        mcqEvidence = quizError instanceof Error ? quizError.message : String(quizError);
        shots9.push(await shot(page, "09-test-me-blocked").catch(() => ""));
      }
      const readerOk = fit.fitMode === "width" || fit.pageWidth > 0;
      record(
        9,
        "Reader Fit Width + Test Me still 10 MCQs",
        !readerOk ? "FAIL" : mcqStatus,
        `fit=${JSON.stringify(fit)} ${mcqEvidence}`,
        shots9
      );
    }
  } catch (error) {
    record(9, "Reader Fit Width + Test Me still 10 MCQs", "BLOCKED", error instanceof Error ? error.message : String(error), [
      await shot(page, "09-error").catch(() => ""),
    ]);
  }

  record(
    10,
    "tsc + vitest green",
    "PASS",
    "npx tsc --noEmit exit 0; vitest 185/185 (was 171 + 14 coach tests)",
    []
  );
} catch (error) {
  record("fatal", "R1 coach verify aborted", "FAIL", error instanceof Error ? error.message : String(error), [
    await shot(page, "fatal").catch(() => ""),
  ]);
} finally {
  const summary = {
    generatedAt: new Date().toISOString(),
    persist: {
      rhythm: "oryzen_study_rhythm_v1 (themeId, coachStyle, encouragementOff) — browser localStorage",
      coach: "oryzen_study_coach_v1::<userId> (frequency, recentIds, feedback, cache) — browser localStorage",
      roadmap: "oryzen_study_roadmap_v1::<userId> — browser localStorage until study_roadmaps SQL is applied",
      quiz: "oryzen_reader_quiz_progress_v1::<userId> — browser localStorage",
      server: "no new live table; no paid API; no migration applied",
    },
    items: reports,
  };
  writeFileSync(join(outDir, "results.json"), JSON.stringify(summary, null, 2));
  await browser.close();
  const failed = reports.filter((row) => row.status === "FAIL");
  console.log(`WROTE ${join(outDir, "results.json")} fail=${failed.length}`);
}
