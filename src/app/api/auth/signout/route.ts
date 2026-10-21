import { NextResponse } from "next/server";
import { createAuthRouteClient } from "@/lib/supabase/route-client";

export async function POST() {
  try {
    const { supabase, withCookies } = await createAuthRouteClient();
    await supabase.auth.signOut();
    return withCookies(NextResponse.json({ ok: true }));
  } catch {
    return NextResponse.json({ error: "Could not sign out." }, { status: 500 });
  }
}
