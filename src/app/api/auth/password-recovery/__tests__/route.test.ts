import { beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmail = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { resetPasswordForEmail },
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabaseConfigError: () => null,
  describeSupabaseFailure: () => null,
  getSupabaseEnvConfig: () => ({
    url: "https://example.supabase.co",
    anonKey: "anon-key",
  }),
}));

describe("POST /api/auth/password-recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  });

  it("sends a Supabase recovery email and never sets a password", async () => {
    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/auth/password-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "student@example.com" }),
    });

    const response = await POST(request as never);
    const json = (await response.json()) as { status?: string; email?: string };

    expect(response.status).toBe(200);
    expect(json.status).toBe("recovery_email_sent");
    expect(json.email).toBe("student@example.com");
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "student@example.com",
      expect.objectContaining({
        redirectTo: "http://localhost/auth",
      })
    );
  });

  it("requires an email address", async () => {
    const { POST } = await import("../route");
    const request = new Request("http://localhost/api/auth/password-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
