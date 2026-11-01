import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResetPasswordClient } from "../reset-password-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  }),
}));

describe("ResetPasswordClient fixtures", () => {
  it("shows expired recovery copy for the expired fixture", async () => {
    render(<ResetPasswordClient allowFixtures fixture="expired" />);
    const error = await screen.findByTestId("reset-error");
    expect(error.textContent).toMatch(/expired/i);
    expect(screen.queryByTestId("reset-password-form")).toBeNull();
    expect(screen.getByTestId("reset-back-to-auth")).toBeTruthy();
  });

  it("shows invalid recovery copy for the invalid fixture", async () => {
    render(<ResetPasswordClient allowFixtures fixture="invalid" />);
    const error = await screen.findByTestId("reset-error");
    expect(error.textContent).toMatch(/invalid/i);
    expect(screen.queryByTestId("reset-password-form")).toBeNull();
  });

  it("renders the set-password form for the ready fixture and validates confirmation", async () => {
    render(<ResetPasswordClient allowFixtures fixture="ready" />);
    expect(await screen.findByTestId("reset-password-form")).toBeTruthy();
    fireEvent.change(screen.getByTestId("reset-password-input"), {
      target: { value: "long-enough" },
    });
    fireEvent.change(screen.getByTestId("reset-confirm-input"), {
      target: { value: "mismatch!!" },
    });
    fireEvent.submit(screen.getByTestId("reset-password-form"));
    expect((await screen.findByTestId("reset-error")).textContent).toMatch(
      /do not match/i
    );

    fireEvent.change(screen.getByTestId("reset-confirm-input"), {
      target: { value: "long-enough" },
    });
    fireEvent.submit(screen.getByTestId("reset-password-form"));
    await waitFor(() => {
      expect(screen.getByTestId("reset-status").textContent).toMatch(
        /Password updated/i
      );
    });
  });
});
