import { excerptForDisplay, extractKeyPhrases, splitPassageSentences } from "@/lib/ai/lens-compose";
import type { CitationReadyChunk } from "@/lib/reader/extractor";
import type { LocalPdfChapterItem, LocalPdfDocumentRecord } from "@/lib/reader/storage";

export const TRANSFORM_CACHE_STORAGE_KEY = "oryzen_transform_v1";
export const TRANSFORM_EDITION = "revision_sheet" as const;

export type TransformEdition = typeof TRANSFORM_EDITION;

export interface TransformChapterEdition {
  documentId: string;
  chapterTitle: string;
  pageNumber: number;
  edition: TransformEdition;
  summary: string;
  keyPoints: string[];
  selfCheck: string[];
  createdAt: string;
}

function cacheKey(documentId: string, chapterTitle: string, edition: TransformEdition) {
  return `${documentId}::${chapterTitle}::${edition}`;
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

export function composeChapterRevisionSheet(params: {
  documentId: string;
  chapter: LocalPdfChapterItem;
  chunks: CitationReadyChunk[];
}): TransformChapterEdition {
  const text = params.chunks
    .slice(0, 8)
    .map((chunk) => chunk.text)
    .join(" ");
  const sentences = splitPassageSentences(text);
  const phrases = extractKeyPhrases(text, 4);
  const summary = excerptForDisplay(sentences[0] ?? (text || params.chapter.title), 220);
  return {
    documentId: params.documentId,
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

export function readTransformEdition(
  documentId: string,
  chapterTitle: string,
  edition: TransformEdition = TRANSFORM_EDITION
): TransformChapterEdition | null {
  return readCacheMap()[cacheKey(documentId, chapterTitle, edition)] ?? null;
}

export function writeTransformEdition(edition: TransformChapterEdition): TransformChapterEdition {
  if (typeof window !== "undefined") {
    try {
      const map = readCacheMap();
      map[cacheKey(edition.documentId, edition.chapterTitle, edition.edition)] = edition;
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
  edition: TransformEdition = TRANSFORM_EDITION
): number {
  const map = readCacheMap();
  return chapters.filter((chapter) =>
    Boolean(map[cacheKey(documentId, chapter.title, edition)])
  ).length;
}
