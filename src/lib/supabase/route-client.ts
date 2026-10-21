import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnvConfig } from "./client";

type PendingCookie = {
  name: string;
  value: string;
  options?: CookieOptions;
};

/**
 * Route-handler Supabase client that keeps every auth cookie on the
 * response we actually return. A redirect or JSON response created with
 * NextResponse does not automatically include cookies written only to the
 * Next cookie store, which drops the session and sends the student back
 * to the sign-in page.
 */
export async function createAuthRouteClient(): Promise<{
  supabase: SupabaseClient;
  withCookies: <T extends NextResponse>(response: T) => T;
}> {
  const cookieStore = await cookies();
  const pending: PendingCookie[] = [];
  const { url, anonKey } = getSupabaseEnvConfig();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          pending.push({ name, value, options });
          try {
            cookieStore.set(name, value, options);
          } catch {
            // The response copy below is what the browser receives.
          }
        });
      },
    },
  });

  return {
    supabase,
    withCookies(response) {
      pending.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
      return response;
    },
  };
}
