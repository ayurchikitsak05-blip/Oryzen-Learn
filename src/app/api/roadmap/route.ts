import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeRecord } from "@/lib/roadmap/persist";
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

function asRecord(row: {
  id?: string;
  user_id?: string;
  intake?: unknown;
  plan?: unknown;
  completions?: unknown;
  updated_at?: string;
} | null, userId: string): RoadmapRecord | null {
  if (!row) return null;
  return sanitizeRecord(
    {
      id: row.id,
      userId: row.user_id ?? userId,
      intake: row.intake,
      plan: row.plan,
      completions: row.completions,
      updatedAt: row.updated_at,
      version: 1,
    },
    userId
  );
}

export async function GET() {
  const { supabase, user } = await signedInClient();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to keep your study roadmap.", persist: "local", record: null },
      { status: 401 }
    );
  }

  const result = await supabase
    .from("study_roadmaps")
    .select("id, user_id, intake, plan, completions, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (result.error) {
    if (missingTable(result.error.message)) {
      return NextResponse.json({
        record: null,
        persist: "local",
        reason: "table_missing",
      });
    }
    return NextResponse.json(
      { error: result.error.message, persist: "local", record: null },
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
      { error: "Sign in to keep your study roadmap.", persist: "local" },
      { status: 401 }
    );
  }

  const body = (await request.json()) as {
    action?: "save" | "delete";
    record?: unknown;
  };

  if (body.action === "delete") {
    const removed = await supabase.from("study_roadmaps").delete().eq("user_id", user.id);
    if (removed.error && !missingTable(removed.error.message)) {
      return NextResponse.json({ error: removed.error.message, persist: "local" }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      persist: removed.error && missingTable(removed.error.message) ? "local" : "server",
    });
  }

  if (body.action !== "save") {
    return NextResponse.json({ error: "Unknown roadmap action." }, { status: 400 });
  }

  const record = sanitizeRecord(body.record, user.id);
  if (!record) {
    return NextResponse.json({ error: "That study plan could not be read." }, { status: 400 });
  }

  const saved = await supabase
    .from("study_roadmaps")
    .upsert(
      {
        user_id: user.id,
        intake: record.intake,
        plan: record.plan,
        completions: record.completions,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("id")
    .maybeSingle();

  if (saved.error) {
    if (missingTable(saved.error.message)) {
      return NextResponse.json({ ok: true, persist: "local", reason: "table_missing" });
    }
    return NextResponse.json({ error: saved.error.message, persist: "local" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, persist: "server", id: saved.data?.id ?? record.id });
}
