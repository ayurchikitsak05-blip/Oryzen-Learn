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
 * This module does not apply database policy changes. Gateway lookup is by
 * isolated cache_key only. Shared hits require membership + authorized hash.
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

export const NEVER_SHARED_DOCUMENT_CLASSES: DocumentClass[] = [
  "private_upload",
  "notes",
  "prakriti",
  "individualized",
];

export interface InstituteCacheMembership {
  tenantId: string;
  userId: string;
  authorizedSyllabusHashes: string[];
  revocationEpoch: string;
  revoked?: boolean;
}

export function isPrakritiPersonalizedLens(lensType: string): boolean {
  return lensType === "ayurvedic" || lensType === "prakriti";
}

/**
 * Shared cache requires membership on this tenant AND the document hash on
 * the institute's authorized syllabus list. Notes, uploads, prakriti, and
 * individualized outputs stay private even when the caller claims a share.
 */
export function authorizeInstituteAppCache(params: {
  userId: string;
  documentHash: string;
  membership?: InstituteCacheMembership | null;
  documentClass?: DocumentClass;
  lensType?: string;
  individualized?: boolean;
  prakritiDosha?: string | null;
}): AppCacheAuthorization {
  const hash = params.documentHash.trim().toLowerCase();
  const membership = params.membership;
  const memberMatches =
    Boolean(membership) &&
    membership!.userId.trim().toLowerCase() === params.userId.trim().toLowerCase() &&
    membership!.tenantId.trim() !== "" &&
    !membership!.revoked &&
    membership!.authorizedSyllabusHashes.some(
      (item) => item.trim().toLowerCase() === hash
    );

  const requestedClass = params.documentClass ?? "private_upload";
  const prakritiPersonalized =
    Boolean(params.prakritiDosha) ||
    (params.lensType ? isPrakritiPersonalizedLens(params.lensType) : false);
  const individualized =
    Boolean(params.individualized) ||
    prakritiPersonalized ||
    NEVER_SHARED_DOCUMENT_CLASSES.includes(requestedClass) ||
    params.lensType === "deep_integrative_synthesis";

  const shareable =
    memberMatches &&
    !individualized &&
    requestedClass === "institute_authorized_syllabus";

  return {
    documentClass: shareable ? "institute_authorized_syllabus" : requestedClass,
    tenantId: shareable ? membership!.tenantId : "",
    syllabusHash: shareable ? hash : null,
    authorizedShare: shareable,
    revoked: Boolean(membership?.revoked),
    revocationEpoch: membership?.revocationEpoch ?? "0",
    prakritiDosha: prakritiPersonalized ? params.prakritiDosha ?? null : null,
    individualized,
  };
}

export function callerMayReadCachedEntry(params: {
  auth: AppCacheAuthorization;
  userId: string;
  entryScope: AppCacheScope;
  entryUserId?: string;
  entryTenantId?: string;
  entryRevocationEpoch?: string;
  entryCacheVersion?: string;
}): boolean {
  if (params.entryCacheVersion && params.entryCacheVersion !== APP_CACHE_KEY_VERSION) {
    return false;
  }
  if (params.auth.revoked) return false;
  if (params.entryScope === "private") {
    return (
      Boolean(params.entryUserId) &&
      params.entryUserId!.trim().toLowerCase() === params.userId.trim().toLowerCase()
    );
  }
  if (!mayShareAppCache(params.auth)) return false;
  if (
    params.entryTenantId &&
    params.entryTenantId.trim().toLowerCase() !==
      params.auth.tenantId.trim().toLowerCase()
  ) {
    return false;
  }
  if (
    params.entryRevocationEpoch &&
    params.entryRevocationEpoch !== params.auth.revocationEpoch
  ) {
    return false;
  }
  return true;
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
    params.lensType === "illustrative" ? "diagram:relations-v2" : "",
  ]
    .filter(Boolean)
    .join("|");
  return {
    cacheKey: await computeSha256Hex(raw),
    scope,
    shareable,
    layer: "app_zero_inference",
  };
}
