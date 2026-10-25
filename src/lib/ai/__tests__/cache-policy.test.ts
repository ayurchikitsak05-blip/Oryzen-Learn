import { describe, expect, it } from "vitest";
import {
  APP_CACHE_KEY_VERSION,
  authorizeInstituteAppCache,
  buildIsolatedAppCacheKey,
  callerMayReadCachedEntry,
  mayShareAppCache,
  resolveAppCacheScope,
  type AppCacheAuthorization,
} from "../cache-policy";

function authorizedSyllabus(
  overrides: Partial<AppCacheAuthorization> = {}
): AppCacheAuthorization {
  return {
    documentClass: "institute_authorized_syllabus",
    tenantId: "inst-north",
    syllabusHash: "syl-physics-v3",
    authorizedShare: true,
    revoked: false,
    revocationEpoch: "2026-10-01",
    individualized: false,
    ...overrides,
  };
}

describe("institute-authorized app cache policy", () => {
  it("shares only authorized syllabus hashes", () => {
    expect(mayShareAppCache(authorizedSyllabus())).toBe(true);
    expect(resolveAppCacheScope(authorizedSyllabus())).toBe("institute_authorized");
  });

  it("never shares notes, private uploads, prakriti, or individualized output", () => {
    expect(
      mayShareAppCache(authorizedSyllabus({ documentClass: "notes" }))
    ).toBe(false);
    expect(
      mayShareAppCache(authorizedSyllabus({ documentClass: "private_upload" }))
    ).toBe(false);
    expect(
      mayShareAppCache(authorizedSyllabus({ prakritiDosha: "Pitta" }))
    ).toBe(false);
    expect(
      mayShareAppCache(authorizedSyllabus({ individualized: true }))
    ).toBe(false);
    expect(mayShareAppCache(authorizedSyllabus({ revoked: true }))).toBe(false);
    expect(
      mayShareAppCache(authorizedSyllabus({ authorizedShare: false }))
    ).toBe(false);
  });

  it("isolates private keys by user and shared keys by tenant + revocation epoch", async () => {
    const sharedA = await buildIsolatedAppCacheKey({
      auth: authorizedSyllabus(),
      userId: "student-a",
      documentHash: "doc-1",
      pageNumber: 2,
      selectionHash: "sel-1",
      lensType: "explain",
    });
    const sharedB = await buildIsolatedAppCacheKey({
      auth: authorizedSyllabus(),
      userId: "student-b",
      documentHash: "doc-1",
      pageNumber: 2,
      selectionHash: "sel-1",
      lensType: "explain",
    });
    expect(sharedA.shareable).toBe(true);
    expect(sharedA.cacheKey).toBe(sharedB.cacheKey);
    expect(sharedA.layer).toBe("app_zero_inference");
    expect(APP_CACHE_KEY_VERSION).toMatch(/v1/);

    const privateA = await buildIsolatedAppCacheKey({
      auth: authorizedSyllabus({ documentClass: "private_upload" }),
      userId: "student-a",
      documentHash: "doc-1",
      pageNumber: 2,
      selectionHash: "sel-1",
      lensType: "explain",
    });
    const privateB = await buildIsolatedAppCacheKey({
      auth: authorizedSyllabus({ documentClass: "private_upload" }),
      userId: "student-b",
      documentHash: "doc-1",
      pageNumber: 2,
      selectionHash: "sel-1",
      lensType: "explain",
    });
    expect(privateA.shareable).toBe(false);
    expect(privateA.cacheKey).not.toBe(privateB.cacheKey);
    const illustrate = await buildIsolatedAppCacheKey({
      auth: authorizedSyllabus({ documentClass: "private_upload" }),
      userId: "student-a",
      documentHash: "doc-1",
      pageNumber: 2,
      selectionHash: "sel-1",
      lensType: "illustrative",
    });
    expect(illustrate.cacheKey).not.toBe(privateA.cacheKey);

    const revoked = await buildIsolatedAppCacheKey({
      auth: authorizedSyllabus({ revocationEpoch: "2026-10-21" }),
      userId: "student-a",
      documentHash: "doc-1",
      pageNumber: 2,
      selectionHash: "sel-1",
      lensType: "explain",
    });
    expect(revoked.cacheKey).not.toBe(sharedA.cacheKey);
  });

  it("authorizes shared cache only for members and authorized hashes", () => {
    const membership = {
      tenantId: "inst-north",
      userId: "student-a",
      authorizedSyllabusHashes: ["syl-physics-v3"],
      revocationEpoch: "2026-10-01",
    };
    const shared = authorizeInstituteAppCache({
      userId: "student-a",
      documentHash: "syl-physics-v3",
      membership,
      documentClass: "institute_authorized_syllabus",
      lensType: "explain",
    });
    expect(mayShareAppCache(shared)).toBe(true);

    const outsider = authorizeInstituteAppCache({
      userId: "student-b",
      documentHash: "syl-physics-v3",
      membership,
      documentClass: "institute_authorized_syllabus",
      lensType: "explain",
    });
    expect(mayShareAppCache(outsider)).toBe(false);

    const otherHash = authorizeInstituteAppCache({
      userId: "student-a",
      documentHash: "private-notes-hash",
      membership,
      documentClass: "institute_authorized_syllabus",
      lensType: "explain",
    });
    expect(mayShareAppCache(otherHash)).toBe(false);

    const notes = authorizeInstituteAppCache({
      userId: "student-a",
      documentHash: "syl-physics-v3",
      membership,
      documentClass: "notes",
      lensType: "explain",
    });
    expect(mayShareAppCache(notes)).toBe(false);

    const prakriti = authorizeInstituteAppCache({
      userId: "student-a",
      documentHash: "syl-physics-v3",
      membership,
      documentClass: "institute_authorized_syllabus",
      lensType: "ayurvedic",
      prakritiDosha: "Pitta",
    });
    expect(mayShareAppCache(prakriti)).toBe(false);
  });

  it("denies stale or foreign cache entries after revocation", () => {
    const auth = authorizedSyllabus();
    expect(
      callerMayReadCachedEntry({
        auth,
        userId: "student-a",
        entryScope: "institute_authorized",
        entryTenantId: "inst-north",
        entryRevocationEpoch: "2026-10-01",
        entryCacheVersion: APP_CACHE_KEY_VERSION,
      })
    ).toBe(true);
    expect(
      callerMayReadCachedEntry({
        auth: authorizedSyllabus({ revocationEpoch: "2026-10-21" }),
        userId: "student-a",
        entryScope: "institute_authorized",
        entryTenantId: "inst-north",
        entryRevocationEpoch: "2026-10-01",
        entryCacheVersion: APP_CACHE_KEY_VERSION,
      })
    ).toBe(false);
    expect(
      callerMayReadCachedEntry({
        auth: authorizedSyllabus({ documentClass: "notes", authorizedShare: false }),
        userId: "student-b",
        entryScope: "private",
        entryUserId: "student-a",
      })
    ).toBe(false);
  });
});
