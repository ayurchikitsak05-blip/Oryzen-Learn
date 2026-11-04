import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateCallCostInr } from "@/lib/ai/spend-guard";
import { allowancePlanFor } from "@/lib/ai/daily-allowance";
import type { TimestampedLectureNote } from "./sync-engine";
import {
  indiaMonthStartIso,
  isVideoId,
  lectureAllowance,
  lectureFailureMessage,
  lectureLimitMessage,
  lectureNotesRequestBody,
  LECTURE_NOTES_MODEL,
  parseLectureNotes,
  sanitizeStoredNotes,
  type LectureAllowance,
} from "./lecture-notes";

/** Server side of lecture notes. The admin (service-role) client does every write. */

export const LECTURE_CALL_TIMEOUT_MS = 270_000;

export type LectureNotesOutcome =
  | {
      ok: true;
      status: 200;
      cached: boolean;
      title: string;
      notes: TimestampedLectureNote[];
      allowance: LectureAllowance;
    }
  | { ok: false; status: number; code: string; error: string; allowance?: LectureAllowance };

export async function lectureNewCountThisMonth(
  admin: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<number> {
  const { count, error } = await admin
    .from("lecture_note_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("cache_hit", false)
    .gte("created_at", indiaMonthStartIso(now));
  if (error) throw new Error("count_failed");
  return count ?? 0;
}

async function readCached(admin: SupabaseClient, videoId: string) {
  const { data, error } = await admin
    .from("lecture_notes_cache")
    .select("title, notes")
    .eq("video_id", videoId)
    .maybeSingle();
  if (error) throw new Error("cache_read_failed");
  return data as { title?: string; notes?: unknown } | null;
}

/** What the screen needs before the student taps "Make notes": is it free, and how many are left. */
export async function lectureNotesStatus(input: {
  admin: SupabaseClient;
  userId: string;
  videoId: string;
  accessStatus: string | null | undefined;
  now?: Date;
}): Promise<{ cached: boolean; allowance: LectureAllowance }> {
  const plan = allowancePlanFor(input.accessStatus);
  const [cached, used] = await Promise.all([
    isVideoId(input.videoId) ? readCached(input.admin, input.videoId) : Promise.resolve(null),
    lectureNewCountThisMonth(input.admin, input.userId, input.now),
  ]);
  return { cached: Boolean(cached), allowance: lectureAllowance(plan, used) };
}

export async function makeLectureNotes(input: {
  admin: SupabaseClient;
  userId: string;
  videoId: string;
  accessStatus: string | null | undefined;
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<LectureNotesOutcome> {
  const { admin, userId, videoId } = input;
  const fetchImpl = input.fetchImpl ?? fetch;
  if (!isVideoId(videoId)) {
    return { ok: false, status: 400, code: "bad_video", error: "That doesn't look like a YouTube video link." };
  }
  const plan = allowancePlanFor(input.accessStatus);

  // 1. Already made by anyone: free and instant.
  const cached = await readCached(admin, videoId);
  if (cached) {
    await admin.from("lecture_note_requests").insert({ user_id: userId, video_id: videoId, cache_hit: true, cost_inr: 0 });
    const used = await lectureNewCountThisMonth(admin, userId, input.now);
    return {
      ok: true,
      status: 200,
      cached: true,
      title: typeof cached.title === "string" && cached.title ? cached.title : "Your lecture",
      notes: sanitizeStoredNotes(cached.notes, videoId),
      allowance: lectureAllowance(plan, used),
    };
  }

  // 2. A new lecture: check this month's limit.
  const before = lectureAllowance(plan, await lectureNewCountThisMonth(admin, userId, input.now));
  if (before.left <= 0) {
    return { ok: false, status: 429, code: "monthly_limit", error: lectureLimitMessage(before), allowance: before };
  }
  if (!input.apiKey) {
    return { ok: false, status: 503, code: "not_configured", error: "Lecture notes aren't switched on yet." };
  }

  // 3. Hold a place first, so two taps at once can't both use the last lecture.
  const { data: held, error: holdError } = await admin
    .from("lecture_note_requests")
    .insert({ user_id: userId, video_id: videoId, cache_hit: false, cost_inr: 0 })
    .select("id")
    .single();
  if (holdError || !held) {
    return { ok: false, status: 503, code: "store_failed", error: "Lecture notes couldn't be made just now. Nothing was counted." };
  }
  const heldId = (held as { id: string }).id;
  const release = async () => {
    await admin.from("lecture_note_requests").delete().eq("id", heldId);
  };
  const after = lectureAllowance(plan, await lectureNewCountThisMonth(admin, userId, input.now));
  if (after.used > after.limit) {
    await release();
    return { ok: false, status: 429, code: "monthly_limit", error: lectureLimitMessage(before), allowance: before };
  }

  // 4. Ask Gemini.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LECTURE_CALL_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${LECTURE_NOTES_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": input.apiKey },
        body: JSON.stringify(lectureNotesRequestBody(videoId)),
        signal: controller.signal,
      }
    );
  } catch {
    clearTimeout(timer);
    await release();
    return { ok: false, status: 504, code: "timeout", error: "The lecture took too long to read. Nothing was counted. Try a shorter video." };
  }
  clearTimeout(timer);

  const json = (await response.json().catch(() => ({}))) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    error?: { message?: string };
  };
  if (!response.ok) {
    await release();
    return {
      ok: false,
      status: response.status === 429 ? 429 : 502,
      code: "provider_error",
      error: lectureFailureMessage(response.status, json.error?.message ?? ""),
    };
  }

  const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const parsed = parseLectureNotes(raw, videoId);
  const promptTokens = Math.max(0, json.usageMetadata?.promptTokenCount ?? 0);
  const completionTokens = Math.max(
    0,
    (json.usageMetadata?.candidatesTokenCount ?? 0) + (json.usageMetadata?.thoughtsTokenCount ?? 0)
  );
  const costInr = calculateCallCostInr(LECTURE_NOTES_MODEL, promptTokens, completionTokens);

  await admin.from("lecture_note_requests").update({ cost_inr: costInr }).eq("id", heldId);

  if (parsed.notes.length === 0) {
    return {
      ok: false,
      status: 422,
      code: "no_notes",
      error: "This video didn't look like a lecture, so no notes were made.",
      allowance: after,
    };
  }

  // 5. Share with everyone who adds this video later.
  await admin.from("lecture_notes_cache").upsert(
    {
      video_id: videoId,
      title: parsed.title,
      notes: parsed.notes,
      covered_seconds: parsed.coveredSeconds,
      model_used: LECTURE_NOTES_MODEL,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_inr: costInr,
      created_by: userId,
    },
    { onConflict: "video_id", ignoreDuplicates: true }
  );

  return { ok: true, status: 200, cached: false, title: parsed.title, notes: parsed.notes, allowance: after };
}
