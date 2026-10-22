import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Local disposable SQLite mock of the pending ai_response_cache policy.
 * Does not touch project mazzciufouqcxmwaacyu.
 */
const POLICY_WHERE = `(
  (cache_scope = 'private' AND owner_user_id IS NOT NULL AND owner_user_id = :uid)
  OR (
    cache_scope = 'institute_authorized'
    AND tenant_id IS NOT NULL
    AND tenant_id = :org
  )
)`;

function queryVisible(uid: string, org: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), "oryzen-cache-rls-"));
  const db = join(dir, "cache.db");
  const sql = `
CREATE TABLE ai_response_cache (
  cache_key TEXT PRIMARY KEY,
  cache_scope TEXT NOT NULL,
  owner_user_id TEXT,
  tenant_id TEXT,
  response_payload TEXT NOT NULL
);
INSERT INTO ai_response_cache VALUES
  ('priv-a', 'private', 'user-a', NULL, 'notes for A'),
  ('priv-b', 'private', 'user-b', NULL, 'notes for B'),
  ('inst-north', 'institute_authorized', 'user-a', 'org-north', 'shared syllabus'),
  ('orphan', 'private', NULL, NULL, 'legacy dump');
.mode list
.headers off
SELECT cache_key FROM ai_response_cache
WHERE (
  (cache_scope = 'private' AND owner_user_id IS NOT NULL AND owner_user_id = '${uid}')
  OR (
    cache_scope = 'institute_authorized'
    AND tenant_id IS NOT NULL
    AND tenant_id = '${org}'
  )
)
ORDER BY cache_key;
`;
  const out = execFileSync("sqlite3", [db], {
    input: sql,
    encoding: "utf8",
  });
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

describe("pending ai_response_cache RLS (local sqlite mock)", () => {
  it("keeps private notes and uploads off unauthorized users and institutes", () => {
    expect(queryVisible("user-a", "org-north")).toEqual(["inst-north", "priv-a"]);
    expect(queryVisible("user-b", "org-south")).toEqual(["priv-b"]);
    expect(queryVisible("user-c", "org-north")).toEqual(["inst-north"]);
    expect(queryVisible("user-c", "org-south")).toEqual([]);
  });

  it("documents the current USING(true) leak versus the pending predicate", () => {
    expect(POLICY_WHERE).toContain("owner_user_id = :uid");
    expect(POLICY_WHERE).toContain("tenant_id = :org");
    expect(POLICY_WHERE).not.toContain("USING (true)");
  });
});
