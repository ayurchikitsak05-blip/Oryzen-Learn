/**
 * Highlights are stored against the stable passage text. The PDF can show a
 * temporary flow layer and then a glyph layer whose words are not the same
 * string, so screen offsets must not be saved or painted as passage offsets.
 */

export interface TextRange {
  start: number;
  end: number;
}

interface CollapsedText {
  text: string;
  origins: number[];
}

function collapseWhitespace(value: string): CollapsedText {
  const origins: number[] = [];
  let text = "";
  let pendingSpace = false;
  for (let index = 0; index < value.length; index += 1) {
    if (/\s/.test(value[index] ?? "")) {
      if (text.length > 0) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      origins.push(index);
      text += " ";
      pendingSpace = false;
    }
    origins.push(index);
    text += value[index];
  }
  return { text, origins };
}

/** Finds a quote inside a passage. Whitespace differences do not move the match. */
export function locateQuote(passage: string, quote: string, hintRatio?: number): TextRange | null {
  const needle = quote.replace(/\s+/g, " ").trim();
  if (!needle || !passage) return null;
  const collapsed = collapseWhitespace(passage);
  const target = collapseWhitespace(needle).text;
  if (!target) return null;
  const hits: number[] = [];
  let from = 0;
  while (from <= collapsed.text.length) {
    const at = collapsed.text.indexOf(target, from);
    if (at < 0) break;
    hits.push(at);
    from = at + Math.max(1, target.length);
  }
  if (hits.length === 0) return null;
  const pick =
    hintRatio == null || hits.length === 1
      ? hits[0]
      : hits.reduce((best, at) => {
          const origin = collapsed.origins[at] ?? 0;
          const bestOrigin = collapsed.origins[best] ?? 0;
          const ratio = origin / Math.max(passage.length, 1);
          const bestRatio = bestOrigin / Math.max(passage.length, 1);
          return Math.abs(ratio - hintRatio) < Math.abs(bestRatio - hintRatio) ? at : best;
        });
  const start = collapsed.origins[pick];
  const end = (collapsed.origins[pick + target.length - 1] ?? start) + 1;
  if (start == null || end <= start) return null;
  return { start, end };
}

/**
 * Turns a screen selection into passage offsets.
 * When the rendered string is the passage, the selection range is kept.
 * When the rendered string is a later text layer, the selected words are found
 * in the passage instead of reusing the screen numbers.
 */
export function selectionOffsetsInPassage(
  passage: string,
  selected: string,
  domStart: number,
  domEnd: number,
  rendered: string
): TextRange | null {
  const quote = selected.replace(/\s+/g, " ").trim();
  if (!quote) return null;
  if (rendered === passage && domStart >= 0 && domEnd > domStart && domEnd <= passage.length) {
    const direct = passage.slice(domStart, domEnd).replace(/\s+/g, " ").trim();
    if (direct === quote) return { start: domStart, end: domEnd };
  }
  const hint = rendered.length > 0 ? Math.max(0, domStart) / rendered.length : undefined;
  return locateQuote(passage, quote, hint);
}

export function marksOnSurface<T extends TextRange>(
  passage: string,
  surface: string,
  marks: readonly T[]
): T[] {
  if (surface === passage) return [...marks];
  const projected: T[] = [];
  for (const mark of marks) {
    const quote = passage.slice(mark.start, mark.end).replace(/\s+/g, " ").trim();
    if (!quote) continue;
    const located = locateQuote(surface, quote);
    if (!located) continue;
    projected.push({ ...mark, start: located.start, end: located.end });
  }
  return projected;
}

export function markForPassageQuote<T extends { chunk_id: string; page_number: number; text: string }>(
  chunks: readonly T[],
  pageNumber: number,
  quote: string,
  kind: "highlight" | "underline"
): { chunkId: string; start: number; end: number; kind: "highlight" | "underline" } | null {
  const needle = quote.replace(/\s+/g, " ").trim();
  if (!needle) return null;
  const pageChunks = chunks.filter((chunk) => chunk.page_number === pageNumber);
  const pool = pageChunks.length > 0 ? pageChunks : chunks;
  for (const chunk of pool) {
    const located = locateQuote(chunk.text, needle);
    if (!located) continue;
    return { chunkId: chunk.chunk_id, start: located.start, end: located.end, kind };
  }
  return null;
}
