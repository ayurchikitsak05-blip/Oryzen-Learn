import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { allowancePlanFor, allowanceStatus, helpsUsedToday } from "@/lib/ai/daily-allowance";

/** How many AI helps are left today, shown before the student asks (no AI call, no cost). */
export async function GET() {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return NextResponse.json({ error: "Not available." }, { status: 503 });
  const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  const user = data?.user;
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_status")
    .eq("id", user.id)
    .maybeSingle()
    .then(
      (res) => res,
      () => ({ data: null })
    );
  const plan = allowancePlanFor((profile as { access_status?: string | null } | null)?.access_status);
  return NextResponse.json(
    { ok: true, allowance: allowanceStatus(plan, await helpsUsedToday(supabase, user.id)) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
