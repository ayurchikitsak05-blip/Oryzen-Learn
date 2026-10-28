/**
 * Browser copies of books and study data stay sealed with a key the server
 * issues only to the signed-in account. The key is kept in memory. A user id
 * in a storage name is not treated as authorization.
 */

export const SEALED_PRIVATE_KEY = "oryzen_sealed_private_v1";

export const PRIVATE_BROWSER_BASES = [
  "oryzen_saved_passages_v1",
  "prakriti_study_ai_deep_linked_notebook_v1",
  "prakriti_study_ai_onboarding_profile_v1",
  "prakriti_study_ai_cognitive_dna_v1",
  "oryzen_reader_text_marks_v1",
  "oryzen_reader_margin_notes_v1",
  "oryzen_reader_quiz_progress_v1",
  "oryzen_reader_bookmarks_v1",
  "oryzen_reader_view_v1",
  "oryzen_reader_last_document_v1",
  "oryzen_study_sprint_v1",
  "oryzen_sprint_notes_v1",
  "oryzen_study_companion_v1",
  "oryzen_study_coach_v1",
  "oryzen_study_universe_v1",
  "oryzen_study_universe_plan_v1",
  "oryzen_study_roadmap_v1",
  "oryzen_study_roadmap_snapshot_v1",
  "oryzen_transform_v1",
  "oryzen_lens_feedback_v1",
  "oryzen_study_scheduler_v1",
  "oryzen_video_caption_notes_v1",
] as const;

type VaultState = {
  rawKey: Uint8Array;
  cryptoKey: CryptoKey;
  previousRawKeys: Uint8Array[];
  previousKeys: CryptoKey[];
  userId: string;
  memory: Map<string, string>;
};

type SealedJsonRecord = { slot: string; iv: string; data: string };

const lockHooks = new Set<() => void>();
let state: VaultState | null = null;
let persistQueue: Promise<void> = Promise.resolve();
let vaultEpoch = 0;
let vaultOpenTask: Promise<boolean> | null = null;
let retiredSlots = new Set<string>();

export function registerVaultLockHook(hook: () => void): void {
  lockHooks.add(hook);
}

export function isAccountVaultUnlocked(): boolean {
  return state !== null;
}

export function accountVaultUserId(): string | null {
  return state?.userId ?? null;
}

export function privateAccessAllowed(userId?: string | null): boolean {
  if (!state) return false;
  const requested = (userId ?? "").trim();
  if (!requested) return true;
  return requested === state.userId;
}

function bytesCopy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function cleanSecret(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The current seal secret stays on the service role until a dedicated secret is
 * configured. Once that secret exists, the service role becomes a previous key
 * so books sealed before the change can be opened and sealed again.
 */
export function vaultKeyMaterials(env: {
  dedicated?: string | null;
  previous?: string | null;
  serviceRole?: string | null;
}): { current: string | null; previous: string[] } {
  const dedicated = cleanSecret(env.dedicated);
  const serviceRole = cleanSecret(env.serviceRole);
  const current = dedicated || serviceRole || null;
  if (!current) return { current: null, previous: [] };
  const listed = cleanSecret(env.previous)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (dedicated && serviceRole && serviceRole !== dedicated) listed.push(serviceRole);
  return {
    current,
    previous: [...new Set(listed.filter((item) => item !== current))],
  };
}

export async function deriveAccountVaultKey(secret: string, userId: string): Promise<Uint8Array> {
  const encoded = new TextEncoder();
  const hmac = await crypto.subtle.importKey(
    "raw",
    encoded.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    hmac,
    encoded.encode(`oryzen-reader-vault:v1:${userId.trim()}`)
  );
  return new Uint8Array(signature);
}

export async function sealBytes(plain: Uint8Array): Promise<{ iv: string; data: string } | null> {
  if (!state) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, state.cryptoKey, bytesCopy(plain));
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) };
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytesCopy(rawKey), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function decryptAes(key: CryptoKey, iv: string, data: string): Promise<Uint8Array | null> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytesCopy(base64ToBytes(iv)) },
      key,
      bytesCopy(base64ToBytes(data))
    );
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

export async function openBytes(iv: string, data: string): Promise<Uint8Array | null> {
  if (!state) return null;
  const current = await decryptAes(state.cryptoKey, iv, data);
  if (current) return current;
  for (const previous of state.previousKeys) {
    const opened = await decryptAes(previous, iv, data);
    if (opened) return opened;
  }
  return null;
}

/** Returns a current-key seal when a blob opens only with a previous key. */
export async function resealLegacyVaultBlob(
  iv: string,
  data: string
): Promise<{ iv: string; data: string } | null> {
  if (!state || state.previousKeys.length === 0) return null;
  if (await decryptAes(state.cryptoKey, iv, data)) return null;
  const opened = await openBytes(iv, data);
  if (!opened) return null;
  return sealBytes(opened);
}

