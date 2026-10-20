/**
 * Layer 2: SHA-256 File Hashing & Duplicate Upload Detection Utility
 * Uses standard Web Crypto API (crypto.subtle.digest) available in browsers and Node.js.
 */

export interface HashedFileMetadata {
  fileHash: string;
  byteLength: number;
}

function toUint8Array(input: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof input === "string") {
    return new TextEncoder().encode(input);
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  return new Uint8Array(input);
}

/**
 * Computes a lowercase 64-character hexadecimal SHA-256 digest of a file buffer, Blob, or string.
 */
export async function computeSha256Hex(
  input: ArrayBuffer | Uint8Array | Blob | string
): Promise<string> {
  let bytes: Uint8Array;

  if (typeof Blob !== "undefined" && input instanceof Blob) {
    const arrayBuffer = await input.arrayBuffer();
    bytes = new Uint8Array(arrayBuffer);
  } else {
    bytes = toUint8Array(input as ArrayBuffer | Uint8Array | string);
  }

  // Copy into a standard ArrayBuffer to satisfy strict BufferSource typing
  const cleanBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(cleanBuffer).set(bytes);

  const digestBuffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    cleanBuffer
  );
  const hashArray = Array.from(new Uint8Array(digestBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes both the SHA-256 hex digest and exact byte size for an uploaded PDF binary.
 */
export async function hashPdfBinary(
  input: ArrayBuffer | Uint8Array | Blob
): Promise<HashedFileMetadata> {
  const byteLength =
    "size" in input ? input.size : input.byteLength;

  const fileHash = await computeSha256Hex(input);
  return {
    fileHash,
    byteLength,
  };
}

/**
 * Checks whether a document with the identical SHA-256 hash already exists in local storage.
 */
export function findDuplicateDocumentByHash<
  T extends { fileHash: string; id: string }
>(fileHash: string, existingDocs: readonly T[]): T | null {
  const normalized = fileHash.trim().toLowerCase();
  if (!normalized) return null;
  return (
    existingDocs.find((doc) => doc.fileHash.toLowerCase() === normalized) ??
    null
  );
}
