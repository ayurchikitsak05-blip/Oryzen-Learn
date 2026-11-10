import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  childConsentStatus,
  childrenForParent,
  consentRequestForParent,
  createConsentLink,
  grantConsent,
  hashToken,
  saveBirthMonth,
  withdrawConsent,
} from "../server";

type Row = Record<string, unknown>;

/** A small in-memory stand-in for the Supabase tables the consent code uses. */
function fakeDb(profiles: Row[]) {
  const tables: Record<string, Row[]> = { profiles, parental_consents: [] };
  let nextId = 1;
  const from = (name: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let op: { kind: "select" } | { kind: "update"; patch: Row } | { kind: "insert"; row: Row } = { kind: "select" };
    let returnRows = false;
    const rows = () => tables[name].filter((row) => filters.every((f) => f(row)));
    const run = () => {
      if (op.kind === "insert") {
        tables[name].push({ id: `c${nextId++}`, created_at: new Date().toISOString(), ...op.row });
        return { data: null, error: null };
      }
      if (op.kind === "update") {
        const hit = rows();
        const patch = op.patch;
        hit.forEach((row) => Object.assign(row, patch));
        return { data: returnRows ? hit : null, error: null };
      }
      return { data: rows(), error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => {
        if (op.kind !== "select") returnRows = true;
        return chain;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      update: (patch: Row) => {
        op = { kind: "update", patch };
        return chain;
      },
      insert: (row: Row) => {
        op = { kind: "insert", row };
        return chain;
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => void) => resolve(run()),
    };
    return chain;
  };
  return { admin: { from } as unknown as SupabaseClient, tables };
}

const today = "2026-11-10";
const child = { id: "child", birth_month: "2010-04-01", parent_consent_at: null, full_name: "Asha Rao", email: "asha@example.com" };
const parent = { id: "parent", birth_month: "1980-02-01", parent_consent_at: null, full_name: "Meena Rao", email: "meena@example.com" };

async function linkFor(admin: SupabaseClient) {
  const made = await createConsentLink(admin, "child", today);
  if (!made.ok) throw new Error(made.error);
  return made.token;
}

describe("parental consent on the server", () => {
  it("saves the date of birth once and won't change it later", async () => {
    const { admin, tables } = fakeDb([{ id: "new", birth_month: null, parent_consent_at: null, full_name: null, email: "n@x.in" }]);
    expect(await saveBirthMonth(admin, "new", "2011-01-01", today)).toMatchObject({ ok: true, minor: true });
    expect(tables.profiles[0].birth_month).toBe("2011-01-01");
    expect(await saveBirthMonth(admin, "new", "1990-01-01", today)).toMatchObject({ ok: false, code: "already_set" });
    expect(await saveBirthMonth(admin, "new", "2030-01-01", today)).toMatchObject({ ok: false, code: "bad_date" });
  });

  it("lets a parent with their own adult account agree, and opens the child's account", async () => {
    const { admin, tables } = fakeDb([{ ...child }, { ...parent }]);
    const token = await linkFor(admin);
    expect(tables.parental_consents[0].token_hash).toBe(hashToken(token));
    expect(await consentRequestForParent(admin, token, "parent")).toMatchObject({ ok: true, childName: "Asha", state: "open", isChild: false });
    const granted = await grantConsent(admin, {
      token,
      parentUserId: "parent",
      parentEmail: "meena@example.com",
      parentName: "Meena Rao",
      relationship: "mother",
      declared: true,
      today,
    });
    expect(granted).toMatchObject({ ok: true, childName: "Asha" });
    expect(tables.profiles[0].parent_consent_at).toBeTruthy();
    expect(tables.parental_consents[0]).toMatchObject({ status: "granted", parent_user_id: "parent", notice_version: expect.any(String) });
    expect(await childConsentStatus(admin, "child", today)).toMatchObject({ ok: true, status: { consented: true, minor: true } });
  });

  it("won't let the student agree for themselves", async () => {
    const { admin } = fakeDb([{ ...child }, { ...parent }]);
    const token = await linkFor(admin);
    expect(await consentRequestForParent(admin, token, "child")).toMatchObject({ isChild: true });
    const self = await grantConsent(admin, { token, parentUserId: "child", parentEmail: "asha@example.com", parentName: "Asha", relationship: "mother", declared: true, today });
    expect(self).toMatchObject({ ok: false, code: "same_account" });
  });

  it("needs the parent to be 18+, to tick the declaration, and an unexpired link", async () => {
    const { admin, tables } = fakeDb([{ ...child }, { ...parent, id: "teen", birth_month: "2009-01-01" }, { ...parent }]);
    const token = await linkFor(admin);
    const base = { token, parentEmail: null, parentName: "Meena Rao", relationship: "mother" as const, today };
    expect(await grantConsent(admin, { ...base, parentUserId: "teen", declared: true })).toMatchObject({ code: "parent_minor" });
    expect(await grantConsent(admin, { ...base, parentUserId: "parent", declared: false })).toMatchObject({ code: "no_declaration" });
    tables.parental_consents[0].expires_at = "2026-11-01T00:00:00Z";
    expect(await grantConsent(admin, { ...base, parentUserId: "parent", declared: true })).toMatchObject({ code: "expired" });
    expect(tables.profiles[0].parent_consent_at).toBeNull();
  });

  it("stops an older link when a new one is made", async () => {
    const { admin, tables } = fakeDb([{ ...child }, { ...parent }]);
    await linkFor(admin);
    await linkFor(admin);
    expect(tables.parental_consents.map((row) => row.status)).toEqual(["replaced", "pending"]);
  });

  it("pauses the student when the parent withdraws", async () => {
    const { admin, tables } = fakeDb([{ ...child }, { ...parent }]);
    const token = await linkFor(admin);
    await grantConsent(admin, { token, parentUserId: "parent", parentEmail: null, parentName: "Meena Rao", relationship: "mother", declared: true, today });
    const [listed] = await childrenForParent(admin, "parent");
    expect(listed.childName).toBe("Asha");
    expect(await withdrawConsent(admin, "someone-else", listed.consentId)).toMatchObject({ ok: false });
    expect(await withdrawConsent(admin, "parent", listed.consentId)).toMatchObject({ ok: true });
    expect(tables.profiles[0].parent_consent_at).toBeNull();
    expect(tables.parental_consents[0].status).toBe("withdrawn");
  });

  it("doesn't make links for adults", async () => {
    const { admin } = fakeDb([{ ...child, birth_month: "1999-01-01" }]);
    expect(await createConsentLink(admin, "child", today)).toMatchObject({ ok: false, code: "adult" });
  });
});
