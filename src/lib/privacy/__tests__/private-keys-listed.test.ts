import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRIVATE_BROWSER_BASES } from "../account-vault";

/**
 * Every record saved with writePrivateString must be in PRIVATE_BROWSER_BASES, or it is sealed
 * on the device but never read back after a reload (found in manual testing, 17 Nov 2026:
 * revision progress reset on every reload).
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("private study records", () => {
  it("reloads every record the app saves", () => {
    const files = sourceFiles(path.resolve(__dirname, "../../.."));
    const constantPattern = /const\s+([A-Z_]+)\s*=\s*"([a-z0-9_]+_v\d+)"/g;
    const global = new Map<string, string>();
    const perFile = files.map((file) => {
      const text = readFileSync(file, "utf8");
      const local = new Map<string, string>();
      for (const match of text.matchAll(constantPattern)) {
        local.set(match[1], match[2]);
        global.set(match[1], match[2]);
      }
      return { text, local };
    });
    const keys = new Set<string>();
    for (const { text, local } of perFile) {
      for (const match of text.matchAll(/writePrivateString\(\s*(?:"([a-z0-9_]+)"|([A-Z_]+))/g)) {
        const key = match[1] ?? local.get(match[2]) ?? global.get(match[2]);
        if (key) keys.add(key);
      }
    }
    expect(keys.size).toBeGreaterThan(10);
    const listed = new Set<string>(PRIVATE_BROWSER_BASES);
    expect([...keys].filter((key) => !listed.has(key)).sort()).toEqual([]);
  });
});