export function readPrivateString(baseKey: string, userId?: string | null): string | null {
  if (!privateAccessAllowed(userId)) return null;
  return state?.memory.get(baseKey) ?? null;
}

export function writePrivateString(baseKey: string, value: string, userId?: string | null): void {
  if (!privateAccessAllowed(userId) || !state) return;
  state.memory.set(baseKey, value);
  persistQueue = persistQueue.then(() => persistPrivateRecords()).catch(() => undefined);
}

export function removePrivateString(baseKey: string, userId?: string | null): void {
  if (!privateAccessAllowed(userId) || !state) return;
  state.memory.delete(baseKey);
  persistQueue = persistQueue.then(() => persistPrivateRecords()).catch(() => undefined);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let diff = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

export async function unlockAccountVault(
  rawKey: Uint8Array,
  userId: string,
  previousKeys: Uint8Array[] = []
): Promise<void> {
  const nextUserId = userId.trim();
  if (!nextUserId || rawKey.byteLength !== 32) {
    throw new Error("A signed-in account is required before private study data can be opened.");
  }
  if (state) await lockAccountVault();
  const keyBytes = bytesCopy(rawKey);
  const previousRawKeys = previousKeys
    .filter((key) => key.byteLength === 32 && !sameBytes(key, keyBytes))
    .map((key) => bytesCopy(key));
  const cryptoKey = await importAesKey(keyBytes);
  state = {
    rawKey: keyBytes,
    cryptoKey,
    previousRawKeys,
    previousKeys: await Promise.all(previousRawKeys.map((key) => importAesKey(key))),
    userId: nextUserId,
    memory: new Map(),
  };
  await hydratePrivateRecords();
  await recoverPreviousKeyRecords();
  adoptLegacyPlaintext(nextUserId);
  await persistPrivateRecords();
  removeAdoptedPlaintext(nextUserId);
  await quarantineForeignBrowserData(nextUserId);
  await recoverJsonQuarantine();
  await persistPrivateRecords();
}

export async function lockAccountVault(): Promise<void> {
  await persistQueue;
  if (state) await persistPrivateRecords();
  state = null;
  for (const hook of lockHooks) hook();
}

/** Waits until queued sealed writes have finished. */
export function flushAccountVault(): Promise<void> {
  return persistQueue;
}

/** Drops in-memory copies without writing. Used between tests. */
export function discardAccountVault(): void {
  vaultEpoch += 1;
  state = null;
  retiredSlots = new Set();
  persistQueue = Promise.resolve();
  vaultOpenTask = null;
  for (const hook of lockHooks) hook();
}

export function ensureAccountVault(): Promise<boolean> {
  if (!vaultOpenTask) {
    const task = openAccountVault().finally(() => {
      if (vaultOpenTask === task) vaultOpenTask = null;
    });
    vaultOpenTask = task;
  }
  return vaultOpenTask;
}

async function openAccountVault(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const session = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
  if (!session.ok) {
    await lockAccountVault();
    return false;
  }
  const sessionBody = (await session.json()) as { userId?: string };
  const userId = sessionBody.userId?.trim() ?? "";
  if (!userId) {
    await lockAccountVault();
    return false;
  }
  if (state?.userId === userId) return true;
  const vault = await fetch("/api/auth/reader-vault", { credentials: "same-origin", cache: "no-store" });
  if (!vault.ok) {
    await lockAccountVault();
    return false;
  }
  const vaultBody = (await vault.json()) as { key?: string; previousKeys?: unknown };
  if (!vaultBody.key) {
    await lockAccountVault();
    return false;
  }
  const previousKeys: Uint8Array[] = [];
  if (Array.isArray(vaultBody.previousKeys)) {
    for (const item of vaultBody.previousKeys) {
      if (typeof item !== "string") continue;
      try {
        const bytes = base64ToBytes(item);
        if (bytes.byteLength === 32) previousKeys.push(bytes);
      } catch {
        // A malformed previous key is ignored. The current key still opens new data.
      }
    }
  }
  await unlockAccountVault(base64ToBytes(vaultBody.key), userId, previousKeys);
  return true;
}

export function sealedPrivateSnapshot(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(SEALED_PRIVATE_KEY) ?? "";
}

async function slotForRaw(rawKey: Uint8Array, purpose: string): Promise<string> {
  const hmac = await crypto.subtle.importKey(
    "raw",
    bytesCopy(rawKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmac, new TextEncoder().encode(purpose))
  );
  return [...signature.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function slotFor(purpose: string): Promise<string> {
  if (!state) return "";
  return slotForRaw(state.rawKey, purpose);
}

async function decryptWithRaw(rawKey: Uint8Array, iv: string, data: string): Promise<Uint8Array | null> {
  return decryptAes(await importAesKey(rawKey), iv, data);
}

async function recoverPreviousKeyRecords(): Promise<void> {
  if (!state || state.previousRawKeys.length === 0 || typeof window === "undefined") return;
  const records = readSealedArray();
  for (const rawKey of state.previousRawKeys) {
    for (const base of PRIVATE_BROWSER_BASES) {
      if (!state || state.memory.has(base)) continue;
      const slot = await slotForRaw(rawKey, base);
      const record = records.find((item) => item.slot === slot);
      if (!record) continue;
      const opened = await decryptWithRaw(rawKey, record.iv, record.data);
      if (!opened) continue;
      state.memory.set(base, new TextDecoder().decode(opened));
      retiredSlots.add(slot);
    }
  }
}

async function hydratePrivateRecords(): Promise<void> {
  if (!state || typeof window === "undefined") return;
  const records = readSealedArray();
  for (const base of PRIVATE_BROWSER_BASES) {
    const slot = await slotFor(base);
    const record = records.find((item) => item.slot === slot);
    if (!record) continue;
    const opened = await openBytes(record.iv, record.data);
    if (!opened) continue;
    state.memory.set(base, new TextDecoder().decode(opened));
  }
}

function adoptLegacyPlaintext(userId: string): void {
  if (!state || typeof window === "undefined") return;
  for (const base of PRIVATE_BROWSER_BASES) {
    const legacy = window.localStorage.getItem(`${base}::${userId}`);
    if (!legacy || state.memory.has(base)) continue;
    state.memory.set(base, legacy);
  }
}

async function persistPrivateRecords(): Promise<void> {
  const epoch = vaultEpoch;
  if (!state || typeof window === "undefined") return;
  const managed = new Set<string>();
  for (const base of PRIVATE_BROWSER_BASES) managed.add(await slotFor(base));
  if (epoch !== vaultEpoch || !state) return;
  const retired = retiredSlots;
  retiredSlots = new Set();
  const kept = readSealedArray().filter((record) => !managed.has(record.slot) && !retired.has(record.slot));
  for (const [base, value] of state.memory) {
    const sealed = await sealBytes(new TextEncoder().encode(value));
    const slot = await slotFor(base);
    if (!sealed || !slot) continue;
    kept.push({ slot, iv: sealed.iv, data: sealed.data });
  }
  if (epoch !== vaultEpoch || !state) return;
  window.localStorage.setItem(SEALED_PRIVATE_KEY, JSON.stringify(kept));
}

function readSealedArray(): SealedJsonRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEALED_PRIVATE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SealedJsonRecord =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as SealedJsonRecord).slot === "string" &&
        typeof (item as SealedJsonRecord).iv === "string" &&
        typeof (item as SealedJsonRecord).data === "string"
    );
  } catch {
    return [];
  }
}

