import { describe, expect, it } from "vitest";
import { resolveAuthorizedUserId } from "../request-user";
import { ANONYMOUS_READER_SCOPE } from "@/lib/reader/local-scope";

describe("authorized request user", () => {
  it("uses the signed-in session and ignores a requested foreign id", () => {
    expect(resolveAuthorizedUserId("user-a", "user-b")).toBe("user-a");
    expect(resolveAuthorizedUserId("user-a", "")).toBe("user-a");
  });

  it("does not let an unsigned caller pick another student's id", () => {
    expect(resolveAuthorizedUserId(null, "user-b")).toBe(ANONYMOUS_READER_SCOPE);
    expect(resolveAuthorizedUserId(undefined, "user-a")).toBe(ANONYMOUS_READER_SCOPE);
  });
});
