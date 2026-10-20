import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  detectDeviceCategory,
  enforceTwoDeviceLock,
  evaluateTwoDeviceLockPolicy,
  MAX_ACTIVE_DEVICES_PER_USER,
  verifyDeviceSessionActive,
} from "../device-lock";
import {
  AUTHORIZED_DOCUMENTS_BUCKET,
  createAuthorizedDocumentSignedUrl,
} from "../storage";
import type { ActiveDeviceSessionRow } from "../types";

function createInMemorySupabaseForDeviceLock(
  initialSessions: ActiveDeviceSessionRow[] = []
) {
  const store: ActiveDeviceSessionRow[] = initialSessions.map((s) => ({
    ...s,
  }));

  const supabaseMock = {
    from: vi.fn((tableName: string) => {
      if (tableName !== "active_device_sessions") {
        throw new Error(`Unexpected table ${tableName}`);
      }

      return {
        select: vi.fn(() => {
          const filters: Array<(row: ActiveDeviceSessionRow) => boolean> = [];
          const queryBuilder = {
            eq: vi.fn((col: keyof ActiveDeviceSessionRow, val: unknown) => {
              filters.push((row) => row[col] === val);
              return queryBuilder;
            }),
            maybeSingle: vi.fn(async () => {
              const matched = store.filter((r) =>
                filters.every((fn) => fn(r))
              );
              return { data: matched[0] ?? null, error: null };
            }),
            then: (
              resolve: (val: {
                data: ActiveDeviceSessionRow[];
                error: null;
              }) => void
            ) => {
              const matched = store.filter((r) =>
                filters.every((fn) => fn(r))
              );
              resolve({ data: matched, error: null });
            },
          };
          return queryBuilder;
        }),
        update: vi.fn((patch: Partial<ActiveDeviceSessionRow>) => ({
          in: vi.fn(async (col: keyof ActiveDeviceSessionRow, ids: string[]) => {
            store.forEach((row) => {
              if (ids.includes(String(row[col]))) {
                Object.assign(row, patch);
              }
            });
            return { data: null, error: null };
          }),
        })),
        upsert: vi.fn(
          (
            payload: Omit<ActiveDeviceSessionRow, "id" | "created_at">
          ) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                const existingIdx = store.findIndex(
                  (r) =>
                    r.user_id === payload.user_id &&
                    r.device_id === payload.device_id
                );
                if (existingIdx >= 0) {
                  store[existingIdx] = {
                    ...store[existingIdx],
                    ...payload,
                  };
                  return { data: store[existingIdx], error: null };
                }
                const created: ActiveDeviceSessionRow = {
                  id: `sess-${store.length + 1}`,
                  created_at: new Date().toISOString(),
                  ...payload,
                };
                store.push(created);
                return { data: created, error: null };
              }),
            })),
          })
        ),
      };
    }),
  };

  return {
    supabase: supabaseMock as unknown as SupabaseClient,
    store,
  };
}

