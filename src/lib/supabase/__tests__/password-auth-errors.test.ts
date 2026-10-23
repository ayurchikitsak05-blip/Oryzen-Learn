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
  });

  it("keeps the save-password path when sign-up finds an existing email", () => {
    const result = describePasswordAuthFailure({
      rawMessage: "Invalid login credentials",
      alreadyRegistered: true,
      createdWithoutSession: false,
    });
    expect(result.status).toBe(409);
    expect(result.code).toBe("password_mismatch");
    expect(result.error).toMatch(/already has an account/i);
  });

  it("explains an unconfirmed Preview signup", () => {
    const result = describePasswordAuthFailure({
      rawMessage: "",
      alreadyRegistered: false,
      createdWithoutSession: true,
    });
    expect(result.code).toBe("password_mismatch");
    expect(result.error).toMatch(/not ready for sign-in/i);
  });
});
