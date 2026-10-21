import { NextResponse, type NextRequest } from "next/server";
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

/**
 * Finishes an email sign-in link after the browser has stored the session
 * from the URL hash. Registers the device and confirms the profile, then
 * tells the page to open the study hub.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      deviceId?: string;
      deviceType?: string;
    };
    const { supabase, withCookies } = await createAuthRouteClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { error: "The sign-in link did not create a session." },
        { status: 401 }
      );
    }

    const userAgent = request.headers.get("user-agent") ?? "";
    const resolvedDeviceType = detectDeviceCategory(userAgent, body.deviceType);
    const resolvedDeviceId =
      body.deviceId?.trim() ||
      request.cookies.get(DEVICE_ID_COOKIE_NAME)?.value ||
      `${resolvedDeviceType}-${user.id.slice(0, 8)}`;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      await enforceTwoDeviceLock(supabase, {
        userId: user.id,
        deviceId: resolvedDeviceId,
        deviceType: resolvedDeviceType,
        sessionTokenHash:
          sessionData.session?.access_token.slice(-24) ?? `link-${Date.now()}`,
      });
    } catch {
      // Device registration is optional for finishing the link.
    }

    const profile = await ensureSignedInProfile(supabase, user);
    const response = NextResponse.json({
      status: "authenticated",
      next: canManageClasses(profile.role) ? "/instructor" : "/hub",
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
  } catch {
    return NextResponse.json(
      { error: "Could not finish the email sign-in." },
      { status: 500 }
    );
  }
}
