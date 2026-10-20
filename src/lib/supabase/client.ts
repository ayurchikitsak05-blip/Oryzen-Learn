import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseEnvConfig(): {
  url: string;
  anonKey: string;
  isConfigured: boolean;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const isConfigured = Boolean(
    url &&
      anonKey &&
      !url.includes("placeholder.supabase.co") &&
      anonKey !== "placeholder-anon-key"
  );

  return {
    url: url || "https://placeholder.supabase.co",
    anonKey: anonKey || "placeholder-anon-key",
    isConfigured,
  };
}

export function createClient(): SupabaseClient {
  const { url, anonKey } = getSupabaseEnvConfig();
  return createBrowserClient(url, anonKey);
}
