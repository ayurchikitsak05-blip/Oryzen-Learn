import { NextResponse, type NextRequest } from "next/server";
import { destinationAfterAuth } from "@/lib/access/gate";
import { describeSupabaseFailure, supabaseConfigError } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import {
  detectDeviceCategory,
  enforceTwoDeviceLock,
} from "@/lib/supabase/device-lock";
import {
  DEVICE_ID_COOKIE_NAME,
  DEVICE_TYPE_COOKIE_NAME,
} from "@/lib/supabase/middleware";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action: "send" | "verify";
      email?: string;
      token?: string;
      deviceId?: string;
      deviceType?: string;
      deviceLabel?: string;
    };

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

    const supabase = await createClient();

    if (body.action === "send") {
      const origin = request.nextUrl.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${origin}/api/auth/callback`,
        },
      });

      if (error) {
        const friendly = describeSupabaseFailure(error.message);
        return NextResponse.json(
          { error: friendly ?? error.message },
          { status: friendly ? 503 : 400 }
        );
      }

      return NextResponse.json({
        status: "otp_sent",
        email,
      });
    }

    if (body.action === "verify") {
      const token = body.token?.trim();
      if (!token) {
        return NextResponse.json(
          { error: "OTP verification code is required." },
          { status: 400 }
        );
      }

      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      });

      if (error || !data.user) {
        return NextResponse.json(
          { error: error?.message ?? "Invalid or expired OTP token." },
          { status: 401 }
        );
      }

      const userAgent = request.headers.get("user-agent") ?? "";
      const resolvedDeviceType = detectDeviceCategory(
        userAgent,
        body.deviceType
      );
      const resolvedDeviceId =
        body.deviceId?.trim() ||
        request.cookies.get(DEVICE_ID_COOKIE_NAME)?.value ||
        `${resolvedDeviceType}-${data.user.id.slice(0, 8)}`;

      const sessionTokenHash = data.session?.access_token
        ? data.session.access_token.slice(-24)
        : `otp-${Date.now()}`;

      let revokedSessionIds: string[] = [];
      try {
        const lockResult = await enforceTwoDeviceLock(supabase, {
          userId: data.user.id,
          deviceId: resolvedDeviceId,
          deviceType: resolvedDeviceType,
          deviceLabel: body.deviceLabel,
          sessionTokenHash,
        });
        revokedSessionIds = lockResult.revokedSessionIds;
      } catch {
        revokedSessionIds = [];
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("access_status, role")
        .eq("id", data.user.id)
        .maybeSingle();

      const response = NextResponse.json({
        status: "authenticated",
        next: destinationAfterAuth({
          accessStatus: profile?.access_status,
          role: profile?.role,
        }),
        userId: data.user.id,
        email: data.user.email,
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

      return response;
    }

    return NextResponse.json(
      { error: "Unsupported OTP action. Use 'send' or 'verify'." },
      { status: 400 }
    );
  } catch (err) {
    const message =
      describeSupabaseFailure(err) ??
      (err instanceof Error ? err.message : "Authentication request failed.");
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
