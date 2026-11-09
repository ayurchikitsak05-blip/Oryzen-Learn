import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { audioFormatFor, formatForExt, isRecordingId, recordingPath, RECORDING_MAX_PROMPT_TOKENS } from "../recording";
import { makeRecordingNotes } from "../recording-server";
import { recordedLectureAsText } from "../recorded-lectures";

describe("recording formats", () => {
  it("knows phone recordings by type or file name", () => {
    expect(audioFormatFor("audio/webm;codecs=opus")?.ext).toBe("webm");
    expect(audioFormatFor("audio/x-m4a")?.upload).toBe("audio/mp4");
    expect(audioFormatFor("", "Class 3.m4a")?.ext).toBe("m4a");
    expect(audioFormatFor("audio/mpeg")?.gemini).toBe("audio/mp3");
    expect(audioFormatFor("video/mp4", "movie.mp4")).toBeNull();
    expect(audioFormatFor("application/pdf", "book.pdf")).toBeNull();
    expect(formatForExt("m4a")?.fallback).toBe("video/mp4");
    expect(formatForExt("exe")).toBeNull();
  });

  it("only accepts its own recording ids and private paths", () => {
    const id = "rec-123e4567-e89b-12d3-a456-426614174000";
    expect(isRecordingId(id)).toBe(true);
    expect(isRecordingId("rec-../../x")).toBe(false);
    expect(recordingPath("u1", id, "webm")).toBe(`users/u1/${id}.webm`);
    expect(RECORDING_MAX_PROMPT_TOKENS).toBeGreaterThan(90 * 60 * 32);
  });
});

const RECORDING_ID = "rec-123e4567-e89b-12d3-a456-426614174000";

function fakeAdmin(options: { usedThisMonth?: number; uploaded?: boolean } = {}) {
  const removed: string[][] = [];
  const updates: Record<string, unknown>[] = [];
  const rows: Array<{ id: string; video_id: string; created_at: string }> = Array.from({ length: options.usedThisMonth ?? 0 }, (_, i) => ({
    id: `old-${i}`,
    video_id: `v${i}`,
    created_at: "2026-11-01T00:00:00Z",
  }));
  const table = () => {
    let mode: "count" | "rows" = "rows";
    let pendingInsert: Record<string, unknown> | null = null;
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: (_cols: string, opts?: { head?: boolean }) => {
        if (pendingInsert) return chain;
        mode = opts?.head ? "count" : "rows";
        return chain;
      },
      eq: () => chain,
      gte: () => chain,
      order: () => chain,
      insert: (row: Record<string, unknown>) => {
        pendingInsert = row;
        return chain;
      },
      single: async () => {
        const id = `held-${rows.length}`;
        rows.push({ id, video_id: String(pendingInsert?.video_id), created_at: new Date().toISOString() });
        return { data: { id }, error: null };
      },
      update: (row: Record<string, unknown>) => {
        updates.push(row);
        return { eq: async () => ({ error: null }) };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
      then: (resolve: (value: unknown) => void) =>
        resolve(mode === "count" ? { count: rows.filter((row) => row.video_id === RECORDING_ID).length ? 0 : rows.length, error: null } : { data: rows, error: null }),
    });
    return chain;
  };
  const admin = {
    from: () => table(),
    storage: {
      from: () => ({
        download: async () =>
          options.uploaded === false ? { data: null, error: { message: "not found" } } : { data: new Blob(["audio-bytes"]), error: null },
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: null };
        },
      }),
    },
  };
  return { admin: admin as unknown as SupabaseClient, removed, updates };
}

