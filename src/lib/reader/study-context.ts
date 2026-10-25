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
  if (needle.length < 8 || !haystack) return false;
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
}): { ok: true; snapshot: StudySnapshot } | { ok: false; reason: "missing_passage" } {
  const pageChunks = chunksForDocument(input.chunks, input.documentId).filter(
    (chunk) => chunk.page_number === input.pageNumber
  );
  const pageText = pageChunks.map((chunk) => chunk.text).join("\n");
  if (!pageText.trim()) return { ok: false, reason: "missing_passage" };

  const override = compact(input.overrideText ?? "");
  const chunkOnPage =
    input.chunk &&
    input.chunk.document_id === input.documentId &&
    input.chunk.page_number === input.pageNumber
      ? input.chunk
      : null;

  let selected = "";
  let chunk: StudyChunkRef | null = null;
  if (override && passageBelongsToPage(override, pageText)) {
    selected = override;
    chunk =
      pageChunks.find((item) => fold(item.text).includes(fold(override))) ??
      chunkOnPage ??
      pageChunks[0] ??
      null;
  } else if (chunkOnPage && passageBelongsToPage(chunkOnPage.text, pageText)) {
    selected = compact(chunkOnPage.text);
    chunk = chunkOnPage;
  } else if (pageChunks[0]) {
    selected = compact(pageChunks[0].text);
    chunk = pageChunks[0];
  }
  if (!chunk || !selected) return { ok: false, reason: "missing_passage" };
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
  const pageText = pageTextFor(chunks, documentId, pageNumber);
  const selection = compact(selectionText);
  if (selection && passageBelongsToPage(selection, pageText)) return selection;
  if (
    chunk &&
    chunk.document_id === documentId &&
    chunk.page_number === pageNumber &&
    passageBelongsToPage(chunk.text, pageText)
  ) {
    return compact(chunk.text);
  }
  return null;
}
