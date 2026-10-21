import type { AiLensResponsePayload } from "@/lib/ai/gateway";
import { excerptForDisplay, extractKeyPhrases, splitPassageSentences } from "@/lib/ai/lens-compose";
import type { CitationReadyChunk } from "@/lib/reader/extractor";
import type { LocalPdfChapterItem, LocalPdfDocumentRecord } from "@/lib/reader/storage";

export const TRANSFORM_CACHE_STORAGE_KEY = "oryzen_transform_v1";
export const TRANSFORM_EDITION = "revision_sheet" as const;
export const TRANSFORM_CHAPTER_MAX_CHARS = 4000;
export const TRANSFORM_CHAPTER_MAX_CHUNKS = 8;

export type TransformEdition = typeof TRANSFORM_EDITION;

export interface TransformChapterEdition {
  documentId: string;
  documentHash?: string;
  chapterTitle: string;
  pageNumber: number;
  edition: TransformEdition;
  summary: string;
  keyPoints: string[];
  selfCheck: string[];
  createdAt: string;
}

function cacheKey(
  documentHashOrId: string,
  chapterTitle: string,
  edition: TransformEdition
) {
  return `${documentHashOrId}::${chapterTitle}::${edition}`;
}

function readCacheMap(): Record<string, TransformChapterEdition> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TRANSFORM_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TransformChapterEdition>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function listTransformChapters(
  document: Pick<LocalPdfDocumentRecord, "chapters" | "chunks" | "pageCount">
): LocalPdfChapterItem[] {
  if (document.chapters.length > 0) return document.chapters;
  const first = document.chunks[0];
  return [
    {
      title: first?.section_heading || "Opening pages",
      pageNumber: first?.page_number ?? 1,
    },
  ];
}

export function chunksForChapter(
  document: Pick<LocalPdfDocumentRecord, "chapters" | "chunks" | "pageCount">,
  chapter: LocalPdfChapterItem
): CitationReadyChunk[] {
  const chapters = listTransformChapters(document);
  const index = chapters.findIndex(
    (item) => item.title === chapter.title && item.pageNumber === chapter.pageNumber
  );
  const start = chapter.pageNumber;
  const next = index >= 0 ? chapters[index + 1] : undefined;
  const end = next ? next.pageNumber : document.pageCount + 1;
  const scoped = document.chunks.filter(
    (chunk) => chunk.page_number >= start && chunk.page_number < end
  );
  return scoped.length > 0
    ? scoped
    : document.chunks.filter((chunk) => chunk.section_heading === chapter.title);
}

export function boundChapterSlice(
  chunks: CitationReadyChunk[],
  maxChars = TRANSFORM_CHAPTER_MAX_CHARS
): {
  selectedText: string;
  candidateChunks: CitationReadyChunk[];
} {
  const limited = chunks.slice(0, TRANSFORM_CHAPTER_MAX_CHUNKS);
  const used: CitationReadyChunk[] = [];
  let text = "";
  for (const chunk of limited) {
    const next = text ? `${text}\n\n${chunk.text}` : chunk.text;
    if (used.length > 0 && next.length > maxChars) break;
    text = next.slice(0, maxChars);
    used.push(chunk);
  }
  return { selectedText: text, candidateChunks: used };
}

export function composeChapterRevisionSheet(params: {
  documentId: string;
  documentHash?: string;
  chapter: LocalPdfChapterItem;
  chunks: CitationReadyChunk[];
}): TransformChapterEdition {
  const { selectedText } = boundChapterSlice(params.chunks);
  const sentences = splitPassageSentences(selectedText);
  const phrases = extractKeyPhrases(selectedText, 4);
  const summary = excerptForDisplay(
    sentences[0] ?? (selectedText || params.chapter.title),
    220
  );
  return {
    documentId: params.documentId,
    documentHash: params.documentHash,
    chapterTitle: params.chapter.title,
    pageNumber: params.chapter.pageNumber,
    edition: TRANSFORM_EDITION,
    summary,
    keyPoints: [
      excerptForDisplay(sentences[0] ?? phrases[0] ?? params.chapter.title, 140),
      excerptForDisplay(sentences[1] ?? phrases[1] ?? "Restate the chapter claim.", 140),
      excerptForDisplay(sentences[2] ?? phrases[2] ?? "Name one supporting term.", 140),
    ],
    selfCheck: [
      `In one sentence, what does “${params.chapter.title}” claim?`,
      `What would count as a faithful example using only this chapter’s pages?`,
    ],
    createdAt: new Date().toISOString(),
  };
}

export function editionFromLensRevision(params: {
  documentId: string;
  documentHash?: string;
  chapter: LocalPdfChapterItem;
  payload: Pick<AiLensResponsePayload, "revision" | "key_points">;
}): TransformChapterEdition | null {
  const revision = params.payload.revision;
  if (!revision?.quickSummary) return null;
  return {
    documentId: params.documentId,
    documentHash: params.documentHash,
    chapterTitle: params.chapter.title,
    pageNumber: params.chapter.pageNumber,
    edition: TRANSFORM_EDITION,
    summary: revision.quickSummary,
    keyPoints:
      revision.keyPoints.length > 0
        ? revision.keyPoints.slice(0, 6)
        : (params.payload.key_points ?? []).slice(0, 6),
    selfCheck:
      revision.examPractice.length > 0
        ? revision.examPractice.slice(0, 4)
        : [`In one sentence, what does “${params.chapter.title}” claim?`],
    createdAt: new Date().toISOString(),
  };
}

function lookupEdition(
  map: Record<string, TransformChapterEdition>,
  documentId: string,
  chapterTitle: string,
  edition: TransformEdition,
  documentHash?: string
): TransformChapterEdition | null {
  if (documentHash && map[cacheKey(documentHash, chapterTitle, edition)]) {
    return map[cacheKey(documentHash, chapterTitle, edition)];
  }
  return map[cacheKey(documentId, chapterTitle, edition)] ?? null;
}

export function readTransformEdition(
  documentId: string,
  chapterTitle: string,
  edition: TransformEdition = TRANSFORM_EDITION,
  documentHash?: string
): TransformChapterEdition | null {
  return lookupEdition(readCacheMap(), documentId, chapterTitle, edition, documentHash);
}

export function writeTransformEdition(edition: TransformChapterEdition): TransformChapterEdition {
  if (typeof window !== "undefined") {
    try {
      const map = readCacheMap();
      const key = edition.documentHash
        ? cacheKey(edition.documentHash, edition.chapterTitle, edition.edition)
        : cacheKey(edition.documentId, edition.chapterTitle, edition.edition);
      map[key] = edition;
      window.localStorage.setItem(TRANSFORM_CACHE_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Memory-less environments still return the composed sheet.
    }
  }
  return edition;
}

export function countTransformedChapters(
  documentId: string,
  chapters: LocalPdfChapterItem[],
  edition: TransformEdition = TRANSFORM_EDITION,
  documentHash?: string
): number {
  const map = readCacheMap();
  return chapters.filter((chapter) =>
    Boolean(lookupEdition(map, documentId, chapter.title, edition, documentHash))
  ).length;
}
