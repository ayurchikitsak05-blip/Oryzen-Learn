import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guards: the vulnerable RPC must be dropped by migration and must not
 * remain callable from application code. Live DB revoke still needs separate
 * Preview/Production approval.
 */
describe("replace_unmatched_password containment", () => {
  const root = join(process.cwd());

  it("ships a migration that drops the takeover function", () => {
    const sql = readFileSync(
      join(root, "supabase/migrations/20261030000001_revoke_replace_unmatched_password.sql"),
      "utf8"
    );
    expect(sql).toMatch(/DROP FUNCTION public\.replace_unmatched_password/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.replace_unmatched_password/i);
    expect(sql).toMatch(/to_regprocedure\('public\.replace_unmatched_password\(text, text\)'\)/);
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*anon/i);
  });

  it("removes the replace_password application call path", () => {
    const route = readFileSync(
      join(root, "src/app/api/auth/password/route.ts"),
      "utf8"
    );
    const authPage = readFileSync(join(root, "src/app/auth/page.tsx"), "utf8");

    expect(route).toMatch(/password_replace_disabled/);
    expect(route).not.toMatch(/replace_unmatched_password/);
    expect(route).not.toMatch(/action === "replace_password"[\s\S]*supabase\.rpc/);
    expect(authPage).not.toMatch(/replace_password/);
    expect(authPage).not.toMatch(/Save this password and sign in/);
    expect(authPage).toMatch(/Email me a verified sign-in link/);
  });

  it("keeps a verified Supabase recovery email path", () => {
    const recovery = readFileSync(
      join(root, "src/app/api/auth/password-recovery/route.ts"),
      "utf8"
    );
    expect(recovery).toMatch(/resetPasswordForEmail/);
    expect(recovery).not.toMatch(/replace_unmatched_password/);
    expect(recovery).not.toMatch(/encrypted_password/);
  });
});
