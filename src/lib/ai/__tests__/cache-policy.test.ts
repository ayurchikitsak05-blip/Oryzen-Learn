import { describe, expect, it } from "vitest";
import {
  APP_CACHE_KEY_VERSION,
  buildIsolatedAppCacheKey,
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
});
