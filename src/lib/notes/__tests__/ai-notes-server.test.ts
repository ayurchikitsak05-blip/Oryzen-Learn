import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeAiNotes } from "../ai-notes-server";

/** A tiny stand-in for Supabase: usage rows in memory. */
function fakeSupabase(rows: Array<{ lens_type: string; cache_hit: boolean; cost_inr: number; billing_month?: string }>) {
  const inserted: Record<string, unknown>[] = [];
  const query = () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      then: (resolve: (value: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }),
    };
    return chain;
  };
  const client = {
    from: () => ({
      ...query(),
      insert: async (row: Record<string, unknown>) => {
        inserted.push(row);
        return { error: null };
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, inserted };
}

const photo = { kind: "photo" as const, image: { data: "A".repeat(400), mimeType: "image/jpeg" } };

function geminiReply(body: unknown) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 1700, candidatesTokenCount: 600 },
    }),
    { status: 200 }
  );
}

describe("photo and short notes on the server", () => {
  it("stops at the daily limit without calling the AI", async () => {
    const { client } = fakeSupabase(Array.from({ length: 5 }, () => ({ lens_type: "explain", cache_hit: false, cost_inr: 0.2 })));
    const fetchImpl = vi.fn();
    const outcome = await makeAiNotes({ supabase: client, userId: "u1", accessStatus: "trial", apiKey: "k", input: photo, fetchImpl });
    expect(outcome).toMatchObject({ ok: false, status: 429, code: "daily_allowance" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stops at the monthly safety net", async () => {
    const { client } = fakeSupabase([{ lens_type: "explain", cache_hit: false, cost_inr: 0 }, { lens_type: "x", cache_hit: true, cost_inr: 69.9 }]);
    const fetchImpl = vi.fn();
    const outcome = await makeAiNotes({ supabase: client, userId: "u1", accessStatus: "active_paid", apiKey: "k", input: photo, fetchImpl });
    expect(outcome).toMatchObject({ ok: false, code: "monthly_cap" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns typed notes and records the cost as one photo help", async () => {
    const { client, inserted } = fakeSupabase([]);
    const fetchImpl = vi.fn(async () => geminiReply({ readable: true, title: "Ohm", subject: "Physics", body: "V = IR" }));
    const outcome = await makeAiNotes({ supabase: client, userId: "u1", accessStatus: "trial", apiKey: "k", input: photo, fetchImpl });
    expect(outcome).toMatchObject({ ok: true, kind: "photo", photo: { body: "V = IR" }, allowance: { used: 1 } });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ lens_type: "photo_notes", user_id: "u1", cache_hit: false });
    expect(Number(inserted[0].cost_inr)).toBeGreaterThan(0);
  });

  it("doesn't count it when Google refuses the call", async () => {
    const { client, inserted } = fakeSupabase([]);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { status: "UNAVAILABLE" } }), { status: 503 }));
    const outcome = await makeAiNotes({ supabase: client, userId: "u1", accessStatus: "trial", apiKey: "k", input: photo, fetchImpl });
    expect(outcome).toMatchObject({ ok: false, code: "provider_error", reference: "G503-UNAVAILABLE" });
    expect(inserted).toHaveLength(0);
  });

  it("makes short notes as two helps", async () => {
    const { client, inserted } = fakeSupabase([]);
    const fetchImpl = vi.fn(async () =>
      geminiReply({ summary: "S", keyPoints: ["a"], terms: [], formulas: [], table: { headers: [], rows: [] }, memoryTips: [], selfCheck: [] })
    );
    const outcome = await makeAiNotes({
      supabase: client,
      userId: "u1",
      accessStatus: "trial",
      apiKey: "k",
      input: { kind: "short", chapterTitle: "Cells", text: "x".repeat(500) },
      fetchImpl,
    });
    expect(outcome).toMatchObject({ ok: true, kind: "short", allowance: { used: 2 } });
    expect(inserted[0]).toMatchObject({ lens_type: "short_notes" });
  });
});

describe("requests at the same moment", () => {
  it("can't use more helps than are left", async () => {
    const { client } = fakeSupabase(Array.from({ length: 4 }, () => ({ lens_type: "explain", cache_hit: false, cost_inr: 0.2 })));
    let resolveFirst: (value: Response) => void = () => undefined;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        })
    );
    const first = makeAiNotes({ supabase: client, userId: "u9", accessStatus: "trial", apiKey: "k", input: photo, fetchImpl });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = await makeAiNotes({ supabase: client, userId: "u9", accessStatus: "trial", apiKey: "k", input: photo, fetchImpl });
    expect(second).toMatchObject({ ok: false, code: "daily_allowance" });
    resolveFirst(geminiReply({ readable: true, title: "t", subject: "", body: "b" }));
    expect(await first).toMatchObject({ ok: true });
  });
});
