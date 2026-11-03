import { describe, expect, it } from "vitest";
import {
  classifyAuthHash,
  describeAuthLinkQueryError,
  describePasswordUpdateFailure,
  describeRecoveryLinkFailure,
  validateNewPasswordInput,
} from "@/lib/supabase/password-reset";

describe("validateNewPasswordInput", () => {
  it("requires at least 8 characters and matching confirmation", () => {
    expect(
      validateNewPasswordInput({ password: "short", confirmPassword: "short" })
    ).toMatchObject({ ok: false, code: "password_too_short" });
    expect(
      validateNewPasswordInput({
        password: "long-enough",
        confirmPassword: "different!",
      })
    ).toMatchObject({ ok: false, code: "password_mismatch" });
    expect(
      validateNewPasswordInput({
        password: "long-enough",
        confirmPassword: "long-enough",
      })
    ).toEqual({ ok: true, password: "long-enough" });
  });
});

describe("classifyAuthHash", () => {
  it("detects recovery sessions without exposing tokens in the kind", () => {
    const hash = new URLSearchParams({
      access_token: "access-secret",
      refresh_token: "refresh-secret",
      type: "recovery",
    });
    const classified = classifyAuthHash(hash);
    expect(classified.kind).toBe("recovery");
    if (classified.kind === "recovery") {
      expect(classified.accessToken).toBe("access-secret");
      expect(classified.refreshToken).toBe("refresh-secret");
    }
  });

  it("treats non-recovery hashes as regular email sessions", () => {
    expect(
      classifyAuthHash(
        new URLSearchParams({
          access_token: "a",
          refresh_token: "b",
          type: "magiclink",
        })
      ).kind
    ).toBe("session");
  });

  it("surfaces hash errors without requiring tokens", () => {
    expect(
      classifyAuthHash(
        new URLSearchParams({
          error: "access_denied",
          error_description: "Email+link+is+invalid+or+has+expired",
        })
      )
    ).toEqual({
      kind: "error",
      message: "Email link is invalid or has expired",
    });
  });
});

describe("recovery link failure copy", () => {
  it("maps expired and invalid states", () => {
    expect(
      describeRecoveryLinkFailure({ errorCode: "otp_expired" })
    ).toMatch(/expired/i);
    expect(
      describeRecoveryLinkFailure({ errorDescription: "invalid link" })
    ).toMatch(/invalid/i);
    expect(
      describeAuthLinkQueryError(
        new URLSearchParams({ error_code: "otp_expired" })
      )
    ).toMatch(/expired/i);
  });
});

describe("describePasswordUpdateFailure", () => {
  it("maps missing sessions to 401 recovery copy", () => {
    expect(describePasswordUpdateFailure("Auth session missing")).toMatchObject({
      status: 401,
    });
  });
});
