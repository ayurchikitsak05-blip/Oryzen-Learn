import { NextResponse, type NextRequest } from "next/server";
import { destinationAfterAuth } from "@/lib/access/gate";
import { describeSupabaseFailure, supabaseConfigError } from "@/lib/supabase/client";
import { ensureSignedInProfile } from "@/lib/supabase/ensure-profile";
import {
  describePasswordUpdateFailure,
  validateNewPasswordInput,
} from "@/lib/supabase/password-reset";
import { createAuthRouteClient } from "@/lib/supabase/route-client";
import { detectDeviceCategory, enforceTwoDeviceLock } from "@/lib/supabase/device-lock";
import {
  DEVICE_ID_COOKIE_NAME,
  DEVICE_TYPE_COOKIE_NAME,
} from "@/lib/supabase/middleware";

/**
 * Sets a new password for the authenticated recovery session.
 * Never accepts an email target and never invokes the removed password RPC.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      password?: string;
      confirmPassword?: string;
      deviceId?: string;
      deviceType?: string;
    };

    const validation = validateNewPasswordInput({
      password: body.password ?? "",
      confirmPassword: body.confirmPassword ?? "",
    });
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, code: validation.code },
        { status: 400 }
      );
    }

    const configError = supabaseConfigError();
    if (configError) {
      return NextResponse.json({ error: configError }, { status: 503 });
    }

    const { supabase, withCookies } = await createAuthRouteClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error:
            "That recovery link is invalid or has already expired. Request a new email from the sign-in page.",
          code: "recovery_session_missing",
        },
        { status: 401 }
      );
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: validation.password,
    });
    if (updateError) {
      const failure = describePasswordUpdateFailure(updateError.message);
      return NextResponse.json(
        { error: failure.error, code: "password_update_failed" },
        { status: failure.status }
      );
    }

    const userAgent = request.headers.get("user-agent") ?? "";
    const resolvedDeviceType = detectDeviceCategory(userAgent, body.deviceType);
    const resolvedDeviceId =
      body.deviceId?.trim() ||
      request.cookies.get(DEVICE_ID_COOKIE_NAME)?.value ||
      `${resolvedDeviceType}-${user.id.slice(0, 8)}`;

    let revokedSessionIds: string[] = [];
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const lockResult = await enforceTwoDeviceLock(supabase, {
        userId: user.id,
        deviceId: resolvedDeviceId,
        deviceType: resolvedDeviceType,
        deviceLabel:
          resolvedDeviceType === "tablet"
            ? "Primary Study Tablet"
            : "Companion Study Phone",
        sessionTokenHash:
          sessionData.session?.access_token.slice(-24) ?? `reset-${Date.now()}`,
      });
      revokedSessionIds = lockResult.revokedSessionIds;
    } catch {
      revokedSessionIds = [];
    }

    const profile = await ensureSignedInProfile(supabase, user);
    const response = NextResponse.json({
      status: "password_updated",
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
      (err instanceof Error ? err.message : "Unable to save that password.");
    return NextResponse.json(
      { error: message },
      { status: describeSupabaseFailure(err) ? 503 : 500 }
    );
  }
}
