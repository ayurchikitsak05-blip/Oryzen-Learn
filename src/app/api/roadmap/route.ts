import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rejectRawPayloadSize } from "@/lib/roadmap/limits";
import { prepareRoadmapRecord, sanitizeRecord } from "@/lib/roadmap/sanitize";
import { evaluateWriteConflict, parseExpectedUpdatedAt, scopedUserFilter } from "@/lib/roadmap/sync";
import type { RoadmapRecord } from "@/lib/roadmap/types";

async function signedInClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function missingTable(message: string): boolean {
  return /study_roadmaps|schema cache|does not exist/i.test(message);
}

function asRecord(
  row: {
    id?: string;
    user_id?: string;
    intake?: unknown;
    plan?: unknown;
    completions?: unknown;
    updated_at?: string;
  } | null,
  userId: string
): RoadmapRecord | null {
  if (!row) return null;
  return sanitizeRecord(
    {
      id: row.id,
      userId: userId,
      intake: row.intake,
      plan: row.plan,
      completions: row.completions,
      updatedAt: row.updated_at,
      version: 1,
    },
    userId
  );
}

function ownerFilter(userId: string) {
  const scoped = scopedUserFilter(userId);
  return { column: scoped.column, value: scoped.value };
}

export async function GET() {
  const { supabase, user } = await signedInClient();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to keep your study roadmap.", persist: "local", record: null, code: "unauthorized" },
      { status: 401 }
    );
  }

  const scoped = ownerFilter(user.id);
  const result = await supabase
    .from("study_roadmaps")
    .select("id, user_id, intake, plan, completions, updated_at")
    .eq(scoped.column, scoped.value)
    .maybeSingle();

  if (result.error) {
    if (missingTable(result.error.message)) {
      return NextResponse.json({
        record: null,
        persist: "local",
        reason: "table_missing",
        code: "table_missing",
      });
    }
    return NextResponse.json(
      {
        error: "Your plan is saved on this device. The account copy could not be reached just now.",
        persist: "local",
        record: null,
        code: "unavailable",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    record: asRecord(result.data, user.id),
    persist: "server",
  });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await signedInClient();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to keep your study roadmap.", persist: "local", code: "unauthorized" },
      { status: 401 }
    );
  }

  const rawText = await request.text();
  const oversized = rejectRawPayloadSize(rawText);
  if (oversized) {
    return NextResponse.json(
      { error: oversized.error, persist: "local", code: oversized.code },
      { status: oversized.status }
    );
  }

  let body: {
    action?: "save" | "delete";
    record?: unknown;
    expectedUpdatedAt?: unknown;
  };
  try {
    body = (rawText ? JSON.parse(rawText) : {}) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "That study plan could not be read.", persist: "local", code: "malformed" },
      { status: 400 }
    );
  }

  const scoped = ownerFilter(user.id);

  if (body.action === "delete") {
    const removed = await supabase.from("study_roadmaps").delete().eq(scoped.column, scoped.value);
    if (removed.error && !missingTable(removed.error.message)) {
      return NextResponse.json(
        { error: removed.error.message, persist: "local", code: "unavailable" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      persist: removed.error && missingTable(removed.error.message) ? "local" : "server",
      code: removed.error && missingTable(removed.error.message) ? "table_missing" : undefined,
    });
  }

  if (body.action !== "save") {
    return NextResponse.json({ error: "Unknown roadmap action.", code: "malformed" }, { status: 400 });
  }

  const prepared = prepareRoadmapRecord(body.record, user.id);
  if (!prepared.ok) {
    return NextResponse.json(
      { error: prepared.error, persist: "local", code: prepared.code },
      { status: prepared.status }
    );
  }
  const record = prepared.record;
  const expectedUpdatedAt = parseExpectedUpdatedAt(
    request.headers.get("if-unmodified-since"),
    body.expectedUpdatedAt
  );

  const existing = await supabase
    .from("study_roadmaps")
    .select("id, user_id, intake, plan, completions, updated_at")
    .eq(scoped.column, scoped.value)
    .maybeSingle();

  if (existing.error) {
    if (missingTable(existing.error.message)) {
      return NextResponse.json({ ok: true, persist: "local", reason: "table_missing", code: "table_missing" });
    }
    return NextResponse.json(
      {
        error: "Your plan is saved on this device. The account copy could not be reached just now.",
        persist: "local",
        code: "unavailable",
      },
      { status: 500 }
    );
  }

  const decision = evaluateWriteConflict({
    serverUpdatedAt: existing.data?.updated_at ?? null,
    expectedUpdatedAt,
  });

  if (decision === "conflict") {
    return NextResponse.json(
      {
        error: "This device and your account have different study plans. Choose which one to keep.",
        persist: "server",
        code: "conflict",
        record: asRecord(existing.data, user.id),
      },
      { status: 409 }
    );
  }

  const payload = {
    user_id: user.id,
    intake: record.intake,
    plan: record.plan,
    completions: record.completions,
  };

  const saved =
    decision === "insert"
      ? await supabase.from("study_roadmaps").insert(payload).select("id, user_id, intake, plan, completions, updated_at").maybeSingle()
      : await supabase
          .from("study_roadmaps")
          .update(payload)
          .eq(scoped.column, scoped.value)
          .eq("updated_at", existing.data!.updated_at)
          .select("id, user_id, intake, plan, completions, updated_at")
          .maybeSingle();

  if (saved.error) {
    if (missingTable(saved.error.message)) {
      return NextResponse.json({ ok: true, persist: "local", reason: "table_missing", code: "table_missing" });
    }
    if (saved.error.code === "23505") {
      const latest = await supabase
        .from("study_roadmaps")
        .select("id, user_id, intake, plan, completions, updated_at")
        .eq(scoped.column, scoped.value)
        .maybeSingle();
      return NextResponse.json(
        {
          error: "This device and your account have different study plans. Choose which one to keep.",
          persist: "server",
          code: "conflict",
          record: asRecord(latest.data, user.id),
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: saved.error.message, persist: "local", code: "unavailable" },
      { status: 400 }
    );
  }

  if (decision === "update" && !saved.data) {
    const latest = await supabase
      .from("study_roadmaps")
      .select("id, user_id, intake, plan, completions, updated_at")
      .eq(scoped.column, scoped.value)
      .maybeSingle();
    return NextResponse.json(
      {
        error: "This device and your account have different study plans. Choose which one to keep.",
        persist: "server",
        code: "conflict",
        record: asRecord(latest.data, user.id),
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    persist: "server",
    id: saved.data?.id ?? record.id,
    record: asRecord(saved.data, user.id) ?? { ...record, userId: user.id, updatedAt: saved.data?.updated_at ?? record.updatedAt },
  });
}