describe("Layer 1: Supabase Auth & Strict 2-Device Lock (1 Tablet + 1 Phone)", () => {
  it("enforces MAX_ACTIVE_DEVICES_PER_USER = 2", () => {
    expect(MAX_ACTIVE_DEVICES_PER_USER).toBe(2);
  });

  describe("detectDeviceCategory", () => {
    it("identifies iPad and Android tablets as 'tablet'", () => {
      expect(
        detectDeviceCategory(
          "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15"
        )
      ).toBe("tablet");

      expect(
        detectDeviceCategory(
          "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/122.0 Safari/537.36"
        )
      ).toBe("tablet");
    });

    it("identifies iPhone and Android mobile handsets as 'phone'", () => {
      expect(
        detectDeviceCategory(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
        )
      ).toBe("phone");

      expect(
        detectDeviceCategory(
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/122.0 Mobile Safari/537.36"
        )
      ).toBe("phone");
    });

    it("honors explicit 'tablet' or 'phone' override", () => {
      expect(detectDeviceCategory("Mozilla/5.0 (iPhone)", "tablet")).toBe(
        "tablet"
      );
      expect(detectDeviceCategory("Mozilla/5.0 (iPad)", "phone")).toBe("phone");
    });
  });

  describe("evaluateTwoDeviceLockPolicy & enforceTwoDeviceLock", () => {
    const userId = "user-bams-001";

    it("permits 1 active Tablet + 1 active Phone simultaneously with zero revocations", async () => {
      const { supabase, store } = createInMemorySupabaseForDeviceLock();

      // 1. Login on iPad (Tablet slot)
      const tabletRes = await enforceTwoDeviceLock(supabase, {
        userId,
        deviceId: "ipad-air-1",
        deviceType: "tablet",
        deviceLabel: "iPad Air Study",
        sessionTokenHash: "hash-tab-1",
      });
      expect(tabletRes.allowed).toBe(true);
      expect(tabletRes.revokedSessionIds).toHaveLength(0);

      // 2. Login on iPhone (Phone slot)
      const phoneRes = await enforceTwoDeviceLock(supabase, {
        userId,
        deviceId: "iphone-15",
        deviceType: "phone",
        deviceLabel: "iPhone Companion",
        sessionTokenHash: "hash-phn-1",
      });
      expect(phoneRes.allowed).toBe(true);
      expect(phoneRes.revokedSessionIds).toHaveLength(0);

      const activeSessions = store.filter((s) => !s.is_revoked);
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.map((s) => s.device_type).sort()).toEqual([
        "phone",
        "tablet",
      ]);
    });

    it("revokes the older Tablet session when a 2nd Tablet logs in while keeping the Phone session active", async () => {
      const { supabase, store } = createInMemorySupabaseForDeviceLock([
        {
          id: "sess-tab-old",
          user_id: userId,
          device_id: "ipad-old",
          device_type: "tablet",
          device_label: "Old iPad",
          session_token_hash: "tok-1",
          is_revoked: false,
          last_active_at: "2026-10-20T09:00:00.000Z",
          created_at: "2026-10-20T09:00:00.000Z",
        },
        {
          id: "sess-phn-keep",
          user_id: userId,
          device_id: "android-phone-1",
          device_type: "phone",
          device_label: "Android Phone",
          session_token_hash: "tok-2",
          is_revoked: false,
          last_active_at: "2026-10-20T09:30:00.000Z",
          created_at: "2026-10-20T09:30:00.000Z",
        },
      ]);

      // New Galaxy Tab logs into the "tablet" slot
      const result = await enforceTwoDeviceLock(supabase, {
        userId,
        deviceId: "galaxy-tab-s9",
        deviceType: "tablet",
        deviceLabel: "Galaxy Tab S9",
        sessionTokenHash: "tok-3",
      });

      expect(result.revokedSessionIds).toEqual(["sess-tab-old"]);
      expect(result.activeTabletSession?.device_id).toBe("galaxy-tab-s9");
      expect(result.activePhoneSession?.device_id).toBe("android-phone-1");

      // Verify old tablet is now revoked
      const oldTabletCheck = await verifyDeviceSessionActive(
        supabase,
        userId,
        "ipad-old"
      );
      expect(oldTabletCheck.isActive).toBe(false);

      // Verify phone and new tablet remain active
      const phoneCheck = await verifyDeviceSessionActive(
        supabase,
        userId,
        "android-phone-1"
      );
      expect(phoneCheck.isActive).toBe(true);

      const newTabletCheck = await verifyDeviceSessionActive(
        supabase,
        userId,
        "galaxy-tab-s9"
      );
      expect(newTabletCheck.isActive).toBe(true);

      const activeTotal = store.filter((s) => !s.is_revoked);
      expect(activeTotal).toHaveLength(2);
    });

    it("rejects empty or invalid device payloads", () => {
      expect(() =>
        evaluateTwoDeviceLockPolicy([], {
          userId: "",
          deviceId: "dev-1",
          deviceType: "tablet",
          sessionTokenHash: "hash",
        })
      ).toThrow(/Invalid device session payload/);
    });
  });

  describe("Private Storage Bucket Signed URL Helper (authorized-documents)", () => {
    it("creates a short-lived signed URL from the private authorized-documents bucket", async () => {
      const createSignedUrlMock = vi.fn().mockResolvedValue({
        data: {
          signedUrl:
            "https://project.supabase.co/storage/v1/object/sign/authorized-documents/users/u1/mechanics-notes.pdf?token=xyz",
        },
        error: null,
      });

      const supabaseStorageMock = {
        storage: {
          from: vi.fn(() => ({
            createSignedUrl: createSignedUrlMock,
          })),
        },
      } as unknown as SupabaseClient;

      const signed = await createAuthorizedDocumentSignedUrl(
        supabaseStorageMock,
        "users/u1/mechanics-notes.pdf",
        300
      );

      expect(supabaseStorageMock.storage.from).toHaveBeenCalledWith(
        AUTHORIZED_DOCUMENTS_BUCKET
      );
      expect(createSignedUrlMock).toHaveBeenCalledWith(
        "users/u1/mechanics-notes.pdf",
        300
      );
      expect(signed.signedUrl).toContain("authorized-documents");
    });
  });
});
