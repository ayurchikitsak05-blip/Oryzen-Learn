import { NextResponse, type NextRequest } from "next/server";
import { destinationAfterAuth } from "@/lib/access/gate";
import { describeSupabaseFailure, supabaseConfigError } from "@/lib/supabase/client";
import { ensureSignedInProfile } from "@/lib/supabase/ensure-profile";
import { describePasswordAuthFailure } from "@/lib/supabase/password-auth-errors";
import { createAuthRouteClient } from "@/lib/supabase/route-client";
import { detectDeviceCategory, enforceTwoDeviceLock } from "@/lib/supabase/device-lock";
import {
  DEVICE_ID_COOKIE_NAME,
  DEVICE_TYPE_COOKIE_NAME,
} from "@/lib/supabase/middleware";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action?: "sign_in" | "sign_up" | "replace_password";
      email?: string;
      password?: string;
      fullName?: string;
      deviceId?: string;
      deviceType?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const fullName = body.fullName?.trim() ?? "";
    if (!email || password.length < 8) {
      return NextResponse.json(
        { error: "Use an email and a password of at least 8 characters." },
        { status: 400 }
      );
    }

    const configError = supabaseConfigError();
    if (configError) {
      return NextResponse.json({ error: configError }, { status: 503 });
    }

    const { supabase, withCookies } = await createAuthRouteClient();
    const created = body.action === "sign_up";
    const replacing = body.action === "replace_password";
    let authResult = created
      ? await supabase.auth.signUp({
          email,
          password,
          options: fullName ? { data: { full_name: fullName } } : undefined,
        })
      : await supabase.auth.signInWithPassword({ email, password });

    const alreadyRegistered = /already registered|already exists/i.test(
      authResult.error?.message ?? ""
    );
    if (created && alreadyRegistered) {
      authResult = await supabase.auth.signInWithPassword({ email, password });
    }

    if (created && !authResult.error && authResult.data.user && !authResult.data.session) {
      authResult = await supabase.auth.signInWithPassword({ email, password });
    }

    if (replacing && (authResult.error || !authResult.data.session)) {
      const { error: replaceError } = await supabase.rpc("replace_unmatched_password", {
        target_email: email,
        new_password: password,
      });
      const missingAccount = /no account uses that email/i.test(replaceError?.message ?? "");
      if (replaceError && missingAccount) {
        authResult = await supabase.auth.signUp({ email, password });
        if (!authResult.error && authResult.data.user && !authResult.data.session) {
          authResult = await supabase.auth.signInWithPassword({ email, password });
        }
      } else if (replaceError) {
        return NextResponse.json(
          { error: "Could not save that password. Use at least 8 characters and try again." },
          { status: 400 }
        );
      } else {
        authResult = await supabase.auth.signInWithPassword({ email, password });
      }
    }

    if (authResult.error || !authResult.data.user || !authResult.data.session) {
      const failure = describePasswordAuthFailure({
        rawMessage: authResult.error?.message ?? "",
        networkMessage: describeSupabaseFailure(authResult.error?.message ?? ""),
        alreadyRegistered,
        createdWithoutSession: Boolean(
          created && authResult.data.user && !authResult.data.session
        ),
      });
      return NextResponse.json(
        { error: failure.error, code: failure.code },
        { status: failure.status }
      );
    }

    const userAgent = request.headers.get("user-agent") ?? "";
    const resolvedDeviceType = detectDeviceCategory(userAgent, body.deviceType);
    const resolvedDeviceId =
      body.deviceId?.trim() ||
      request.cookies.get(DEVICE_ID_COOKIE_NAME)?.value ||
      `${resolvedDeviceType}-${authResult.data.user.id.slice(0, 8)}`;

    let revokedSessionIds: string[] = [];
    try {
      const lockResult = await enforceTwoDeviceLock(supabase, {
        userId: authResult.data.user.id,
        deviceId: resolvedDeviceId,
        deviceType: resolvedDeviceType,
        deviceLabel:
          resolvedDeviceType === "tablet"
            ? "Primary Study Tablet"
            : "Companion Study Phone",
        sessionTokenHash: authResult.data.session.access_token.slice(-24),
      });
      revokedSessionIds = lockResult.revokedSessionIds;
    } catch {
      revokedSessionIds = [];
    }

    const profile = await ensureSignedInProfile(
      supabase,
      authResult.data.user,
      created && !alreadyRegistered && fullName ? { fullName } : undefined
    );

    const response = NextResponse.json({
      status: "authenticated",
      created: created && !alreadyRegistered,
      next: destinationAfterAuth({
        accessStatus: profile.access_status,
        role: profile.role,
        hasBodyType: Boolean(profile.prakriti_profile),
      }),
      deviceLock: {
        deviceType: resolvedDeviceType,
        deviceId: resolvedDeviceId,
        revokedSessionIds,
      },
    });

    response.cookies.set(DEVICE_ID_COOKIE_NAME, resolvedDeviceId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.set(DEVICE_TYPE_COOKIE_NAME, resolvedDeviceType, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return withCookies(response);
  } catch (err) {
    const message =
      describeSupabaseFailure(err) ??
      (err instanceof Error ? err.message : "Sign-in failed.");
    return NextResponse.json(
      { error: message },
      { status: describeSupabaseFailure(err) ? 503 : 500 }
    );
  }
}
