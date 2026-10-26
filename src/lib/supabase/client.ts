import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isCompleteAnonKey(key: string): boolean {
  return Boolean(key) && key !== "placeholder-anon-key" && !key.includes("...");
}

export function getSupabaseEnvConfig(): {
  url: string;
  anonKey: string;
  isConfigured: boolean;
  keyLooksTruncated: boolean;
} {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const validUrl = isHttpUrl(url) && !url.includes("placeholder.supabase.co");
  const keyLooksTruncated = anonKey.includes("...");
  const validAnon = isCompleteAnonKey(anonKey);

  return {
    url: validUrl ? url : "https://placeholder.supabase.co",
    anonKey: validAnon ? anonKey : "placeholder-anon-key",
    isConfigured: validUrl && validAnon,
    keyLooksTruncated,
  };
}

export function supabaseConfigError(): string | null {
  const { isConfigured, keyLooksTruncated } = getSupabaseEnvConfig();
  if (isConfigured) return null;
  if (keyLooksTruncated) {
    return "The publishable key in .env.local is the shortened dashboard label and still ends with .... Click the copy icon next to the default publishable key (sb_publishable_...) and paste the full value, then restart the local app.";
  }
  return "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";
}

export function describeSupabaseFailure(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/fetch failed|enotfound|getaddrinfo|econnrefused|network/i.test(message)) {
    return "Could not reach Supabase. The project URL in NEXT_PUBLIC_SUPABASE_URL does not resolve, so the email code cannot be sent.";
  }
  return null;
}

export function createClient(): SupabaseClient {
  const { url, anonKey } = getSupabaseEnvConfig();
  return createBrowserClient(url, anonKey);
}
