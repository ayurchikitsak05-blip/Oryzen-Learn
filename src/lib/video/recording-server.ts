import type { SupabaseClient } from "@supabase/supabase-js";
import { allowancePlanFor } from "@/lib/ai/daily-allowance";
import { calculateCallCostInr } from "@/lib/ai/spend-guard";
import type { TimestampedLectureNote } from "./sync-engine";
import {
  lectureAllowance,
  lectureFailureMessage,
  lectureLimitMessage,
  LECTURE_MAX_OUTPUT_TOKENS,
  LECTURE_NOTES_MODEL,
  LECTURE_NOTES_SCHEMA,
  parseLectureNotes,
  type LectureAllowance,
} from "./lecture-notes";
import { holdLectureSlot, lectureNewCountThisMonth } from "./lecture-notes-server";
import {
  formatForExt,
  isRecordingId,
  isUnsupportedTypeError,
  RECORDING_BUCKET,
  RECORDING_MAX_BYTES,
  RECORDING_MAX_PROMPT_TOKENS,
  RECORDING_NOTES_PROMPT,
  recordingPath,
  type AudioFormat,
} from "./recording";

const API = "https://generativelanguage.googleapis.com";
export const RECORDING_GENERATE_TIMEOUT_MS = 230_000;

export type RecordingOutcome =
  | { ok: true; status: 200; title: string; notes: TimestampedLectureNote[]; allowance: LectureAllowance }
  | { ok: false; status: number; code: string; error: string; allowance?: LectureAllowance; reference?: string };

/** Step 1: a one-time link the phone uploads the audio to (straight to private storage). */
export async function prepareRecordingUpload(params: {
  admin: SupabaseClient;
  userId: string;
  accessStatus: string | null | undefined;
  format: AudioFormat;
  sizeBytes: number;
  now?: Date;
}): Promise<
  | { ok: true; recordingId: string; path: string; token: string; ext: string; allowance: LectureAllowance }
  | { ok: false; status: number; code: string; error: string; allowance?: LectureAllowance }
> {
  const { admin, userId, format } = params;
  if (!Number.isFinite(params.sizeBytes) || params.sizeBytes <= 0 || params.sizeBytes > RECORDING_MAX_BYTES) {
    return { ok: false, status: 413, code: "too_big", error: "Recordings can be up to 60 MB (about 90 minutes)." };
  }
  const plan = allowancePlanFor(params.accessStatus);
  const allowance = lectureAllowance(plan, await lectureNewCountThisMonth(admin, userId, params.now));
  if (allowance.left <= 0) {
    return { ok: false, status: 429, code: "monthly_limit", error: lectureLimitMessage(allowance), allowance };
  }
  // Clear anything left from an upload that was never turned into notes.
  const bucket = admin.storage.from(RECORDING_BUCKET);
  const { data: leftovers } = await bucket.list(`users/${userId}`, { limit: 100 });
  if (Array.isArray(leftovers) && leftovers.length > 0) {
    await bucket.remove(leftovers.map((item) => `users/${userId}/${item.name}`));
  }
  const recordingId = `rec-${crypto.randomUUID()}`;
  const path = recordingPath(userId, recordingId, format.ext);
  const { data, error } = await bucket.createSignedUploadUrl(path);
  if (error || !data?.token) {
    return { ok: false, status: 503, code: "store_failed", error: "The recording couldn't be uploaded just now. Nothing was counted." };
  }
  return { ok: true, recordingId, path, token: data.token, ext: format.ext, allowance };
}

interface GeminiFile {
  name: string;
  uri: string;
  state?: string;
}

