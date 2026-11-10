import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONSENT_LINK_DAYS,
  CONSENT_NOTICE_VERSION,
  isMinor,
  plausibleBirthMonth,
  type ConsentRelationship,
} from "./age";

export type ConsentResult<T> = ({ ok: true } & T) | { ok: false; status: number; code: string; error: string };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newConsentToken(): string {
  return randomBytes(24).toString("base64url");
}

interface ProfileAge {
  birth_month: string | null;
  parent_consent_at: string | null;
  full_name: string | null;
  email: string | null;
}

async function profileAge(admin: SupabaseClient, userId: string): Promise<ProfileAge | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("birth_month, parent_consent_at, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProfileAge;
}

/** First name only, for the parent's screen ("Asha wants to use ORYZEN Learn"). */
export function childDisplayName(profile: Pick<ProfileAge, "full_name" | "email">): string {
  const first = profile.full_name?.trim().split(/\s+/)[0];
  if (first) return first.slice(0, 40);
  const local = profile.email?.split("@")[0] ?? "";
  return local ? `${local.slice(0, 2)}…` : "Your child";
}

/** Saves the month and year of birth, once. Changing it later needs support. */
export async function saveBirthMonth(
  admin: SupabaseClient,
  userId: string,
  birthMonth: string,
  today: string
): Promise<ConsentResult<{ minor: boolean; consented: boolean }>> {
  if (!plausibleBirthMonth(birthMonth, today)) {
    return { ok: false, status: 400, code: "bad_date", error: "Please check the month and year of birth." };
  }
  const profile = await profileAge(admin, userId);
  if (!profile) return { ok: false, status: 503, code: "store_failed", error: "This couldn't be saved just now. Please try again." };
  if (profile.birth_month && profile.birth_month !== birthMonth) {
    return {
      ok: false,
      status: 409,
      code: "already_set",
      error: "Your date of birth is already saved. To change it, contact us from the Privacy page.",
    };
  }
  if (!profile.birth_month) {
    const { error } = await admin.from("profiles").update({ birth_month: birthMonth }).eq("id", userId);
    if (error) return { ok: false, status: 503, code: "store_failed", error: "This couldn't be saved just now. Please try again." };
  }
  return { ok: true, minor: isMinor(birthMonth, today), consented: Boolean(profile.parent_consent_at) };
}

export interface ChildConsentStatus {
  needsBirthMonth: boolean;
  minor: boolean;
  consented: boolean;
  parentName: string | null;
  pendingUntil: string | null;
}

export async function childConsentStatus(
  admin: SupabaseClient,
  userId: string,
  today: string,
  now: Date = new Date()
): Promise<ConsentResult<{ status: ChildConsentStatus }>> {
  const profile = await profileAge(admin, userId);
  if (!profile) return { ok: false, status: 503, code: "store_failed", error: "Couldn't check just now." };
  const { data: rows } = await admin
    .from("parental_consents")
    .select("status, parent_name, expires_at")
    .eq("child_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);
  const list = (rows ?? []) as Array<{ status: string; parent_name: string | null; expires_at: string }>;
  const granted = list.find((row) => row.status === "granted");
  const pending = list.find((row) => row.status === "pending" && new Date(row.expires_at) > now);
  return {
    ok: true,
    status: {
      needsBirthMonth: !profile.birth_month,
      minor: profile.birth_month ? isMinor(profile.birth_month, today) : false,
      consented: Boolean(profile.parent_consent_at),
      parentName: granted?.parent_name ?? null,
      pendingUntil: pending?.expires_at ?? null,
    },
  };
}

/** A new link for a parent. Any earlier unused link stops working. */
export async function createConsentLink(
  admin: SupabaseClient,
  userId: string,
  today: string,
  now: Date = new Date()
): Promise<ConsentResult<{ token: string; expiresAt: string }>> {
  const profile = await profileAge(admin, userId);
  if (!profile?.birth_month) return { ok: false, status: 400, code: "age_check", error: "Add your date of birth first." };
  if (!isMinor(profile.birth_month, today)) {
    return { ok: false, status: 400, code: "adult", error: "You're 18 or older, so a parent doesn't need to agree." };
  }
  if (profile.parent_consent_at) return { ok: false, status: 409, code: "already_granted", error: "A parent has already agreed." };
  await admin.from("parental_consents").update({ status: "replaced" }).eq("child_user_id", userId).eq("status", "pending");
  const token = newConsentToken();
  const expiresAt = new Date(now.getTime() + CONSENT_LINK_DAYS * 86_400_000).toISOString();
  const { error } = await admin
    .from("parental_consents")
    .insert({ child_user_id: userId, token_hash: hashToken(token), status: "pending", expires_at: expiresAt });
  if (error) return { ok: false, status: 503, code: "store_failed", error: "The link couldn't be made just now. Please try again." };
  return { ok: true, token, expiresAt };
}

interface ConsentRow {
  id: string;
  child_user_id: string;
  status: string;
  expires_at: string;
  parent_user_id: string | null;
}

async function rowForToken(admin: SupabaseClient, token: string): Promise<ConsentRow | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const { data } = await admin
    .from("parental_consents")
    .select("id, child_user_id, status, expires_at, parent_user_id")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  return (data as ConsentRow | null) ?? null;
}

