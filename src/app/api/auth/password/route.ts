import { NextResponse, type NextRequest } from "next/server";
import { destinationAfterAuth } from "@/lib/access/gate";
import { createClient } from "@/lib/supabase/server";
import { detectDeviceCategory, enforceTwoDeviceLock } from "@/lib/supabase/device-lock";
import {
  DEVICE_ID_COOKIE_NAME,
  DEVICE_TYPE_COOKIE_NAME,
} from "@/lib/supabase/middleware";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action?: "sign_in" | "sign_up";
      email?: string;
      password?: string;
      deviceId?: string;
      deviceType?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || password.length < 8) {
      return NextResponse.json(
        { error: "Use an email and a password of at least 8 characters." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const authResult =
      body.action === "sign_up"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (authResult.error || !authResult.data.user) {
      return NextResponse.json(
        { error: authResult.error?.message ?? "Unable to sign in." },
        { status: 401 }
      );
    }

    if (!authResult.data.session) {
      return NextResponse.json({
        status: "confirm_email",
        email,
      });
    }

    const userAgent = request.headers.get("user-agent") ?? "";
    const resolvedDeviceType = detectDeviceCategory(userAgent, body.deviceType);
    const resolvedDeviceId =
      body.deviceId?.trim() ||
      request.cookies.get(DEVICE_ID_COOKIE_NAME)?.value ||
      `${resolvedDeviceType}-${authResult.data.user.id.slice(0, 8)}`;

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

    const { data: profile } = await supabase
      .from("profiles")
      .select("access_status, role")
      .eq("id", authResult.data.user.id)
      .maybeSingle();

    const response = NextResponse.json({
      status: "authenticated",
      next: destinationAfterAuth({
        accessStatus: profile?.access_status,
        role: profile?.role,
      }),
      deviceLock: {
        deviceType: resolvedDeviceType,
        deviceId: resolvedDeviceId,
        revokedSessionIds: lockResult.revokedSessionIds,
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

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-in failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