function gemini(tokens: number, generate: () => Response) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url.replace("https://generativelanguage.googleapis.com", "")}`);
    if (url.endsWith("/upload/v1beta/files")) {
      return new Response("{}", { status: 200, headers: { "x-goog-upload-url": "https://upload.example/session" } });
    }
    if (url === "https://upload.example/session") {
      return new Response(JSON.stringify({ file: { name: "files/abc", uri: "https://g/files/abc", state: "ACTIVE" } }), { status: 200 });
    }
    if (url.endsWith(":countTokens")) return new Response(JSON.stringify({ totalTokens: tokens }), { status: 200 });
    if (url.endsWith(":generateContent")) return generate();
    return new Response("{}", { status: 200 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const goodNotes = () =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  title: "Laws of motion",
                  sections: [{ start_time: "00:00", heading: "Inertia", points: ["Objects resist change"], key_point: "First law" }],
                }),
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 115_000, candidatesTokenCount: 3_000 },
    }),
    { status: 200 }
  );

describe("making notes from a recording", () => {
  it("makes private notes, counts one lecture, and deletes the audio and the AI's copy", async () => {
    const { admin, removed, updates } = fakeAdmin();
    const { fetchImpl, calls } = gemini(115_000, goodNotes);
    const outcome = await makeRecordingNotes({ admin, userId: "u1", accessStatus: "active_paid", recordingId: RECORDING_ID, ext: "webm", apiKey: "k", fetchImpl });
    expect(outcome).toMatchObject({ ok: true, title: "Laws of motion", allowance: { limit: 8, used: 1 } });
    expect(updates.some((row) => Number(row.cost_inr) > 0)).toBe(true);
    expect(removed[0]).toEqual([`users/u1/${RECORDING_ID}.webm`]);
    expect(calls).toContain("DELETE /v1beta/files/abc");
  });

  it("refuses a recording over 90 minutes before paying, and doesn't count it", async () => {
    const { admin, removed, updates } = fakeAdmin();
    const generate = vi.fn(goodNotes);
    const { fetchImpl } = gemini(RECORDING_MAX_PROMPT_TOKENS + 1, generate);
    const outcome = await makeRecordingNotes({ admin, userId: "u1", accessStatus: "trial", recordingId: RECORDING_ID, ext: "m4a", apiKey: "k", fetchImpl });
    expect(outcome).toMatchObject({ ok: false, code: "too_long" });
    expect(generate).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(removed).toHaveLength(1);
  });

  it("stops at this month's limit without uploading anything", async () => {
    const { admin } = fakeAdmin({ usedThisMonth: 1 });
    const { fetchImpl, calls } = gemini(1000, goodNotes);
    const outcome = await makeRecordingNotes({ admin, userId: "u1", accessStatus: "trial", recordingId: RECORDING_ID, ext: "webm", apiKey: "k", fetchImpl });
    expect(outcome).toMatchObject({ ok: false, code: "monthly_limit" });
    expect(calls.filter((call) => call.includes("upload"))).toHaveLength(0);
  });

  it("says the upload didn't finish when there is no file", async () => {
    const { admin } = fakeAdmin({ uploaded: false });
    const { fetchImpl } = gemini(1000, goodNotes);
    const outcome = await makeRecordingNotes({ admin, userId: "u1", accessStatus: "trial", recordingId: RECORDING_ID, ext: "webm", apiKey: "k", fetchImpl });
    expect(outcome).toMatchObject({ ok: false, code: "not_uploaded" });
  });

  it("rejects ids that aren't recordings", async () => {
    const { admin } = fakeAdmin();
    const { fetchImpl } = gemini(1000, goodNotes);
    const outcome = await makeRecordingNotes({ admin, userId: "u1", accessStatus: "trial", recordingId: "../../etc", ext: "webm", apiKey: "k", fetchImpl });
    expect(outcome).toMatchObject({ ok: false, code: "bad_recording" });
  });

  it("turns the notes into one My Notes entry", () => {
    expect(
      recordedLectureAsText({
        notes: [
          {
            id: "a",
            lectureId: "l",
            startSeconds: 0,
            endSeconds: 300,
            timestampBadge: "[00:00]",
            heading: "Inertia",
            speakerTranscript: "",
            studyNoteMarkdown: "- Objects resist change",
            highYieldKeyPoint: "First law",
            modificationHistory: [],
          },
        ],
      })
    ).toBe("[00:00] Inertia\n- Objects resist change\nExam point: First law");
  });
});
