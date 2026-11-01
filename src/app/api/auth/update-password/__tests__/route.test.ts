import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const getSession = vi.fn();
const updateUser = vi.fn();
const withCookies = vi.fn((response: Response) => response);

vi.mock("@/lib/supabase/route-client", () => ({
  createAuthRouteClient: vi.fn(async () => ({
    supabase: {
      auth: {
        getUser,
        getSession,
        updateUser,
      },
    },
    withCookies,
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabaseConfigError: () => null,
  describeSupabaseFailure: () => null,
}));

vi.mock("@/lib/supabase/ensure-profile", () => ({
  ensureSignedInProfile: vi.fn(async () => ({
    access_status: "free",
    role: "student",
    prakriti_profile: { dosha: "vata" },
  })),
}));

vi.mock("@/lib/supabase/device-lock", () => ({
  detectDeviceCategory: () => "tablet",
  enforceTwoDeviceLock: vi.fn(async () => ({ revokedSessionIds: [] })),
}));

vi.mock("@/lib/access/gate", () => ({
  destinationAfterAuth: () => "/hub",
}));

describe("POST /api/auth/update-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "student@example.com" } },
      error: null,
    });
    getSession.mockResolvedValue({
      data: { session: { access_token: "token-abcdefghijklmnopqrstuv" } },
      error: null,
    });
    updateUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    withCookies.mockImplementation((response: Response) => response);
  });

  it("rejects mismatched passwords before touching Auth", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: "long-enough",
          confirmPassword: "different!!",
        }),
      }) as never
    );
    const json = (await response.json()) as { code?: string };
    expect(response.status).toBe(400);
    expect(json.code).toBe("password_mismatch");
    expect(updateUser).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("requires an authenticated recovery session", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "missing" } });
    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: "long-enough",
          confirmPassword: "long-enough",
        }),
      }) as never
    );
    const json = (await response.json()) as { code?: string };
    expect(response.status).toBe(401);
    expect(json.code).toBe("recovery_session_missing");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("updates the password for the signed-in user and never calls rpc", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: "long-enough",
          confirmPassword: "long-enough",
          deviceId: "tablet-test",
        }),
      }) as never
    );
    const json = (await response.json()) as {
      status?: string;
      next?: string;
      error?: string;
    };
    expect(json.error ?? null).toBeNull();
    expect(response.status).toBe(200);
    expect(json.status).toBe("password_updated");
    expect(json.next).toBe("/hub");
    expect(updateUser).toHaveBeenCalledWith({ password: "long-enough" });
  });
});
