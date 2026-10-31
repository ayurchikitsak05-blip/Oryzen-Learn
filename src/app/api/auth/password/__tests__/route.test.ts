import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const rpc = vi.fn();
const withCookies = vi.fn((response: Response) => response);

vi.mock("@/lib/supabase/route-client", () => ({
  createAuthRouteClient: vi.fn(async () => ({
    supabase: {
      auth: {
        signInWithPassword,
        signUp,
      },
      rpc,
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
    prakriti_profile: null,
  })),
}));

vi.mock("@/lib/supabase/device-lock", () => ({
  detectDeviceCategory: () => "tablet",
  enforceTwoDeviceLock: vi.fn(async () => ({ revokedSessionIds: [] })),
}));

vi.mock("@/lib/access/gate", () => ({
  destinationAfterAuth: () => "/hub",
}));

describe("POST /api/auth/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });
  });

  it("rejects replace_password and never calls the takeover RPC", async () => {
    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "replace_password",
        email: "victim@example.com",
        password: "new-secret-password",
      }),
    });

    const response = await POST(request as never);
    const json = (await response.json()) as {
      code?: string;
      error?: string;
    };

    expect(response.status).toBe(403);
    expect(json.code).toBe("password_replace_disabled");
    expect(json.error).toMatch(/cannot be replaced/i);
    expect(rpc).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("keeps failed sign-in from invoking password replacement", async () => {
    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sign_in",
        email: "student@example.com",
        password: "wrong-password",
      }),
    });

    const response = await POST(request as never);
    const json = (await response.json()) as { error?: string; code?: string };

    expect(response.status).toBe(401);
    expect(json.error).toMatch(/did not match/i);
    expect(rpc).not.toHaveBeenCalled();
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("still signs in with a correct password", async () => {
    signInWithPassword.mockResolvedValue({
      data: {
        user: { id: "user-a", email: "student@example.com" },
        session: { access_token: "token-abcdefghijklmnopqrstuvwxyz" },
      },
      error: null,
    });

    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sign_in",
        email: "student@example.com",
        password: "correct-password",
        deviceId: "tablet-test",
      }),
    });

    const response = await POST(request as never);
    const json = (await response.json()) as {
      status?: string;
      next?: string;
    };

    expect(response.status).toBe(200);
    expect(json.status).toBe("authenticated");
    expect(json.next).toBe("/hub");
    expect(rpc).not.toHaveBeenCalled();
  });
});
