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
      const missingFunction =
        /activate_free_plan/i.test(error.message) &&
        /schema cache|does not exist/i.test(error.message);
      return NextResponse.json(
        {
          error: missingFunction
            ? "The free plan is not installed on the database yet. Run the activate_free_plan migration in the Supabase SQL editor, then click Start free again."
            : error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      accessStatus: (data as { access_status?: string } | null)?.access_status ?? "free",
    });
  } catch {
    return NextResponse.json({ error: "Free access could not start." }, { status: 500 });
  }
}
