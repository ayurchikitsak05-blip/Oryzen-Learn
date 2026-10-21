import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { canManageClasses } from "@/lib/access/gate";
import { ensureSignedInProfile } from "@/lib/supabase/ensure-profile";
import { createAuthRouteClient } from "@/lib/supabase/route-client";
import {
  detectDeviceCategory,
  enforceTwoDeviceLock,
} from "@/lib/supabase/device-lock";
import {
  DEVICE_ID_COOKIE_NAME,
  DEVICE_TYPE_COOKIE_NAME,
} from "@/lib/supabase/middleware";

function deviceCookies(
  response: NextResponse,
  deviceId: string,
  deviceType: string
) {
  response.cookies.set(DEVICE_ID_COOKIE_NAME, deviceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  response.cookies.set(DEVICE_TYPE_COOKIE_NAME, deviceType, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type");

  const fail = (message: string) =>
    NextResponse.redirect(
      `${origin}/auth?error=${encodeURIComponent(message)}`
    );

  if (!code && !(tokenHash && otpType)) {
    return fail("That sign-in link is missing its session. Request a new email.");
  }

  try {
    const { supabase, withCookies } = await createAuthRouteClient();
    const exchanged = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          type: otpType as EmailOtpType,
          token_hash: tokenHash ?? "",
        });
    const { data, error } = exchanged;

    if (error || !data.user) {
      return withCookies(
        fail(error?.message ?? "The sign-in link could not be verified.")
      );
    }

    const userAgent = request.headers.get("user-agent") ?? "";
    const explicitDeviceType =
      searchParams.get("device_type") ??
      request.cookies.get(DEVICE_TYPE_COOKIE_NAME)?.value;
    const resolvedDeviceType = detectDeviceCategory(
      userAgent,
      explicitDeviceType
    );
    const resolvedDeviceId =
      searchParams.get("device_id") ??
      request.cookies.get(DEVICE_ID_COOKIE_NAME)?.value ??
      `${resolvedDeviceType}-${data.user.id.slice(0, 8)}`;

    const sessionTokenHash = data.session?.access_token
      ? data.session.access_token.slice(-24)
      : `link-${Date.now()}`;

    try {
      await enforceTwoDeviceLock(supabase, {
        userId: data.user.id,
        deviceId: resolvedDeviceId,
        deviceType: resolvedDeviceType,
        sessionTokenHash,
      });
    } catch {
      // Sign-in can finish even when the device-session table is unavailable.
    }

    const profile = await ensureSignedInProfile(supabase, data.user);
    const destination = canManageClasses(profile.role) ? "/instructor" : "/hub";
    const response = NextResponse.redirect(`${origin}${destination}`);
    deviceCookies(response, resolvedDeviceId, resolvedDeviceType);
    return withCookies(response);
  } catch {
    return fail(
      "Could not reach Supabase to finish sign-in. Request a new email or use your password."
    );
  }
}
