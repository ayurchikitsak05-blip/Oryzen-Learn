export type StudyChunkRef = {
  chunk_id: string;
  document_id: string;
  page_number: number;
  text: string;
  section_heading?: string;
};

export type StudySnapshot = {
  documentId: string;
  documentHash: string;
  pageNumber: number;
  chunkId: string;
  sectionHeading: string;
  selectedText: string;
  lens: string;
};

export type LiveStudyContext = {
  documentId: string;
  pageNumber: number;
  lens: string;
  selectedText: string;
};

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function fold(text: string): string {
  return compact(text).toLowerCase();
}

export function passageBelongsToPage(passage: string, pageText: string): boolean {
  const needle = fold(passage);
  const haystack = fold(pageText);
  if (!needle || !haystack) return false;
  return haystack.includes(needle);
}

/**
 * Chunks stored on a textbook sometimes keep the indexer slug instead of the
 * saved document id. A mixed library still prefers exact id matches.
 */
export function chunksForDocument(
  chunks: readonly StudyChunkRef[],
  documentId: string
): StudyChunkRef[] {
  const exact = chunks.filter((chunk) => chunk.document_id === documentId);
  if (exact.length > 0) return exact;
  return chunks.map((chunk) => ({ ...chunk, document_id: documentId }));
}

export function pageTextFor(
  chunks: readonly StudyChunkRef[],
  documentId: string,
  pageNumber: number
): string {
  return chunksForDocument(chunks, documentId)
    .filter((chunk) => chunk.page_number === pageNumber)
    .map((chunk) => chunk.text)
    .join("\n");
}

/**
 * The passage sent to the model has to be text on the open page.
 * A highlight left over from another textbook is discarded.
 */
export function resolveStudySnapshot(input: {
  documentId: string;
  documentHash: string;
  pageNumber: number;
  chunks: readonly StudyChunkRef[];
  chunk: StudyChunkRef | null;
  overrideText?: string | null;
  lens: string;
  /** A passage the student just selected on this page. Kept verbatim. */
  exactSelection?: boolean;
}): { ok: true; snapshot: StudySnapshot } | { ok: false; reason: "missing_passage" } {
  const pageChunks = chunksForDocument(input.chunks, input.documentId).filter(
    (chunk) => chunk.page_number === input.pageNumber
  );
  const pageText = pageChunks.map((chunk) => chunk.text).join("\n");
  const override = compact(input.overrideText ?? "");
  if (!override) return { ok: false, reason: "missing_passage" };
  if (!pageText.trim() && !input.exactSelection) return { ok: false, reason: "missing_passage" };
  if (pageText.trim() && !passageBelongsToPage(override, pageText) && !input.exactSelection) {
    return { ok: false, reason: "missing_passage" };
  }

  const chunkOnPage =
    input.chunk &&
    (input.chunk.document_id === input.documentId || pageChunks.some((item) => item.chunk_id === input.chunk?.chunk_id)) &&
    input.chunk.page_number === input.pageNumber
      ? input.chunk
      : null;

  const chunk =
    pageChunks.find((item) => fold(item.text).includes(fold(override))) ??
    (chunkOnPage && pageChunks.some((item) => item.chunk_id === chunkOnPage.chunk_id) ? chunkOnPage : null) ??
    pageChunks[0] ??
    null;
  if (!chunk) return { ok: false, reason: "missing_passage" };
  const selected = override;
  return {
    ok: true,
    snapshot: {
      documentId: input.documentId,
      documentHash: input.documentHash,
      pageNumber: input.pageNumber,
      chunkId: chunk.chunk_id,
      sectionHeading: chunk.section_heading ?? "",
      selectedText: selected,
      lens: input.lens,
    },
  };
}

export function studySnapshotIsCurrent(snapshot: StudySnapshot, current: LiveStudyContext): boolean {
  return (
    snapshot.documentId === current.documentId &&
    snapshot.pageNumber === current.pageNumber &&
    snapshot.lens === current.lens &&
    fold(snapshot.selectedText) === fold(current.selectedText)
  );
}

export function acceptSelectionText(
  selectionText: string,
  chunk: StudyChunkRef | null,
  chunks: readonly StudyChunkRef[],
  documentId: string,
  pageNumber: number
): string | null {
  void chunk;
  const pageText = pageTextFor(chunks, documentId, pageNumber);
  const selection = compact(selectionText);
  if (!selection || !passageBelongsToPage(selection, pageText)) return null;
  return selection;
}
