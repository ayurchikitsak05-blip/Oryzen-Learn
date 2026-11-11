import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { allowsLocalOwnerDemoBypass, OWNER_DEMO_COOKIE } from "@/lib/demo/owner-demo";
import {
  PUBLIC_DEMO_COOKIE,
  PUBLIC_DEMO_VISITOR_COOKIE,
  isPublicDemoSession,
} from "@/lib/demo/public-demo";
import { canManageClasses, decideAccessRedirect, isEntitled } from "@/lib/access/gate";
import { proHasExpired } from "@/lib/billing/pro-expiry";
import { consentBlocksApi, consentGate, consentRedirect, indiaToday, type ConsentGate } from "@/lib/consent/age";
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

  const publicDemo = isPublicDemoSession({
    hostname: request.nextUrl.hostname,
    cookieValue: request.cookies.get(PUBLIC_DEMO_COOKIE)?.value,
    visitorId: request.cookies.get(PUBLIC_DEMO_VISITOR_COOKIE)?.value,
    vercelEnv: process.env.VERCEL_ENV,
  });

  const { url, anonKey, isConfigured } = getSupabaseEnvConfig();
  if (!isConfigured) {
    if (publicDemo) {
      const pathname = request.nextUrl.pathname;
      if (pathname === "/auth" || pathname.startsWith("/auth/")) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/hub";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }
      if (pathname === "/pricing" || pathname.startsWith("/pricing/")) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/hub";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }
      return supabaseResponse;
    }
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

  if (publicDemo && !user) {
    user = { id: request.cookies.get(PUBLIC_DEMO_VISITOR_COOKIE)!.value };
  }

  const deviceId = request.cookies.get(DEVICE_ID_COOKIE_NAME)?.value;

  // Enforce Strict 2-Device Lock on authenticated sessions when device cookie is present
  if (user && deviceId && !publicDemo) {
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
  let gate: ConsentGate = null;
  if (publicDemo) {
    accessStatus = "trial";
    role = "student";
  } else if (user) {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        // "*" so this still works before the parental-consent columns exist.
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (!error && profile) {
        const row = profile as Record<string, unknown>;
        accessStatus = (row.access_status as string | null) ?? null;
        role = (row.role as string | null) ?? null;
        // Monthly Pro that wasn't renewed: back to Free (the database function only moves down).
        if (proHasExpired(row)) {
          accessStatus = "free";
          const { error: expireError } = await supabase.rpc("expire_my_pro");
          if (expireError) console.warn(JSON.stringify({ event: "expire_my_pro_failed", message: expireError.message }));
        }
        gate = consentGate({
          role,
          // undefined (column missing) switches the check off until the migration is applied.
          birthMonth: "birth_month" in row ? ((row.birth_month as string | null) ?? null) : undefined,
          parentConsentAt: (row.parent_consent_at as string | null | undefined) ?? null,
          today: indiaToday(),
        });
      }
    } catch {
      accessStatus = null;
      role = null;
    }
  }

  // Age check and parental consent (DPDP) come before everything else, including plans.
  if (user && gate) {
    if (consentBlocksApi(pathname, gate)) {
      return NextResponse.json(
        { error: gate === "age_check" ? "Add your date of birth first." : "A parent needs to agree first.", code: gate },
        { status: 403 }
      );
    }
    const consentPath = consentRedirect(pathname, gate);
    if (consentPath) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = consentPath;
      redirectUrl.search = "";
      if (consentPath === "/age-check") redirectUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      const redirectResponse = NextResponse.redirect(redirectUrl);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });
      return redirectResponse;
    }
  }

  const apiOpen =
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/access") ||
    pathname.startsWith("/api/consent") ||
    pathname.startsWith("/api/billing/checkout") ||
    pathname.startsWith("/api/billing/stripe") ||
    pathname.startsWith("/api/billing/subscription") ||
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
  const localOwnerDemo = allowsLocalOwnerDemoBypass({
    hostname: request.nextUrl.hostname,
    vercelEnv: process.env.VERCEL_ENV,
    cookieValue: request.cookies.get(OWNER_DEMO_COOKIE)?.value,
  });
  const stayOnSignInForm =
    (pathname === "/auth" && request.nextUrl.searchParams.get("form") === "1") ||
    pathname === "/auth/reset-password" ||
    pathname.startsWith("/auth/reset-password/");
  if (
    localOwnerDemo &&
    !pathname.startsWith("/api") &&
    (redirectPath === "/auth" || redirectPath === "/pricing")
  ) {
    return supabaseResponse;
  }
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
