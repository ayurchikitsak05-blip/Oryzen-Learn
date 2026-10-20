import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    let userId: string | null = null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }
    if (!userId) {
      return NextResponse.json({ error: "Sign in before choosing a plan." }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("activate_free_plan");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      accessStatus: (data as { access_status?: string } | null)?.access_status ?? "free",
    });
  } catch {
    return NextResponse.json({ error: "Free access could not start." }, { status: 500 });
  }
}
