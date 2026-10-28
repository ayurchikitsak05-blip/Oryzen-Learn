import { NextResponse, type NextRequest } from "next/server";
import {
  authorizedVaultUserId,
  bytesToBase64,
  deriveAccountVaultKey,
  deriveQuarantineKey,
  sealWithRawKey,
  base64ToBytes,
  vaultKeyMaterials,
} from "@/lib/privacy/account-vault";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, private",
  Pragma: "no-cache",
  Expires: "0",
  Vary: "Cookie",
};

function readServiceRoleKey(): string | null {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function currentVaultMaterials() {
  return vaultKeyMaterials({
    dedicated: process.env.ORYZEN_VAULT_KEY_SECRET,
    previous: process.env.ORYZEN_VAULT_KEY_SECRET_PREVIOUS,
    serviceRole: readServiceRoleKey(),
  });
}

function claimedOwnerId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ownerId = value.trim();
  if (!ownerId || ownerId.length > 128 || /[\u0000-\u001f]/.test(ownerId)) return null;
  return ownerId;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const subject = authorizedVaultUserId(user?.id, request.nextUrl.searchParams.get("userId"));
  if (!subject) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: PRIVATE_HEADERS });
  }
  const materials = currentVaultMaterials();
  if (!materials.current) {
    return NextResponse.json(
      { error: "Private storage is unavailable." },
      { status: 503, headers: PRIVATE_HEADERS }
    );
  }
  const key = bytesToBase64(await deriveAccountVaultKey(materials.current, subject));
  const previousKeys: string[] = [];
  for (const secret of materials.previous) {
    previousKeys.push(bytesToBase64(await deriveAccountVaultKey(secret, subject)));
  }
  return NextResponse.json(
    previousKeys.length > 0 ? { key, previousKeys } : { key },
    { headers: PRIVATE_HEADERS }
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!authorizedVaultUserId(user?.id)) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: PRIVATE_HEADERS });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 65_536) {
    return NextResponse.json({ error: "Legacy wrap is too large." }, { status: 413, headers: PRIVATE_HEADERS });
  }
  const materials = currentVaultMaterials();
  if (!materials.current) {
    return NextResponse.json(
      { error: "Private storage is unavailable." },
      { status: 503, headers: PRIVATE_HEADERS }
    );
  }
  const body = (await request.json().catch(() => null)) as { wrap?: unknown } | null;
  const wrap = Array.isArray(body?.wrap) ? body.wrap.slice(0, 32) : [];
  const wrapped: Array<{ ownerId: string | null; iv: string; data: string }> = [];
  for (const item of wrap) {
    if (!item || typeof item !== "object") continue;
    const record = item as { ownerId?: unknown; key?: unknown };
    let keyBytes: Uint8Array | null = null;
    try {
      keyBytes = typeof record.key === "string" ? base64ToBytes(record.key) : null;
    } catch {
      keyBytes = null;
    }
    if (!keyBytes || keyBytes.byteLength !== 32) continue;
    const ownerId = claimedOwnerId(record.ownerId);
    const vaultKey = ownerId
      ? await deriveAccountVaultKey(materials.current, ownerId)
      : await deriveQuarantineKey(materials.current);
    const sealed = await sealWithRawKey(vaultKey, keyBytes);
    wrapped.push({ ownerId, ...sealed });
  }
  return NextResponse.json({ wrapped }, { headers: PRIVATE_HEADERS });
}
