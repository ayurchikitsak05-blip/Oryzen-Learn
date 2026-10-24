import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEPLOYMENT = "dpl_5oDkDbmfrYqzAT1kN6zoyVp1zuFC";
const SCOPE = "ayurchikitsak05-8316s-projects";
const cookieJar = join(tmpdir(), "oryzen-quality-retest-models.cookies");
const envPath = new URL("../.env.preview.local", import.meta.url);

function loadPreviewEnv() {
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    env[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return env;
}

function vercelCurl(path, extraArgs = []) {
  const args = [
    "curl",
    path,
    "--deployment",
    DEPLOYMENT,
    "--scope",
    SCOPE,
    "--",
    "--silent",
    "--show-error",
    "--max-time",
    "45",
    "--cookie",
    cookieJar,
    "--cookie-jar",
    cookieJar,
    ...extraArgs,
  ];
  const stdout = execFileSync("vercel", args, {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  const jsonStart = stdout.indexOf("{");
  const body = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
  try {
    return JSON.parse(body);
  } catch {
    return { _raw: body.slice(0, 240) };
  }
}

const env = loadPreviewEnv();
const login = vercelCurl("/api/auth/password", [
  "--request",
  "POST",
  "--header",
  "Content-Type: application/json",
  "--data",
  JSON.stringify({
    action: "sign_in",
    email: env.PREVIEW_TEST_USER_A,
    password: env.PREVIEW_TEST_PASSWORD_A,
    deviceId: "gemini-quality-retest-models",
    deviceType: "desktop",
  }),
]);

if (login.status !== "authenticated") {
  writeFileSync(
    "tmp-e2e-artifacts/gemini-quality-retest/models-verify.json",
    JSON.stringify({ ok: false, stage: "login", error: login.error ?? "login_failed" }, null, 2)
  );
  console.log(JSON.stringify({ ok: false, stage: "login" }));
  process.exit(2);
}

const models = vercelCurl("/api/ai/models");
const summary = {
  ok: Boolean(models.hasGemini35FlashLite),
  deployment: DEPLOYMENT,
  hasGemini35FlashLite: models.hasGemini35FlashLite ?? null,
  hasGemini25FlashLite: models.hasGemini25FlashLite ?? null,
  flashLite: models.flashLite ?? [],
  error: models.error ?? null,
};
writeFileSync(
  "tmp-e2e-artifacts/gemini-quality-retest/models-verify.json",
  `${JSON.stringify(summary, null, 2)}\n`
);
console.log(JSON.stringify(summary));
if (!summary.ok) process.exit(2);