/**
 * The signed-in session is the only account that may receive a vault key.
 * A user id supplied by the caller is ignored.
 */
export function authorizedVaultUserId(
  sessionUserId: string | null | undefined,
  _requestedUserId?: string | null
): string | null {
  const id = (sessionUserId ?? "").trim();
  return id.length > 0 ? id : null;
}

export async function deriveQuarantineKey(secret: string): Promise<Uint8Array> {
  const encoded = new TextEncoder();
  const hmac = await crypto.subtle.importKey(
    "raw",
    encoded.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    hmac,
    encoded.encode("oryzen-reader-vault:quarantine:v1")
  );
  return new Uint8Array(signature);
}

export async function sealWithRawKey(
  rawKey: Uint8Array,
  plain: Uint8Array
): Promise<{ iv: string; data: string }> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    bytesCopy(rawKey),
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    bytesCopy(plain)
  );
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) };
}

export async function openWithRawKey(
  rawKey: Uint8Array,
  iv: string,
  data: string
): Promise<Uint8Array | null> {
  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      bytesCopy(rawKey),
      "AES-GCM",
      false,
      ["decrypt"]
    );
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytesCopy(base64ToBytes(iv)) },
      cryptoKey,
      bytesCopy(base64ToBytes(data))
    );
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

export type LegacyKeyWrap = (
  ownerId: string | null,
  rawKey: Uint8Array
) => Promise<{ iv: string; data: string } | null>;

let legacyKeyWrap: LegacyKeyWrap = wrapLegacyKeyWithServer;

export function setLegacyKeyWrapper(wrapper: LegacyKeyWrap | null): void {
  legacyKeyWrap = wrapper ?? wrapLegacyKeyWithServer;
}

