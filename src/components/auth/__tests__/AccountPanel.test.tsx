import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/session", () => ({
  fetchSignedInUser: async () => ({ userId: "student-a", email: "student@example.com" }),
}));

import { AccountPanel } from "../AccountPanel";

describe("Account and privacy", () => {
  it("shows who is signed in with sign-out and change-password actions", async () => {
    render(<AccountPanel />);
    await waitFor(() => expect(screen.getByTestId("account-email").textContent).toBe("student@example.com"));
    expect(screen.getByTestId("account-sign-out").textContent).toBe("Sign out");
    expect(screen.getByTestId("account-password-link").textContent).toMatch(/change my password/);
  });
});
