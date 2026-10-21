import { ensurePdfWorkerConfigured } from "@/lib/reader/pdf-worker";

const EXCERPT_LIMIT = 100_000;
export const MAX_TEXTBOOK_PAGES = 80;

export async function extractTextbookText(bytes: ArrayBuffer): Promise<{
  pageCount: number;
  excerpt: string;
}> {
  await ensurePdfWorkerConfigured();
  const pdfjs = await import("pdfjs-dist");
  const copy = new Uint8Array(bytes);
  const doc = await pdfjs.getDocument({ data: copy }).promise;
  const parts: string[] = [];
  let used = 0;
  const lastPage = Math.min(doc.numPages, MAX_TEXTBOOK_PAGES);
  for (let pageNumber = 1; pageNumber <= lastPage; pageNumber += 1) {
    if (used >= EXCERPT_LIMIT) break;
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    const piece = `\n\nPage ${pageNumber}\n${line}`;
    parts.push(piece.slice(0, EXCERPT_LIMIT - used));
    used += piece.length;
  }
  return {
    pageCount: doc.numPages,
    excerpt: parts.join("").trim(),
  };
}
