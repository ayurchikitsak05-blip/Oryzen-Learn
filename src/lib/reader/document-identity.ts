import type { CitationReadyChunk } from "@/lib/reader/extractor";

/**
 * A saved book id is `doc-` plus the first 12 hex characters of the file hash.
 * Indexer labels such as `work-and-energy-chapter` are not saved book ids.
 */
const SAVED_BOOK_ID = /^doc-[0-9a-f]{12}$/;

export function isSavedBookId(id: string): boolean {
  return SAVED_BOOK_ID.test(id);
}

/**
 * The chunks array is the open book's own stored chunks.
 * A highlight belongs to that book when its chunk id is in the list.
 * An indexer slug on those chunks is the label used before the book id
 * existed. A chunk that already names a different saved book is not claimed.
 */
export function chunkListedForBook(
  chunk: { chunk_id: string; document_id: string },
  bookId: string | null,
  bookChunks: readonly { chunk_id: string; document_id: string }[]
): boolean {
  const stored = bookChunks.find((item) => item.chunk_id === chunk.chunk_id);
  if (!stored) return false;
  if (!bookId) return true;
  if (stored.document_id === bookId) return true;
  return !isSavedBookId(stored.document_id);
}

/**
 * Margin notes saved before the book id was known use the indexer slug.
 * Notes for another saved book stay on that book.
 */
export function noteListedForBook(
  noteDocumentId: string,
  bookId: string | null,
  bookChunks: readonly { document_id: string }[]
): boolean {
  if (!bookId) return true;
  if (noteDocumentId === bookId) return true;
  return bookChunks.some(
    (chunk) => chunk.document_id === noteDocumentId && !isSavedBookId(chunk.document_id)
  );
}

/**
 * First save of a book stamps the saved id onto indexer-slug chunks.
 * Chunk ids stay as they are, so a highlight already aimed at
 * `work-and-energy-chapter-p1-c1` still finds its passage.
 * Chunks that already name another saved book are not reassigned.
 * This does not open or rewrite a book that is already sealed.
 */
export function chunksStoredOnBook<T extends { document_id: string }>(
  bookId: string,
  chunks: readonly T[]
): T[] {
  return chunks.map((chunk) => {
    if (chunk.document_id === bookId || isSavedBookId(chunk.document_id)) return chunk;
    return { ...chunk, document_id: bookId };
  });
}

export function passageQuote(chunk: Pick<CitationReadyChunk, "text">, start: number, end: number): string {
  if (start < 0 || end <= start || end > chunk.text.length) return "";
  return chunk.text.slice(start, end).trim();
}
