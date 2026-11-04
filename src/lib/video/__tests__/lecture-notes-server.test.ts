import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lectureNotesStatus, makeLectureNotes } from "../lecture-notes-server";

type Row = Record<string, unknown>;

/** A tiny in-memory stand-in for the two tables, enough for the queries the server makes. */
function fakeAdmin() {
  const tables: Record<string, Row[]> = { lecture_notes_cache: [], lecture_note_requests: [] };
  let nextId = 1;
  const query = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "select" | "update" | "delete" = "select";
    let patch: Row = {};
    let countOnly = false;
    const rows = () => tables[table].filter((row) => filters.every((f) => f(row)));
    const run = () => {
      if (mode === "delete") {
        tables[table] = tables[table].filter((row) => !filters.every((f) => f(row)));
        return { data: null, error: null };
      }
      if (mode === "update") {
        rows().forEach((row) => Object.assign(row, patch));
        return { data: null, error: null };
      }
      return countOnly ? { count: rows().length, error: null } : { data: rows(), error: null };
    };
    const builder: Record<string, unknown> = {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        countOnly = Boolean(opts?.head);
        return builder;
      },
      eq: (col: string, value: unknown) => {
        filters.push((row) => row[col] === value);
        return builder;
      },
      gte: (col: string, value: string) => {
        filters.push((row) => String(row[col]) >= value);
        return builder;
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      update: (value: Row) => {
        mode = "update";
        patch = value;
        return builder;
      },
      delete: () => {
        mode = "delete";
        return builder;
      },
      insert: (value: Row) => {
        const row = { id: `r${nextId++}`, created_at: new Date().toISOString(), ...value };
        tables[table].push(row);
        const done = Promise.resolve({ data: null, error: null });
        return Object.assign(done, {
          select: () => ({ single: async () => ({ data: { id: row.id }, error: null }) }),
        });
      },
      upsert: async (value: Row) => {
        if (!tables[table].some((row) => row.video_id === value.video_id)) tables[table].push(value);
        return { data: null, error: null };
      },
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  };
  return { client: { from: query } as unknown as SupabaseClient, tables };
}

function geminiReply(sections: unknown[], usage = { promptTokenCount: 200_000, candidatesTokenCount: 3_000 }) {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ title: "Optics", sections }) }] } }],
        usageMetadata: usage,
      }),
      { status: 200 }
    )
  );
}

const SECTIONS = [{ start_seconds: 0, heading: "Reflection", points: ["Angle i = angle r"], key_point: "" }];
const VIDEO = "dQw4w9WgXcQ";

describe("lecture notes (server)", () => {
  it("makes notes once, then shares them free with the next student", async () => {
    const { client, tables } = fakeAdmin();
    const fetchImpl = geminiReply(SECTIONS);
    const first = await makeLectureNotes({
      admin: client, userId: "a", videoId: VIDEO, accessStatus: "active_paid", apiKey: "k", fetchImpl,
    });
    expect(first.ok && first.cached).toBe(false);
    expect(first.ok && first.notes[0].heading).toBe("Reflection");
    expect(first.ok && first.allowance).toMatchObject({ plan: "pro", used: 1, left: 7 });
    expect(Number(tables.lecture_note_requests[0].cost_inr)).toBeGreaterThan(0);
    expect(tables.lecture_notes_cache).toHaveLength(1);

    const second = await makeLectureNotes({
      admin: client, userId: "b", videoId: VIDEO, accessStatus: "free", apiKey: "k", fetchImpl,
    });
    expect(second.ok && second.cached).toBe(true);
    expect(second.ok && second.allowance.used).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops at the monthly limit without calling the AI", async () => {
    const { client } = fakeAdmin();
    const fetchImpl = geminiReply(SECTIONS);
    await makeLectureNotes({ admin: client, userId: "a", videoId: VIDEO, accessStatus: "free", apiKey: "k", fetchImpl });
    const blocked = await makeLectureNotes({
      admin: client, userId: "a", videoId: "aaaaaaaaaaa", accessStatus: "free", apiKey: "k", fetchImpl,
    });
    expect(blocked).toMatchObject({ ok: false, status: 429, code: "monthly_limit" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const status = await lectureNotesStatus({ admin: client, userId: "a", videoId: VIDEO, accessStatus: "free" });
    expect(status).toMatchObject({ cached: true, allowance: { left: 0 } });
  });

  it("doesn't count a failed or private video", async () => {
    const { client, tables } = fakeAdmin();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "The video is private" } }), { status: 400 })
    );
    const result = await makeLectureNotes({
      admin: client, userId: "a", videoId: VIDEO, accessStatus: "free", apiKey: "k", fetchImpl,
    });
    expect(result).toMatchObject({ ok: false, code: "provider_error" });
    expect(!result.ok && result.error).toMatch(/Only public YouTube videos/);
    expect(tables.lecture_note_requests).toHaveLength(0);
    expect(tables.lecture_notes_cache).toHaveLength(0);
  });

  it("refuses bad ids and a missing key before spending anything", async () => {
    const { client, tables } = fakeAdmin();
    const fetchImpl = geminiReply(SECTIONS);
    expect(
      await makeLectureNotes({ admin: client, userId: "a", videoId: "nope", accessStatus: "free", apiKey: "k", fetchImpl })
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await makeLectureNotes({ admin: client, userId: "a", videoId: VIDEO, accessStatus: "free", apiKey: "", fetchImpl })
    ).toMatchObject({ ok: false, status: 503, code: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(tables.lecture_note_requests).toHaveLength(0);
  });

  it("sends the YouTube link, clipped and at low detail", async () => {
    const { client } = fakeAdmin();
    const fetchImpl = geminiReply(SECTIONS);
    await makeLectureNotes({ admin: client, userId: "a", videoId: VIDEO, accessStatus: "free", apiKey: "k", fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("gemini-3.5-flash-lite:generateContent");
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].fileData.fileUri).toContain(VIDEO);
    expect(body.generationConfig.mediaResolution).toBe("MEDIA_RESOLUTION_LOW");
  });
});
