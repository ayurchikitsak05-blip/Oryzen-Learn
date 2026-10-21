/**
 * App-level (zero-inference) cache keys vs provider prompt-token cache.
 *
 * Provider prompt cache (Google / OpenAI / Mistral) is billed on their side and
 * never stores ORYZEN student payloads in our database. It does not authorize
 * cross-tenant reuse of notes, uploads, prakriti, or individualized output.
 *
 * App cache can skip inference entirely. Share it only for institute-authorized
 * syllabus hashes. Never share notes, private uploads, prakriti, or individualized
 * outputs. Tenant isolation, a cache version, and a revocation epoch are required.
 *
 * This module does not apply database policy changes. Shield 3 in gateway.ts is
 * still a local selection cache and is not an authorized institute share.
 */

import { computeSha256Hex } from "@/lib/reader/hashing";

export const APP_CACHE_KEY_VERSION = "oryzen-app-cache-v1";

export type CacheLayer = "provider_prompt_cache" | "app_zero_inference";

export type DocumentClass =
  | "institute_authorized_syllabus"
  | "private_upload"
  | "notes"
  | "prakriti"
  | "individualized";

export type AppCacheScope = "private" | "institute_authorized";

export interface AppCacheAuthorization {
  documentClass: DocumentClass;
  tenantId: string;
  syllabusHash?: string | null;
  authorizedShare: boolean;
  revoked: boolean;
  revocationEpoch: string;
  prakritiDosha?: string | null;
  individualized: boolean;
}

export function mayShareAppCache(auth: AppCacheAuthorization): boolean {
  if (auth.revoked) return false;
  if (auth.individualized) return false;
  if (auth.prakritiDosha) return false;
  if (auth.documentClass !== "institute_authorized_syllabus") return false;
  if (!auth.authorizedShare) return false;
  if (!auth.tenantId.trim()) return false;
  if (!auth.syllabusHash?.trim()) return false;
  return true;
}

export function resolveAppCacheScope(auth: AppCacheAuthorization): AppCacheScope {
  return mayShareAppCache(auth) ? "institute_authorized" : "private";
}

/**
 * Builds a tenant-isolated app cache key. Shared keys include tenant, syllabus
 * hash, version, and revocation epoch. Private keys include userId so the same
 * PDF hash cannot leak across students.
 */
export async function buildIsolatedAppCacheKey(params: {
  auth: AppCacheAuthorization;
  userId: string;
  documentHash: string;
  pageNumber: number;
  selectionHash: string;
  lensType: string;
}): Promise<{
  cacheKey: string;
  scope: AppCacheScope;
  shareable: boolean;
  layer: CacheLayer;
}> {
  const shareable = mayShareAppCache(params.auth);
  const scope = shareable ? "institute_authorized" : "private";
  const ownerPart = shareable
    ? `tenant:${params.auth.tenantId.trim().toLowerCase()}`
    : `user:${params.userId.trim().toLowerCase()}`;
  const syllabusPart = shareable
    ? params.auth.syllabusHash!.trim().toLowerCase()
    : params.documentHash.trim().toLowerCase();
  const raw = [
    APP_CACHE_KEY_VERSION,
    scope,
    ownerPart,
    `rev:${params.auth.revocationEpoch}`,
    `syl:${syllabusPart}`,
    `p:${params.pageNumber}`,
    `sel:${params.selectionHash}`,
    `lens:${params.lensType}`,
  ].join("|");
  return {
    cacheKey: await computeSha256Hex(raw),
    scope,
    shareable,
    layer: "app_zero_inference",
  };
}
