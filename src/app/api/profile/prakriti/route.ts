import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { savePrakritiProfileToDatabase } from "@/lib/supabase/profile-sync";
import type { DoshaScores } from "@/lib/prakriti/config";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    const { data: cognitiveMemory } = await supabase
      .from("student_cognitive_memory")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({
      profile,
      cognitiveMemory,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load Prakriti profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      basicScores?: DoshaScores;
      readingScores?: DoshaScores;
      fullName?: string | null;
      organizationId?: string | null;
    };

    if (!body.basicScores || !body.readingScores) {
      return NextResponse.json(
        { error: "Both basicScores and readingScores are required." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !user.email) {
      return NextResponse.json(
        { error: "Authenticated user session required to sync to Supabase." },
        { status: 401 }
      );
    }

    const saved = await savePrakritiProfileToDatabase(supabase, {
      userId: user.id,
      email: user.email,
      fullName: body.fullName,
      organizationId: body.organizationId,
      basicScores: body.basicScores,
      readingScores: body.readingScores,
    });

    return NextResponse.json({
      status: "saved",
      profile: saved.profile,
      payload: saved.payload,
      cognitiveDna: saved.cognitiveDna,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to persist Prakriti profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