/** What the parent sees after opening the link. */
export async function consentRequestForParent(
  admin: SupabaseClient,
  token: string,
  viewerId: string,
  now: Date = new Date()
): Promise<ConsentResult<{ childName: string; state: "open" | "granted" | "closed"; isChild: boolean }>> {
  const row = await rowForToken(admin, token);
  if (!row) return { ok: false, status: 404, code: "not_found", error: "This link isn't valid. Ask your child to send a new one." };
  const child = await profileAge(admin, row.child_user_id);
  const childName = child ? childDisplayName(child) : "Your child";
  const state =
    row.status === "granted" ? "granted" : row.status === "pending" && new Date(row.expires_at) > now ? "open" : "closed";
  return { ok: true, childName, state, isChild: row.child_user_id === viewerId };
}

/**
 * The parent agrees. Rule 10: the parent must be an identifiable adult. Today that means
 * their own signed-in account (email verified by the sign-in), not the child's, with a
 * date of birth showing 18+, plus a declaration that they are the parent or guardian.
 */
export async function grantConsent(
  admin: SupabaseClient,
  input: {
    token: string;
    parentUserId: string;
    parentEmail: string | null;
    parentName: string;
    relationship: ConsentRelationship;
    declared: boolean;
    today: string;
    now?: Date;
  }
): Promise<ConsentResult<{ childName: string }>> {
  const now = input.now ?? new Date();
  const row = await rowForToken(admin, input.token);
  if (!row) return { ok: false, status: 404, code: "not_found", error: "This link isn't valid. Ask your child to send a new one." };
  if (row.child_user_id === input.parentUserId) {
    return {
      ok: false,
      status: 403,
      code: "same_account",
      error: "This link is for a parent. Please open it on the parent's phone and sign in with the parent's own email.",
    };
  }
  if (row.status === "granted") return { ok: false, status: 409, code: "already_granted", error: "You've already agreed. Thank you." };
  if (row.status !== "pending" || new Date(row.expires_at) <= now) {
    return { ok: false, status: 410, code: "expired", error: "This link has expired. Ask your child to send a new one." };
  }
  if (!input.declared) return { ok: false, status: 400, code: "no_declaration", error: "Please tick the declaration." };
  const name = input.parentName.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) return { ok: false, status: 400, code: "bad_name", error: "Please enter your full name." };

  const parent = await profileAge(admin, input.parentUserId);
  if (!parent?.birth_month) return { ok: false, status: 400, code: "age_check", error: "Add your own month and year of birth first." };
  if (isMinor(parent.birth_month, input.today)) {
    return { ok: false, status: 403, code: "parent_minor", error: "The person agreeing must be 18 or older." };
  }
  const parentEmail = input.parentEmail?.trim().toLowerCase() ?? null;
  const child = await profileAge(admin, row.child_user_id);
  if (parentEmail && child?.email && child.email.trim().toLowerCase() === parentEmail) {
    return { ok: false, status: 403, code: "same_account", error: "Please sign in with the parent's own email, not the student's." };
  }

  const grantedAt = now.toISOString();
  const { data: updated, error } = await admin
    .from("parental_consents")
    .update({
      status: "granted",
      parent_user_id: input.parentUserId,
      parent_email: parentEmail,
      parent_name: name,
      relationship: input.relationship,
      verification_method: "own_verified_account_adult_birth_month_declaration",
      notice_version: CONSENT_NOTICE_VERSION,
      granted_at: grantedAt,
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id");
  if (error || !Array.isArray(updated) || updated.length === 0) {
    return { ok: false, status: 503, code: "store_failed", error: "This couldn't be saved just now. Please try again." };
  }
  const { error: profileError } = await admin
    .from("profiles")
    .update({ parent_consent_at: grantedAt })
    .eq("id", row.child_user_id);
  if (profileError) {
    await admin.from("parental_consents").update({ status: "pending", granted_at: null }).eq("id", row.id);
    return { ok: false, status: 503, code: "store_failed", error: "This couldn't be saved just now. Please try again." };
  }
  return { ok: true, childName: child ? childDisplayName(child) : "Your child" };
}

export interface ParentChild {
  consentId: string;
  childName: string;
  relationship: string | null;
  grantedAt: string | null;
}

export async function childrenForParent(admin: SupabaseClient, parentUserId: string): Promise<ParentChild[]> {
  const { data } = await admin
    .from("parental_consents")
    .select("id, child_user_id, relationship, granted_at")
    .eq("parent_user_id", parentUserId)
    .eq("status", "granted")
    .order("granted_at", { ascending: false });
  const rows = (data ?? []) as Array<{ id: string; child_user_id: string; relationship: string | null; granted_at: string | null }>;
  const children: ParentChild[] = [];
  for (const row of rows) {
    const child = await profileAge(admin, row.child_user_id);
    children.push({
      consentId: row.id,
      childName: child ? childDisplayName(child) : "Your child",
      relationship: row.relationship,
      grantedAt: row.granted_at,
    });
  }
  return children;
}

/** The parent withdraws consent: the student's account pauses until a parent agrees again. */
export async function withdrawConsent(
  admin: SupabaseClient,
  parentUserId: string,
  consentId: string,
  now: Date = new Date()
): Promise<ConsentResult<Record<string, never>>> {
  const { data } = await admin
    .from("parental_consents")
    .select("id, child_user_id, status, parent_user_id")
    .eq("id", consentId)
    .maybeSingle();
  const row = data as { id: string; child_user_id: string; status: string; parent_user_id: string | null } | null;
  if (!row || row.parent_user_id !== parentUserId || row.status !== "granted") {
    return { ok: false, status: 404, code: "not_found", error: "That consent couldn't be found." };
  }
  const { error } = await admin
    .from("parental_consents")
    .update({ status: "withdrawn", withdrawn_at: now.toISOString() })
    .eq("id", row.id);
  if (error) return { ok: false, status: 503, code: "store_failed", error: "This couldn't be saved just now. Please try again." };
  const { data: stillGranted } = await admin
    .from("parental_consents")
    .select("id")
    .eq("child_user_id", row.child_user_id)
    .eq("status", "granted");
  // Another parent may also have agreed; the account pauses only when no consent is left.
  if (!Array.isArray(stillGranted) || stillGranted.length === 0) {
    await admin.from("profiles").update({ parent_consent_at: null }).eq("id", row.child_user_id);
  }
  return { ok: true };
}
