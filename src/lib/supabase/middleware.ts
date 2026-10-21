import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canManageClasses, decideAccessRedirect, isEntitled } from "@/lib/access/gate";
import { getSupabaseEnvConfig } from "./client";
import { verifyDeviceSessionActive } from "./device-lock";

export const DEVICE_ID_COOKIE_NAME = "prakriti_device_id";
export const DEVICE_TYPE_COOKIE_NAME = "prakriti_device_type";

function pendingAuthCallback(request: NextRequest): URL | null {
  if (request.nextUrl.pathname.startsWith("/api/auth/callback")) return null;

  const directCode = request.nextUrl.searchParams.get("code");
  const directHash = request.nextUrl.searchParams.get("token_hash");
  if (directCode || directHash) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/auth/callback";
    return url;
  }

  const next = request.nextUrl.searchParams.get("next");
  if (!next) return null;
  try {
    const nested = new URL(next, request.nextUrl.origin);
    const code = nested.searchParams.get("code");
    const tokenHash = nested.searchParams.get("token_hash");
    if (!code && !tokenHash) return null;
    const url = request.nextUrl.clone();
    url.pathname = "/api/auth/callback";
    url.search = "";
    if (code) url.searchParams.set("code", code);
    if (tokenHash) url.searchParams.set("token_hash", tokenHash);
    const type = nested.searchParams.get("type");
    if (type) url.searchParams.set("type", type);
    nested.searchParams.delete("code");
    nested.searchParams.delete("token_hash");
    nested.searchParams.delete("type");
    const remainder = `${nested.pathname}${nested.search}`;
    if (remainder && remainder !== "/") url.searchParams.set("next", remainder);
    return url;
  } catch {
    return null;
  }
}

export async function updateSession(
  request: NextRequest
): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const { url, anonKey, isConfigured } = getSupabaseEnvConfig();
  if (!isConfigured) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const callbackUrl = pendingAuthCallback(request);
  if (callbackUrl) {
    const redirectResponse = NextResponse.redirect(callbackUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  const deviceId = request.cookies.get(DEVICE_ID_COOKIE_NAME)?.value;

  // Enforce Strict 2-Device Lock on authenticated sessions when device cookie is present
  if (user && deviceId) {
    try {
      const { isActive, session } = await verifyDeviceSessionActive(
        supabase,
        user.id,
        deviceId
      );

      if (session && !isActive) {
        await supabase.auth.signOut();
        const revokedUrl = request.nextUrl.clone();
        revokedUrl.pathname = "/auth";
        revokedUrl.searchParams.set("reason", "device_limit_revoked");
        const redirectResponse = NextResponse.redirect(revokedUrl);
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie);
        });
        return redirectResponse;
      }
    } catch {
      // A missing device table or unreachable host must not take down the request.
    }
  }

  const pathname = request.nextUrl.pathname;
  let accessStatus: string | null = null;
  let role: string | null = null;
  if (user) {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("access_status, role")
        .eq("id", user.id)
        .maybeSingle();
      if (!error && profile) {
        accessStatus = profile.access_status ?? null;
        role = profile.role ?? null;
      }
    } catch {
      accessStatus = null;
      role = null;
    }
  }

  const apiOpen =
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/access") ||
    pathname.startsWith("/api/billing/checkout") ||
    pathname.startsWith("/api/billing/stripe") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/instructor");
  if (
    user &&
    pathname.startsWith("/api") &&
    !apiOpen &&
    !canManageClasses(role) &&
    !isEntitled(accessStatus)
  ) {
    return NextResponse.json({ error: "Access required." }, { status: 403 });
  }

  const redirectPath = decideAccessRedirect({
    pathname,
    isAuthenticated: Boolean(user),
    accessStatus,
    role,
  });
  const stayOnSignInForm =
    pathname === "/auth" && request.nextUrl.searchParams.get("form") === "1";
  if (redirectPath && !stayOnSignInForm) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = redirectPath;
    redirectUrl.search = "";
    if (redirectPath === "/auth" && pathname !== "/auth") {
      redirectUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    }
    const redirectResponse = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  return supabaseResponse;
}
