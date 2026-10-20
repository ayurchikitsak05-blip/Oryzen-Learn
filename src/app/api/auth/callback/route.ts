import { NextResponse, type NextRequest } from "next/server";
import { destinationAfterAuth } from "@/lib/access/gate";
import { createClient } from "@/lib/supabase/server";
import {
  detectDeviceCategory,
  enforceTwoDeviceLock,
} from "@/lib/supabase/device-lock";
import {
  DEVICE_ID_COOKIE_NAME,
  DEVICE_TYPE_COOKIE_NAME,
} from "@/lib/supabase/middleware";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/hub";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth?error=missing_oauth_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      `${origin}/auth?error=${encodeURIComponent(
        error?.message ?? "oauth_exchange_failed"
      )}`
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
    : `oauth-${Date.now()}`;

  await enforceTwoDeviceLock(supabase, {
    userId: data.user.id,
    deviceId: resolvedDeviceId,
    deviceType: resolvedDeviceType,
    sessionTokenHash,
  });

  // Check if user already has a completed prakriti_profile in `profiles`
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("access_status, role")
    .eq("id", data.user.id)
    .maybeSingle();

  const destinationPath = destinationAfterAuth({
    accessStatus: profileRow?.access_status,
    role: profileRow?.role,
  });
  const safeRequested = requestedNext.startsWith("/") ? requestedNext : destinationPath;
  const stayOnGate =
    safeRequested.startsWith("/access") ||
    safeRequested.startsWith("/pricing") ||
    safeRequested.startsWith("/checkout");
  const finalPath =
    destinationPath === "/access" && stayOnGate ? safeRequested : destinationPath;
  const response = NextResponse.redirect(`${origin}${finalPath}`);

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

  return response;
}