export async function wrapLegacyDataKey(
  ownerId: string | null,
  rawKey: Uint8Array
): Promise<{ iv: string; data: string } | null> {
  return legacyKeyWrap(ownerId, rawKey);
}

async function wrapLegacyKeyWithServer(
  ownerId: string | null,
  rawKey: Uint8Array
): Promise<{ iv: string; data: string } | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/api/auth/reader-vault", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wrap: [{ ownerId, key: bytesToBase64(rawKey) }] }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      wrapped?: Array<{ iv?: string; data?: string }>;
    };
    const wrapped = body.wrapped?.[0];
    if (!wrapped?.iv || !wrapped.data) return null;
    return { iv: wrapped.iv, data: wrapped.data };
  } catch {
    return null;
  }
}

export const LEGACY_QUARANTINE_KEY = "oryzen_legacy_quarantine_v1";

type JsonQuarantineRecord = {
  kind: "json";
  base: string;
  ownerId: string | null;
  payloadIv: string;
  payloadData: string;
  keyIv: string;
  keyData: string;
};

function readJsonQuarantine(): JsonQuarantineRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEGACY_QUARANTINE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is JsonQuarantineRecord =>
        Boolean(item) &&
        typeof item === "object" &&
        (item as JsonQuarantineRecord).kind === "json" &&
        typeof (item as JsonQuarantineRecord).base === "string" &&
        typeof (item as JsonQuarantineRecord).payloadIv === "string" &&
        typeof (item as JsonQuarantineRecord).payloadData === "string" &&
        typeof (item as JsonQuarantineRecord).keyIv === "string" &&
        typeof (item as JsonQuarantineRecord).keyData === "string"
    );
  } catch {
    return [];
  }
}

function writeJsonQuarantine(records: JsonQuarantineRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LEGACY_QUARANTINE_KEY, JSON.stringify(records));
}

function removeAdoptedPlaintext(userId: string): void {
  if (typeof window === "undefined") return;
  for (const base of PRIVATE_BROWSER_BASES) {
    window.localStorage.removeItem(`${base}::${userId}`);
  }
}

async function quarantineForeignBrowserData(currentUserId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const pending: Array<{ key: string; base: string; ownerId: string | null; value: string }> = [];
  for (const key of Object.keys(window.localStorage)) {
    if (key === SEALED_PRIVATE_KEY || key === LEGACY_QUARANTINE_KEY) continue;
    for (const base of PRIVATE_BROWSER_BASES) {
      if (key === base) {
        pending.push({
          key,
          base,
          ownerId: null,
          value: window.localStorage.getItem(key) ?? "",
        });
        break;
      }
      const prefix = `${base}::`;
      if (!key.startsWith(prefix)) continue;
      const ownerId = key.slice(prefix.length);
      if (ownerId === currentUserId) break;
      pending.push({
        key,
        base,
        ownerId: ownerId || null,
        value: window.localStorage.getItem(key) ?? "",
      });
      break;
    }
  }
  for (const item of pending) {
    if (!item.value) continue;
    const dataKey = crypto.getRandomValues(new Uint8Array(32));
    const sealed = await sealWithRawKey(dataKey, new TextEncoder().encode(item.value));
    const wrapped = await wrapLegacyDataKey(item.ownerId, dataKey);
    if (!wrapped) continue;
    writeJsonQuarantine([
      ...readJsonQuarantine(),
      {
        kind: "json",
        base: item.base,
        ownerId: item.ownerId,
        payloadIv: sealed.iv,
        payloadData: sealed.data,
        keyIv: wrapped.iv,
        keyData: wrapped.data,
      },
    ]);
    window.localStorage.removeItem(item.key);
  }
}

async function recoverJsonQuarantine(): Promise<void> {
  if (!state) return;
  const kept: JsonQuarantineRecord[] = [];
  for (const record of readJsonQuarantine()) {
    if (record.ownerId !== state.userId) {
      kept.push(record);
      continue;
    }
    let dataKey = await openWithRawKey(state.rawKey, record.keyIv, record.keyData);
    if (!dataKey) {
      for (const previous of state.previousRawKeys) {
        dataKey = await openWithRawKey(previous, record.keyIv, record.keyData);
        if (dataKey) break;
      }
    }
    const payload = dataKey
      ? await openWithRawKey(dataKey, record.payloadIv, record.payloadData)
      : null;
    if (!payload) {
      kept.push(record);
      continue;
    }
    if (!state.memory.has(record.base)) {
      state.memory.set(record.base, new TextDecoder().decode(payload));
    }
  }
  writeJsonQuarantine(kept);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index] ?? 0);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
