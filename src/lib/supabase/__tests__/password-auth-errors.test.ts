import { describe, expect, it } from "vitest";
import { describePasswordAuthFailure } from "../password-auth-errors";

describe("describePasswordAuthFailure", () => {
  it("does not claim an account exists for a plain invalid sign-in", () => {
    const result = describePasswordAuthFailure({
      rawMessage: "Invalid login credentials",
      alreadyRegistered: false,
      createdWithoutSession: false,
    });
    expect(result.status).toBe(401);
    expect(result.code).toBeUndefined();
    expect(result.error).toMatch(/did not match/i);
    expect(result.error).not.toMatch(/already has an account/i);
    expect(result.error).not.toMatch(/save the password/i);
  });

  it("points mismatched existing accounts to verified email recovery, not password replace", () => {
    const result = describePasswordAuthFailure({
      rawMessage: "Invalid login credentials",
      alreadyRegistered: true,
      createdWithoutSession: false,
    });
    expect(result.status).toBe(409);
    expect(result.code).toBe("password_mismatch");
    expect(result.error).toMatch(/already has an account/i);
    expect(result.error).toMatch(/email sign-in link/i);
    expect(result.error).toMatch(/cannot be replaced/i);
    expect(result.error).not.toMatch(/save the password/i);
  });

  it("explains an unconfirmed Preview signup without offering password replace", () => {
    const result = describePasswordAuthFailure({
      rawMessage: "",
      alreadyRegistered: false,
      createdWithoutSession: true,
    });
    expect(result.code).toBe("password_mismatch");
    expect(result.error).toMatch(/not ready for password sign-in/i);
    expect(result.error).toMatch(/email sign-in link/i);
    expect(result.error).not.toMatch(/save the password/i);
  });
});
