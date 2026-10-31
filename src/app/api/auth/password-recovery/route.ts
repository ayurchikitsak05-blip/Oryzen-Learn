import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAuthClient } from "@supabase/supabase-js";
import {
  describeSupabaseFailure,
  getSupabaseEnvConfig,
  supabaseConfigError,
} from "@/lib/supabase/client";

/**
 * Sends a Supabase Auth password-recovery email. Never sets a password.
 * Ownership is proven only when the student opens the emailed link.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 }
      );
    }

    const configError = supabaseConfigError();
    if (configError) {
      return NextResponse.json({ error: configError }, { status: 503 });
    }

    const { url, anonKey } = getSupabaseEnvConfig();
    const mailer = createAuthClient(url, anonKey, {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const origin = new URL(request.url).origin;
    const { error } = await mailer.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth`,
    });

    if (error) {
      const friendly = describeSupabaseFailure(error.message);
      return NextResponse.json(
        { error: friendly ?? error.message },
        { status: friendly ? 503 : 400 }
      );
    }

    return NextResponse.json({
      status: "recovery_email_sent",
      email,
    });
  } catch (err) {
    const message =
      describeSupabaseFailure(err) ??
      (err instanceof Error ? err.message : "Unable to send recovery email.");
    return NextResponse.json(
      { error: message },
      { status: describeSupabaseFailure(err) ? 503 : 500 }
    );
  }
}