async function uploadToGemini(
  fetchImpl: typeof fetch,
  apiKey: string,
  bytes: ArrayBuffer,
  mimeType: string
): Promise<{ ok: true; file: GeminiFile } | { ok: false; status: number; message: string }> {
  const start = await fetchImpl(`${API}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "lecture-recording" } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) {
    const json = (await start.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, status: start.status || 502, message: json.error?.message ?? "upload_start_failed" };
  }
  const done = await fetchImpl(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: bytes,
  });
  const json = (await done.json().catch(() => ({}))) as { file?: GeminiFile; error?: { message?: string } };
  if (!done.ok || !json.file?.name || !json.file.uri) {
    return { ok: false, status: done.status || 502, message: json.error?.message ?? "upload_failed" };
  }
  return { ok: true, file: json.file };
}

async function waitUntilActive(fetchImpl: typeof fetch, apiKey: string, file: GeminiFile, sleep: (ms: number) => Promise<void>) {
  let state = file.state;
  for (let attempt = 0; attempt < 30 && state === "PROCESSING"; attempt += 1) {
    await sleep(2_000);
    const response = await fetchImpl(`${API}/v1beta/${file.name}`, { headers: { "x-goog-api-key": apiKey } });
    const json = (await response.json().catch(() => ({}))) as { state?: string };
    state = json.state;
  }
  return state === undefined || state === "ACTIVE";
}

function audioRequest(file: GeminiFile, mimeType: string) {
  return {
    contents: [
      {
        role: "user",
        parts: [{ fileData: { mimeType, fileUri: file.uri } }, { text: RECORDING_NOTES_PROMPT }],
      },
    ],
  };
}

/** Step 2: read the uploaded recording and make the notes. The audio is deleted either way. */
export async function makeRecordingNotes(params: {
  admin: SupabaseClient;
  userId: string;
  accessStatus: string | null | undefined;
  recordingId: string;
  ext: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: Date;
}): Promise<RecordingOutcome> {
  const { admin, userId, recordingId, apiKey } = params;
  const fetchImpl = params.fetchImpl ?? fetch;
  const sleep = params.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const format = formatForExt(params.ext);
  if (!isRecordingId(recordingId) || !format) {
    return { ok: false, status: 400, code: "bad_recording", error: "That recording couldn't be found." };
  }
  const path = recordingPath(userId, recordingId, format.ext);
  const bucket = admin.storage.from(RECORDING_BUCKET);
  const plan = allowancePlanFor(params.accessStatus);
  let geminiFile: GeminiFile | null = null;

  const cleanUp = async () => {
    await bucket.remove([path]).catch(() => undefined);
    if (geminiFile) {
      await fetchImpl(`${API}/v1beta/${geminiFile.name}`, { method: "DELETE", headers: { "x-goog-api-key": apiKey } }).catch(
        () => undefined
      );
    }
  };

  try {
    const before = lectureAllowance(plan, await lectureNewCountThisMonth(admin, userId, params.now));
    if (before.left <= 0) {
      return { ok: false, status: 429, code: "monthly_limit", error: lectureLimitMessage(before), allowance: before };
    }
    if (!apiKey) return { ok: false, status: 503, code: "not_configured", error: "Lecture notes aren't switched on yet." };

    const { data: blob, error: downloadError } = await bucket.download(path);
    if (downloadError || !blob) {
      return {
        ok: false,
        status: 404,
        code: "not_uploaded",
        error: "The recording didn't finish uploading. Nothing was counted. Please try again.",
      };
    }
    if (blob.size > RECORDING_MAX_BYTES) {
      return { ok: false, status: 413, code: "too_big", error: "Recordings can be up to 60 MB (about 90 minutes)." };
    }
    const bytes = await blob.arrayBuffer();

    // Upload to Gemini and measure the length (free). If Gemini doesn't take this audio type,
    // try the second type once (phones record in formats Google names differently).
    let mimeType = format.gemini;
    let tokens = 0;
    for (const candidate of [format.gemini, format.fallback]) {
      if (!candidate) break;
      if (geminiFile) {
        const old: GeminiFile = geminiFile;
        geminiFile = null;
        await fetchImpl(`${API}/v1beta/${old.name}`, { method: "DELETE", headers: { "x-goog-api-key": apiKey } }).catch(
          () => undefined
        );
      }
      const uploaded = await uploadToGemini(fetchImpl, apiKey, bytes, candidate);
      if (!uploaded.ok) {
        if (isUnsupportedTypeError(uploaded.status, uploaded.message) && format.fallback && candidate !== format.fallback) continue;
        return {
          ok: false,
          status: 502,
          code: "provider_error",
          error: "The recording couldn't be sent to the AI just now. Nothing was counted. Please try again later.",
          reference: `U${uploaded.status}`,
        };
      }
      geminiFile = uploaded.file;
      if (!(await waitUntilActive(fetchImpl, apiKey, uploaded.file, sleep))) {
        return { ok: false, status: 422, code: "unreadable", error: "This recording couldn't be opened. Nothing was counted." };
      }
      const counted = await fetchImpl(`${API}/v1beta/models/${LECTURE_NOTES_MODEL}:countTokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(audioRequest(uploaded.file, candidate)),
      });
      const countJson = (await counted.json().catch(() => ({}))) as { totalTokens?: number; error?: { message?: string } };
      if (!counted.ok) {
        if (isUnsupportedTypeError(counted.status, countJson.error?.message ?? "") && format.fallback && candidate !== format.fallback) {
          continue;
        }
        return {
          ok: false,
          status: 422,
          code: "unreadable",
          error: "This recording's format couldn't be read. Nothing was counted. Try recording in the app instead.",
          reference: `C${counted.status}`,
        };
      }
      mimeType = candidate;
      tokens = Math.max(0, countJson.totalTokens ?? 0);
      break;
    }
    if (!geminiFile || tokens === 0) {
      return {
        ok: false,
        status: 422,
        code: "unreadable",
        error: "This recording's format couldn't be read. Nothing was counted. Try recording in the app instead.",
      };
    }
    if (tokens > RECORDING_MAX_PROMPT_TOKENS) {
      return {
        ok: false,
        status: 413,
        code: "too_long",
        error: "This recording is longer than 90 minutes. Nothing was counted. Record each class separately.",
      };
    }

    // Hold one of this month's lectures, then pay for the notes.
    const slot = await holdLectureSlot({ admin, userId, key: recordingId, plan, before, now: params.now });
    if (!slot.ok) return slot.outcome as RecordingOutcome;
    const { heldId, release, after } = slot;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RECORDING_GENERATE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(`${API}/v1beta/models/${LECTURE_NOTES_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          ...audioRequest(geminiFile, mimeType),
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: LECTURE_MAX_OUTPUT_TOKENS,
            responseMimeType: "application/json",
            responseSchema: LECTURE_NOTES_SCHEMA,
          },
        }),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      // Google may still finish (and bill) the call after we stop waiting, so it counts.
      const worst = calculateCallCostInr(LECTURE_NOTES_MODEL, tokens, LECTURE_MAX_OUTPUT_TOKENS);
      await admin.from("lecture_note_requests").update({ cost_inr: worst }).eq("id", heldId);
      return {
        ok: false,
        status: 504,
        code: "timeout",
        error: "The recording took too long to read, so this counted as one lecture. Try a shorter recording.",
        allowance: after,
      };
    }
    clearTimeout(timer);

    const json = (await response.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      error?: { message?: string; status?: string };
    };
    if (!response.ok) {
      await release();
      console.warn(
        JSON.stringify({
          event: "recording_notes_provider_error",
          status: response.status,
          reason: json.error?.status ?? null,
          message: (json.error?.message ?? "").slice(0, 300),
        })
      );
      return {
        ok: false,
        status: response.status === 429 ? 429 : 502,
        code: "provider_error",
        error: lectureFailureMessage(response.status, json.error?.message ?? ""),
        reference: `G${response.status}${json.error?.status ? `-${json.error.status}` : ""}`,
      };
    }

    const candidate = json.candidates?.[0];
    const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    let raw: unknown = null;
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }
    const parsed = parseLectureNotes(raw, recordingId);
    const promptTokens = Math.max(0, json.usageMetadata?.promptTokenCount ?? tokens);
    const completionTokens = Math.max(
      0,
      (json.usageMetadata?.candidatesTokenCount ?? 0) + (json.usageMetadata?.thoughtsTokenCount ?? 0)
    );
    const costInr = calculateCallCostInr(LECTURE_NOTES_MODEL, promptTokens, completionTokens);

    if (candidate?.finishReason === "MAX_TOKENS" && parsed.notes.length === 0) {
      await admin.from("lecture_note_requests").update({ cost_inr: costInr, counted: false }).eq("id", heldId);
      return {
        ok: false,
        status: 502,
        code: "cut_short",
        error: "The notes for this recording came out too long and were cut short. Nothing was counted. Please try again later.",
      };
    }
    await admin.from("lecture_note_requests").update({ cost_inr: costInr }).eq("id", heldId);
    if (parsed.notes.length === 0) {
      return {
        ok: false,
        status: 422,
        code: "no_notes",
        error: "This recording didn't sound like a class, so no notes were made. It counted as one lecture.",
        allowance: after,
      };
    }
    return { ok: true, status: 200, title: parsed.title, notes: parsed.notes, allowance: after };
  } finally {
    await cleanUp();
  }
}
