import type { SupabaseClient } from "@supabase/supabase-js";

export const AUTHORIZED_DOCUMENTS_BUCKET = "authorized-documents";
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 300; // 5-minute short-lived signed URL

/**
 * Generates a short-lived signed URL for an authorized PDF or lecture video stored
 * in the private `authorized-documents` Supabase Storage bucket.
 */
export async function createAuthorizedDocumentSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS
): Promise<{ signedUrl: string; expiresAt: string }> {
  if (!storagePath || storagePath.trim().length === 0) {
    throw new Error("storagePath is required to create a signed URL.");
  }

  const boundedTtl = Math.min(Math.max(60, expiresInSeconds), 3600);

  const { data, error } = await supabase.storage
    .from(AUTHORIZED_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, boundedTtl);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to generate signed URL for authorized document: ${
        error?.message ?? "No URL returned"
      }`
    );
  }

  const expiresAt = new Date(Date.now() + boundedTtl * 1000).toISOString();

  return {
    signedUrl: data.signedUrl,
    expiresAt,
  };
}
