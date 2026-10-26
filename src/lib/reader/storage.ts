/**
 * Layer 2: Local-First Tablet PDF Storage Manager (IndexedDB + OPFS)
 * Stores raw PDF binaries locally on the student's tablet/device via Origin Private
 * File System (OPFS) and IndexedDB, with SHA-256 duplicate upload detection and
 * deterministic in-memory fallback for headless test environments.
 */

import { computeSha256Hex, findDuplicateDocumentByHash } from "./hashing";
import type { CitationReadyChunk } from "./extractor";
import { buildSelectableStudyPdf } from "./sample-chapter";
import {
  isAccountVaultUnlocked,
  openBytes,
  registerVaultLockHook,
  sealBytes,
  sealWithRawKey,
  wrapLegacyDataKey,
} from "@/lib/privacy/account-vault";

export const LOCAL_READER_DB_NAME = "prakriti_reader_local_db_v1";
export const LOCAL_READER_DB_VERSION = 1;
export const DOCUMENTS_STORE_NAME = "local_pdf_documents";
export const BINARIES_STORE_NAME = "local_pdf_binaries";

export interface LocalPdfChapterItem {
  title: string;
  pageNumber: number;
}

export interface LocalPdfDocumentRecord {
  id: string;
  title: string;
  fileName: string;
  fileHash: string;
  fileSize: number;
  pageCount: number;
  storageBackend: "opfs" | "indexeddb" | "memory";
  opfsPath: string | null;
  chapters: LocalPdfChapterItem[];
  chunks: CitationReadyChunk[];
  lastReadPage: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaveLocalPdfResult {
  document: LocalPdfDocumentRecord;
  isDuplicate: boolean;
}

// In-memory store backing environments without IndexedDB (e.g. Vitest/JSDOM or SSR)
// and acting as a hot metadata cache.
const memoryDocumentStore = new Map<string, LocalPdfDocumentRecord>();
const memoryBinaryStore = new Map<string, Uint8Array>();
const sealedDocumentFallback = new Map<string, { iv: string; data: string }>();
const sealedBinaryFallback = new Map<string, { iv: string; data: string }>();
const quarantinedBookFallback: QuarantineBookRecord[] = [];

registerVaultLockHook(() => {
  memoryDocumentStore.clear();
  memoryBinaryStore.clear();
});

type SealedBlob = { sealed: 1; id: string; iv: string; data: string };

type QuarantineBookRecord = {
  quarantine: 1;
  id: string;
  ownerId: null;
  payloadIv: string;
  payloadData: string;
  binaryIv: string | null;
  binaryData: string | null;
  keyIv: string;
  keyData: string;
};

function isQuarantineBook(value: unknown): value is QuarantineBookRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<QuarantineBookRecord>;
  return (
    record.quarantine === 1 &&
    typeof record.id === "string" &&
    typeof record.payloadIv === "string" &&
    typeof record.payloadData === "string" &&
    typeof record.keyIv === "string" &&
    typeof record.keyData === "string"
  );
}

function readSealedBlob(value: unknown): SealedBlob | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    record.sealed !== 1 ||
    typeof record.id !== "string" ||
    typeof record.iv !== "string" ||
    typeof record.data !== "string"
  ) {
    return null;
  }
  return { sealed: 1, id: record.id, iv: record.iv, data: record.data };
}

function isIndexedDbSupported(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof globalThis.indexedDB !== "undefined" &&
    globalThis.indexedDB !== null
  );
}

async function isOpfsSupported(): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.storage &&
      typeof navigator.storage.getDirectory === "function"
    ) {
      await navigator.storage.getDirectory();
      return true;
    }
  } catch {
    // OPFS unavailable in private browsing or test environment
  }
  return false;
}

function openReaderIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(
      LOCAL_READER_DB_NAME,
      LOCAL_READER_DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCUMENTS_STORE_NAME)) {
        db.createObjectStore(DOCUMENTS_STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BINARIES_STORE_NAME)) {
        db.createObjectStore(BINARIES_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

function plainBinaryBytes(value: unknown): Uint8Array | null {
  if (!value || typeof value !== "object") return null;
  const bytes = (value as { bytes?: unknown }).bytes;
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return null;
}

async function putQuarantineBook(record: QuarantineBookRecord): Promise<void> {
  quarantinedBookFallback.push(record);
  if (!isIndexedDbSupported()) return;
  const db = await openReaderIndexedDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DOCUMENTS_STORE_NAME, "readwrite");
    tx.objectStore(DOCUMENTS_STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function quarantinePlaintextBook(
  document: Record<string, unknown>,
  binary: Uint8Array | null
): Promise<boolean> {
  const sourceId = typeof document.id === "string" ? document.id : "";
  if (!sourceId) return false;
  if (quarantinedBookFallback.some((item) => item.id === `quarantine-${sourceId}`)) return true;
  const dataKey = crypto.getRandomValues(new Uint8Array(32));
  const sealedDocument = await sealWithRawKey(
    dataKey,
    new TextEncoder().encode(JSON.stringify(document))
  );
  const sealedBinary = binary ? await sealWithRawKey(dataKey, binary) : null;
  const wrapped = await wrapLegacyDataKey(null, dataKey);
  if (!wrapped) return false;
  await putQuarantineBook({
    quarantine: 1,
    id: `quarantine-${sourceId}`,
    ownerId: null,
    payloadIv: sealedDocument.iv,
    payloadData: sealedDocument.data,
    binaryIv: sealedBinary?.iv ?? null,
    binaryData: sealedBinary?.data ?? null,
    keyIv: wrapped.iv,
    keyData: wrapped.data,
  });
  return true;
}

async function quarantineLegacyBooks(): Promise<void> {
  const stored = await readStore<unknown>(DOCUMENTS_STORE_NAME).catch(() => []);
  const binaries = await readStore<unknown>(BINARIES_STORE_NAME).catch(() => []);
  const quarantinedIds: string[] = [];
  for (const item of stored) {
    if (!item || typeof item !== "object" || readSealedBlob(item) || isQuarantineBook(item)) continue;
    const document = item as Record<string, unknown>;
    const id = typeof document.id === "string" ? document.id : "";
    if (!id) continue;
    const binaryRecord = binaries.find(
      (entry) => Boolean(entry) && typeof entry === "object" && (entry as { id?: unknown }).id === id
    );
    const sealed = await quarantinePlaintextBook(document, plainBinaryBytes(binaryRecord));
    if (sealed) quarantinedIds.push(id);
  }
  await deleteStoredIds(quarantinedIds);
  try {
    if (!(await isOpfsSupported())) return;
    const root = await navigator.storage.getDirectory();
    for await (const [name] of root.entries()) {
      if (!name.endsWith(".pdf")) continue;
      const sourceId = name.slice(0, -4);
      if (quarantinedBookFallback.some((item) => item.id === `quarantine-${sourceId}`)) {
        await root.removeEntry(name).catch(() => undefined);
        continue;
      }
      const handle = await root.getFileHandle(name);
      const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      const sealed = await quarantinePlaintextBook(
        {
          id: sourceId,
          title: name,
          fileName: name,
          fileHash: "",
          fileSize: bytes.byteLength,
          pageCount: 1,
          storageBackend: "indexeddb",
          opfsPath: name,
          chapters: [],
          chunks: [],
          lastReadPage: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        bytes
      );
      if (sealed) await root.removeEntry(name).catch(() => undefined);
    }
  } catch {
    // A failed file read leaves the original file in place.
  }
}

async function readStore<T>(storeName: string): Promise<T[]> {
  if (!isIndexedDbSupported()) return [];
  const db = await openReaderIndexedDb();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve((request.result ?? []) as T[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function writeSealedPair(document: SealedBlob, binary: SealedBlob): Promise<void> {
  sealedDocumentFallback.set(document.id, { iv: document.iv, data: document.data });
  sealedBinaryFallback.set(binary.id, { iv: binary.iv, data: binary.data });
  if (!isIndexedDbSupported()) return;
  const db = await openReaderIndexedDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([DOCUMENTS_STORE_NAME, BINARIES_STORE_NAME], "readwrite");
    tx.objectStore(DOCUMENTS_STORE_NAME).put(document);
    tx.objectStore(BINARIES_STORE_NAME).put(binary);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function deleteStoredIds(ids: string[]): Promise<void> {
  for (const id of ids) {
    sealedDocumentFallback.delete(id);
    sealedBinaryFallback.delete(id);
  }
  if (!isIndexedDbSupported() || ids.length === 0) return;
  const db = await openReaderIndexedDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([DOCUMENTS_STORE_NAME, BINARIES_STORE_NAME], "readwrite");
    for (const id of ids) {
      tx.objectStore(DOCUMENTS_STORE_NAME).delete(id);
      tx.objectStore(BINARIES_STORE_NAME).delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadSealedDocuments(): Promise<void> {
  if (!isAccountVaultUnlocked()) return;
  await quarantineLegacyBooks();
  const stored = await readStore<unknown>(DOCUMENTS_STORE_NAME).catch(() => []);
  for (const item of stored) {
    const sealed = readSealedBlob(item);
    if (sealed) sealedDocumentFallback.set(sealed.id, { iv: sealed.iv, data: sealed.data });
  }
  const storedBinaries = await readStore<unknown>(BINARIES_STORE_NAME).catch(() => []);
  for (const item of storedBinaries) {
    const sealed = readSealedBlob(item);
    if (sealed) sealedBinaryFallback.set(sealed.id, { iv: sealed.iv, data: sealed.data });
  }
  const sealed = [...sealedDocumentFallback.entries()];
  for (const [id, blob] of sealed) {
    const opened = await openBytes(blob.iv, blob.data);
    if (!opened) continue;
    try {
      const record = JSON.parse(new TextDecoder().decode(opened)) as LocalPdfDocumentRecord;
      if (record?.id) memoryDocumentStore.set(record.id, record);
    } catch {
      // Another account's sealed book stays unreadable.
    }
  }
}

/**
 * Lists the signed-in account's PDF metadata. Other accounts' sealed books
 * and older plaintext copies are not returned.
 */
export async function listLocalPdfDocuments(): Promise<
  LocalPdfDocumentRecord[]
> {
  if (!isAccountVaultUnlocked()) return [];
  await loadSealedDocuments();
  return Array.from(memoryDocumentStore.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Stores a raw PDF binary and its extracted citation metadata locally on the device.
 * Automatically deduplicates uploads by SHA-256 hash.
 */
export async function saveLocalPdfDocument(params: {
  title: string;
  fileName: string;
  pdfBytes: Uint8Array | ArrayBuffer;
  pageCount: number;
  chapters?: LocalPdfChapterItem[];
  chunks?: CitationReadyChunk[];
}): Promise<SaveLocalPdfResult> {
  const bytes =
    params.pdfBytes instanceof Uint8Array
      ? params.pdfBytes
      : new Uint8Array(params.pdfBytes);

  const fileHash = await computeSha256Hex(bytes);
  const existingDocs = await listLocalPdfDocuments();
  const duplicate = findDuplicateDocumentByHash(fileHash, existingDocs);

  if (duplicate) {
    // Ensure binary is also hydrated in memory for fast access
    if (!memoryBinaryStore.has(duplicate.id)) {
      memoryBinaryStore.set(duplicate.id, bytes);
    }
    return {
      document: duplicate,
      isDuplicate: true,
    };
  }

  if (!isAccountVaultUnlocked()) {
    throw new Error("Sign in is required before a book can be saved on this device.");
  }

  const id = `doc-${fileHash.slice(0, 12)}`;
  const nowIso = new Date().toISOString();
  const cleanCopy = new Uint8Array(bytes.byteLength);
  cleanCopy.set(bytes);
  const resolvedChapters: LocalPdfChapterItem[] =
    params.chapters && params.chapters.length > 0
      ? params.chapters
      : Array.from({ length: Math.max(1, params.pageCount) }, (_, idx) => ({
          title: `Page ${idx + 1}`,
          pageNumber: idx + 1,
        }));
  const record: LocalPdfDocumentRecord = {
    id,
    title: params.title.trim() || params.fileName,
    fileName: params.fileName,
    fileHash,
    fileSize: bytes.byteLength,
    pageCount: Math.max(1, params.pageCount),
    storageBackend: "indexeddb",
    opfsPath: null,
    chapters: resolvedChapters,
    chunks: params.chunks ?? [],
    lastReadPage: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const sealedDocument = await sealBytes(new TextEncoder().encode(JSON.stringify(record)));
  const sealedBinary = await sealBytes(cleanCopy);
  if (!sealedDocument || !sealedBinary) {
    throw new Error("Sign in is required before a book can be saved on this device.");
  }
  await writeSealedPair(
    { sealed: 1, id, ...sealedDocument },
    { sealed: 1, id, ...sealedBinary }
  );
  memoryDocumentStore.set(id, record);
  memoryBinaryStore.set(id, cleanCopy);
  await quarantineLegacyBooks();
  return { document: record, isDuplicate: false };
}

/**
 * Retrieves a local PDF document record by ID.
 */
export async function getLocalPdfDocument(
  documentId: string
): Promise<LocalPdfDocumentRecord | null> {
  if (!isAccountVaultUnlocked()) return null;
  const cached = memoryDocumentStore.get(documentId);
  if (cached) return cached;

  const all = await listLocalPdfDocuments();
  return all.find((d) => d.id === documentId) ?? null;
}

/**
 * Retrieves the raw PDF binary bytes (`Uint8Array`) from OPFS, IndexedDB, or local memory.
 */
export async function getLocalPdfBinary(
  documentId: string
): Promise<Uint8Array | null> {
  if (!isAccountVaultUnlocked()) return null;
  const mem = memoryBinaryStore.get(documentId);
  if (mem) {
    const copy = new Uint8Array(mem.byteLength);
    copy.set(mem);
    return copy;
  }
  const fallback = sealedBinaryFallback.get(documentId);
  const stored =
    fallback ??
    (await readStore<unknown>(BINARIES_STORE_NAME).catch(() => []))
      .map(readSealedBlob)
      .find((item) => item?.id === documentId);
  if (!stored) return null;
  const opened = await openBytes(stored.iv, stored.data);
  if (!opened) return null;
  memoryBinaryStore.set(documentId, opened);
  return opened;
}

/**
 * Updates the student's last-read page number or extracted citation chunks for a local PDF.
 */
export async function updateLocalPdfMetadata(
  documentId: string,
  patch: Partial<
    Pick<LocalPdfDocumentRecord, "lastReadPage" | "chapters" | "chunks" | "pageCount">
  >
): Promise<LocalPdfDocumentRecord | null> {
  const existing = await getLocalPdfDocument(documentId);
  if (!existing) return null;

  const updated: LocalPdfDocumentRecord = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  const sealedDocument = await sealBytes(new TextEncoder().encode(JSON.stringify(updated)));
  const existingBinary = sealedBinaryFallback.get(documentId);
  if (!sealedDocument || !existingBinary) return null;
  await writeSealedPair(
    { sealed: 1, id: documentId, ...sealedDocument },
    { sealed: 1, id: documentId, ...existingBinary }
  );
  memoryDocumentStore.set(documentId, updated);
  return updated;
}

export async function removeLocalPdfDocument(documentId: string): Promise<void> {
  memoryDocumentStore.delete(documentId);
  memoryBinaryStore.delete(documentId);
  await deleteStoredIds([documentId]);
  await quarantineLegacyBooks();
}

/**
 * Clears all local PDF records (used by unit tests to ensure clean state).
 */
export async function clearAllLocalPdfStorage(): Promise<void> {
  memoryDocumentStore.clear();
  memoryBinaryStore.clear();
  sealedDocumentFallback.clear();
  sealedBinaryFallback.clear();
  quarantinedBookFallback.length = 0;

  if (isIndexedDbSupported()) {
    try {
      const db = await openReaderIndexedDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(
          [DOCUMENTS_STORE_NAME, BINARIES_STORE_NAME],
          "readwrite"
        );
        tx.objectStore(DOCUMENTS_STORE_NAME).clear();
        tx.objectStore(BINARIES_STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Ignored
    }
  }
}

export function legacyBookQuarantineSnapshot(): string {
  return JSON.stringify(quarantinedBookFallback);
}

export function sealedPdfSnapshot(): string {
  return JSON.stringify({
    documents: [...sealedDocumentFallback.values()],
    binaries: [...sealedBinaryFallback.values()],
  });
}

/**
 * Generates a valid, multi-page PDF binary in pure TypeScript containing
 * a cross-faculty study companion (energy constitution plus sample chapters)
 * so students in any discipline can immediately test
 * the 3-page virtualized canvas window and text extraction on device or upload their own PDF.
 */
export function buildEmbeddedAyurvedaSamplePdf(pageTexts?: string[]): Uint8Array {
  const pages =
    pageTexts && pageTexts.length > 0
      ? pageTexts
      : [
          "CHAPTER 1: ENERGY AND CONSTITUTION | Vata, Pitta, and Kapha are three study energies. Balance supports clear grasping (Dhee), steady focus (Dhriti), and reliable recall (Smriti) in any subject.",
          "CHAPTER 2: SCREEN ENDURANCE | Alochaka Pitta governs visual endurance. Anti-glare surfaces and short gaze breaks protect clarity during long reading in any faculty.",
          "CHAPTER 3: PRAKRITI ADAPTIVE STUDY | Vata grasps rapidly (Shighra-grahi) via analogies; Pitta analyzes sharply (Tikshna-buddhi) via comparison tables; Kapha retains steadily (Dridha-smriti) via worked examples.",
          "CHAPTER 4: ACROSS THE FACULTIES | The same passage tools apply to a physics derivation, a historical argument, a formal proof, or a laboratory method.",
          "CHAPTER 5: HIGH-YIELD REVISION | Spaced recall, comparison tables, and short quizzes lock calculus, literature, economics, and laboratory sequences alike.",
        ];

  return buildSelectableStudyPdf(pages);
}
