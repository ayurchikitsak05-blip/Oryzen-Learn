import { chunkListedForBook, noteListedForBook, passageQuote } from "@/lib/reader/document-identity";
import type { CitationReadyChunk } from "@/lib/reader/extractor";

export interface HighlightSlice {
  chunkId: string;
  start: number;
  end: number;
  kind: "highlight" | "underline";
}

export interface ReaderMarginNote {
  id: string;
  documentId: string;
  pageNumber: number;
  sectionHeading: string;
  quote: string;
  body: string;
  createdAt: string;
}

export interface AnnotationExportItem {
  kind: "highlight" | "underline" | "note";
  pageNumber: number;
  sectionHeading: string;
  quote: string;
  body?: string;
}

export function collectAnnotations(input: {
  documentId: string | null;
  chunks: readonly CitationReadyChunk[];
  marks: readonly HighlightSlice[];
  notes: readonly ReaderMarginNote[];
}): AnnotationExportItem[] {
  const highlights: AnnotationExportItem[] = [];
  for (const mark of input.marks) {
    if (mark.kind !== "highlight" && mark.kind !== "underline") continue;
    const chunk = input.chunks.find((item) => item.chunk_id === mark.chunkId);
    if (!chunk || !chunkListedForBook(chunk, input.documentId, input.chunks)) continue;
    const quote = passageQuote(chunk, mark.start, mark.end);
    if (!quote) continue;
    highlights.push({
      kind: mark.kind,
      pageNumber: chunk.page_number,
      sectionHeading: chunk.section_heading,
      quote,
    });
  }

  const notes = input.notes
    .filter((note) => noteListedForBook(note.documentId, input.documentId, input.chunks))
    .map((note) => ({
      kind: "note" as const,
      pageNumber: note.pageNumber,
      sectionHeading: note.sectionHeading,
      quote: note.quote,
      body: note.body,
    }));

  return [...highlights, ...notes].sort((a, b) => a.pageNumber - b.pageNumber);
}

export function annotationsToMarkdown(
  title: string,
  items: readonly AnnotationExportItem[]
): string {
  const lines = [`# ${title}`, "", "Annotations", ""];
  if (items.length === 0) {
    lines.push("No highlights or margin notes yet.");
    return lines.join("\n");
  }
  for (const item of items) {
    lines.push(`## Page ${item.pageNumber} · ${item.sectionHeading}`);
    lines.push("");
    lines.push(`> ${item.quote}`);
    if (item.body) {
      lines.push("");
      lines.push(item.body);
    }
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}
