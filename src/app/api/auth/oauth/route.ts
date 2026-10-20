import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectDeviceCategory } from "@/lib/supabase/device-lock";
import {
  DEVICE_ID_COOKIE_NAME,
  DEVICE_TYPE_COOKIE_NAME,
} from "@/lib/supabase/middleware";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      deviceId?: string;
      deviceType?: string;
      next?: string;
    };

    const userAgent = request.headers.get("user-agent") ?? "";
    const resolvedDeviceType = detectDeviceCategory(userAgent, body.deviceType);
    const resolvedDeviceId =
      body.deviceId?.trim() ||
      request.cookies.get(DEVICE_ID_COOKIE_NAME)?.value ||
      `${resolvedDeviceType}-${Date.now()}`;

    const supabase = await createClient();
    const origin = request.nextUrl.origin;
    const nextPath = body.next ?? "/hub";

    const callbackUrl = new URL("/api/auth/callback", origin);
    callbackUrl.searchParams.set("next", nextPath);
    callbackUrl.searchParams.set("device_type", resolvedDeviceType);
    callbackUrl.searchParams.set("device_id", resolvedDeviceId);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

    if (error || !data.url) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to initialize Google OAuth." },
        { status: 400 }
      );
    }

    const response = NextResponse.json({
      url: data.url,
      deviceType: resolvedDeviceType,
      deviceId: resolvedDeviceId,
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

    return response;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "OAuth initialization failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
