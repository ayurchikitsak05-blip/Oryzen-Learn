/**
 * Layer 2: Local-First Tablet PDF Storage Manager (IndexedDB + OPFS)
 * Stores raw PDF binaries locally on the student's tablet/device via Origin Private
 * File System (OPFS) and IndexedDB, with SHA-256 duplicate upload detection and
 * deterministic in-memory fallback for headless test environments.
 */

import { computeSha256Hex, findDuplicateDocumentByHash } from "./hashing";
import type { CitationReadyChunk } from "./extractor";

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

async function writeBinaryToOpfs(
  opfsFileName: string,
  bytes: Uint8Array
): Promise<boolean> {
  try {
    if (!(await isOpfsSupported())) return false;
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(opfsFileName, { create: true });
    if ("createWritable" in fileHandle) {
      const writable = await fileHandle.createWritable();
      const cleanBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(cleanBuffer).set(bytes);
      await writable.write(cleanBuffer);
      await writable.close();
      return true;
    }
  } catch {
    // Fall back to IndexedDB
  }
  return false;
}

async function readBinaryFromOpfs(
  opfsFileName: string
): Promise<Uint8Array | null> {
  try {
    if (!(await isOpfsSupported())) return null;
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(opfsFileName, {
      create: false,
    });
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/**
 * Lists all locally stored PDF document metadata records sorted by updatedAt descending.
 */
export async function listLocalPdfDocuments(): Promise<
  LocalPdfDocumentRecord[]
> {
  if (isIndexedDbSupported()) {
    try {
      const db = await openReaderIndexedDb();
      const records = await new Promise<LocalPdfDocumentRecord[]>(
        (resolve, reject) => {
          const tx = db.transaction(DOCUMENTS_STORE_NAME, "readonly");
          const store = tx.objectStore(DOCUMENTS_STORE_NAME);
          const req = store.getAll();
          req.onsuccess = () =>
            resolve((req.result ?? []) as LocalPdfDocumentRecord[]);
          req.onerror = () => reject(req.error);
        }
      );
      db.close();
      records.forEach((r) => memoryDocumentStore.set(r.id, r));
    } catch {
      // Fall back to memoryDocumentStore
    }
  }

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

  const id = `doc-${fileHash.slice(0, 12)}`;
  const opfsFileName = `${id}.pdf`;
  const nowIso = new Date().toISOString();

  let storageBackend: LocalPdfDocumentRecord["storageBackend"] = "memory";
  let opfsPath: string | null = null;

  const wroteOpfs = await writeBinaryToOpfs(opfsFileName, bytes);
  if (wroteOpfs) {
    storageBackend = "opfs";
    opfsPath = `opfs://${opfsFileName}`;
  }

  // Always update in-memory cache and IndexedDB when available
  const cleanCopy = new Uint8Array(bytes.byteLength);
  cleanCopy.set(bytes);
  memoryBinaryStore.set(id, cleanCopy);

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
    storageBackend: isIndexedDbSupported() && !wroteOpfs ? "indexeddb" : storageBackend,
    opfsPath,
    chapters: resolvedChapters,
    chunks: params.chunks ?? [],
    lastReadPage: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  memoryDocumentStore.set(id, record);

  if (isIndexedDbSupported()) {
    try {
      const db = await openReaderIndexedDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(
          [DOCUMENTS_STORE_NAME, BINARIES_STORE_NAME],
          "readwrite"
        );
        tx.objectStore(DOCUMENTS_STORE_NAME).put(record);
        tx.objectStore(BINARIES_STORE_NAME).put({ id, bytes: cleanCopy });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Memory fallback already holds the document
    }
  }

  return {
    document: record,
    isDuplicate: false,
  };
}

/**
 * Retrieves a local PDF document record by ID.
 */
export async function getLocalPdfDocument(
  documentId: string
): Promise<LocalPdfDocumentRecord | null> {
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
  const mem = memoryBinaryStore.get(documentId);
  if (mem) {
    const copy = new Uint8Array(mem.byteLength);
    copy.set(mem);
    return copy;
  }

  const opfsBytes = await readBinaryFromOpfs(`${documentId}.pdf`);
  if (opfsBytes) {
    memoryBinaryStore.set(documentId, opfsBytes);
    return opfsBytes;
  }

  if (isIndexedDbSupported()) {
    try {
      const db = await openReaderIndexedDb();
      const result = await new Promise<Uint8Array | null>((resolve, reject) => {
        const tx = db.transaction(BINARIES_STORE_NAME, "readonly");
        const req = tx.objectStore(BINARIES_STORE_NAME).get(documentId);
        req.onsuccess = () => {
          const val = req.result as { id: string; bytes: Uint8Array } | undefined;
          resolve(val?.bytes ?? null);
        };
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (result) {
        memoryBinaryStore.set(documentId, result);
        return result;
      }
    } catch {
      return null;
    }
  }

  return null;
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

  memoryDocumentStore.set(documentId, updated);

  if (isIndexedDbSupported()) {
    try {
      const db = await openReaderIndexedDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(DOCUMENTS_STORE_NAME, "readwrite");
        tx.objectStore(DOCUMENTS_STORE_NAME).put(updated);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Ignored
    }
  }

  return updated;
}

/**
 * Clears all local PDF records (used by unit tests to ensure clean state).
 */
export async function clearAllLocalPdfStorage(): Promise<void> {
  memoryDocumentStore.clear();
  memoryBinaryStore.clear();

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

  const objects: string[] = [];
  // Obj 1: Catalog
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // Obj 2: Pages root (kids will be 4, 6, 8, ... and Font is 3)
  const pageObjNumbers = pages.map((_, idx) => 4 + idx * 2);
  const kidsArray = pageObjNumbers.map((n) => `${n} 0 R`).join(" ");
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [ ${kidsArray} ] /Count ${pages.length} >>\nendobj\n`
  );

  // Obj 3: Helvetica Font
  objects.push(
    "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
  );

  pages.forEach((rawText, idx) => {
    const pageObjNum = 4 + idx * 2;
    const contentObjNum = pageObjNum + 1;
    const [headingPart, bodyPart] = rawText.split("|").map((s) => s.trim());
    const safeHeading = (headingPart || `CHAPTER ${idx + 1}`).replace(
      /[()\\]/g,
      ""
    );
    const safeBody = (
      bodyPart ||
      "Study text rendered inside the 3-page virtualized RAM window."
    ).replace(/[()\\]/g, "");

    // Split body into ~65 char lines for clean layout on 612x792 page
    const words = safeBody.split(/\s+/);
    const wrappedLines: string[] = [];
    let currentLine = "";
    for (const w of words) {
      if ((currentLine + " " + w).trim().length > 62) {
        wrappedLines.push(currentLine.trim());
        currentLine = w;
      } else {
        currentLine = (currentLine + " " + w).trim();
      }
    }
    if (currentLine.trim()) {
      wrappedLines.push(currentLine.trim());
    }

    const bodyCommands = wrappedLines
      .map((line) => `0 -24 Td (${line}) Tj`)
      .join("\n");

    const streamContent = [
      "BT",
      "/F1 16 Tf",
      `48 710 Td (${safeHeading}) Tj`,
      "/F1 12 Tf",
      `0 -12 Td (Page ${idx + 1} of ${pages.length} - Local-First OPFS/IndexedDB Study Buffer) Tj`,
      bodyCommands,
      "ET",
    ].join("\n");

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`
    );
  });

  let pdfText = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(pdfText.length);
    pdfText += obj;
  }

  const xrefOffset = pdfText.length;
  pdfText += `xref\n0 ${objects.length + 1}\n`;
  pdfText += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdfText += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdfText += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdfText);
}
