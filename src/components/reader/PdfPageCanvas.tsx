"use client";

import React, { useEffect, useRef, useState } from "react";
import { ensurePdfWorkerConfigured } from "@/lib/reader/pdf-worker";
import { withTimeout, type PageGeometry } from "@/lib/reader/fit";
import {
  runsForPassage,
  runsFromTextItems,
  type PdfTextRun,
  type RawPdfTextItem,
} from "@/lib/reader/pdf-text-layer";
import type { CitationReadyChunk } from "@/lib/reader/extractor";
import type { PrakritiThemePalette } from "@/lib/prakriti/config";
import PassageText, {
  type ReaderTextMark,
  type SelectionToolbarState,
} from "@/components/reader/PassageText";

function resolveChunk(
  chunks: CitationReadyChunk[],
  selectedText: string
): CitationReadyChunk {
  const needle = selectedText.trim().slice(0, 48);
  return chunks.find((chunk) => chunk.text.includes(needle)) ?? chunks[0];
}

export function PdfPageCanvas({
  pageNumber,
  isActivePage,
  zoomScale,
  pdfBytes,
  pageChunks,
  theme,
  marks,
  onPageGeometry,
  onAddMark,
  onAddNote,
  onSelection,
}: {
  pageNumber: number;
  isActivePage: boolean;
  zoomScale: number;
  pdfBytes: Uint8Array | null;
  pageChunks: CitationReadyChunk[];
  theme: PrakritiThemePalette;
  marks: readonly ReaderTextMark[];
  onPageGeometry: (pageNumber: number, geometry: PageGeometry) => void;
  onAddMark: (mark: Omit<ReaderTextMark, "id">) => void;
  onAddNote: (quote: string, note: string, chunk: CitationReadyChunk) => void;
  onSelection: (
    chunk: CitationReadyChunk,
    selection: SelectionToolbarState | null
  ) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderSize, setRenderSize] = useState<PageGeometry>({ width: 0, height: 0 });
  const [baseSize, setBaseSize] = useState<PageGeometry>({ width: 0, height: 0 });
  const [renderStatus, setRenderStatus] = useState<"rendering" | "ready" | "fallback">(
    "rendering"
  );
  const [textRuns, setTextRuns] = useState<PdfTextRun[]>([]);
  const pageChunksRef = useRef(pageChunks);
  pageChunksRef.current = pageChunks;
  const passageKey = pageChunks.map((chunk) => chunk.text).join("\n");

  useEffect(() => {
    let cancelled = false;
    const canvasEl = canvasRef.current;

    async function renderPdfPage() {
      if (!canvasEl || !pdfBytes) {
        setTextRuns([]);
        setRenderStatus("rendering");
        return;
      }
      setRenderStatus("rendering");
      try {
        await withTimeout(ensurePdfWorkerConfigured(), 2500, "pdf worker");
        const pdfjs = await withTimeout(import("pdfjs-dist"), 2500, "pdfjs import");
        const dataCopy = new Uint8Array(pdfBytes.byteLength);
        dataCopy.set(pdfBytes);
        const loadingTask = pdfjs.getDocument({ data: dataCopy });
        const pdfDoc = await withTimeout(loadingTask.promise, 4000, "pdf document");
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }
        const page = await pdfDoc.getPage(
          Math.min(Math.max(1, pageNumber), pdfDoc.numPages)
        );
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: zoomScale });
        const pixelRatio = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
        canvasEl.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
        canvasEl.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
        const ctx = canvasEl.getContext("2d");
        if (ctx) {
          await page.render({
            canvasContext: ctx,
            canvas: canvasEl,
            viewport,
            transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          }).promise;
        }
        if (!cancelled) {
          const geometry = { width: base.width, height: base.height };
          let runs: PdfTextRun[] = [];
          try {
            const textContent = await page.getTextContent();
            const items: RawPdfTextItem[] = [];
            for (const item of textContent.items) {
              if (!("str" in item) || !item.str?.trim()) continue;
              items.push({
                str: item.str,
                width: item.width,
                height: item.height,
                transform: item.transform,
              });
            }
            const passage = pageChunksRef.current.map((chunk) => chunk.text).join(" ");
            runs = runsForPassage(runsFromTextItems(items, base.transform), passage);
          } catch {
            runs = [];
          }
          setBaseSize(geometry);
          setRenderSize({ width: viewport.width, height: viewport.height });
          setTextRuns(runs);
          onPageGeometry(pageNumber, geometry);
          setRenderStatus("ready");
        }
        await loadingTask.destroy();
      } catch {
        if (cancelled || !canvasEl) return;
        const width = Math.round(612 * zoomScale);
        const height = Math.round(792 * zoomScale);
        canvasEl.width = width;
        canvasEl.height = height;
        const ctx = canvasEl.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#fffdfc";
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = "#20242b";
          ctx.font = `500 ${Math.round(16 * zoomScale)}px Inter, sans-serif`;
          const heading = pageChunksRef.current[0]?.section_heading ?? `Page ${pageNumber}`;
          ctx.fillText(heading.slice(0, 48), 32, Math.round(52 * zoomScale));
          ctx.fillStyle = "#303640";
          ctx.font = `${Math.round(13 * zoomScale)}px Inter, sans-serif`;
          let cursorY = Math.round(90 * zoomScale);
          for (const chunk of pageChunksRef.current) {
            const words = chunk.text.split(/\s+/);
            let line = "";
            for (const word of words) {
              if (`${line} ${word}`.length > 62) {
                ctx.fillText(line.trim(), 32, cursorY);
                cursorY += Math.round(20 * zoomScale);
                line = word;
              } else {
                line = `${line} ${word}`.trim();
              }
            }
            if (line.trim()) {
              ctx.fillText(line.trim(), 32, cursorY);
              cursorY += Math.round(26 * zoomScale);
            }
          }
        }
        const geometry = { width: 612, height: 792 };
        setBaseSize(geometry);
        setRenderSize({ width, height });
        setTextRuns([]);
        onPageGeometry(pageNumber, geometry);
        setRenderStatus("fallback");
      }
    }

    void renderPdfPage();
    return () => {
      cancelled = true;
    };
  }, [pageNumber, zoomScale, pdfBytes, passageKey, onPageGeometry]);

  return (
    <div
      data-testid={`pdf-mounted-page-${pageNumber}`}
      data-active={isActivePage ? "true" : "false"}
      data-render={renderStatus}
      data-page-width={renderSize.width || undefined}
      data-page-height={renderSize.height || undefined}
      className="relative inline-block max-w-none shrink-0"
    >
      <span className="sr-only">
        Page {pageNumber}
        {renderStatus === "rendering" ? " loading" : ""}
      </span>
      <canvas
        ref={canvasRef}
        aria-label={`PDF Canvas Page ${pageNumber}`}
        className="block rounded-sm bg-white shadow-[0_18px_40px_-28px_rgba(32,36,43,0.4)]"
        style={{
          width: renderSize.width || undefined,
          height: renderSize.height || undefined,
        }}
      />
      {renderSize.width > 0 && baseSize.width > 0 && pageChunks[0] ? (
        <div
          className="absolute left-0 top-0 overflow-hidden"
          data-testid="pdf-text-layer"
          data-align={textRuns.length > 0 ? "glyphs" : "flow"}
          style={{
            width: baseSize.width,
            height: baseSize.height,
            transform: `scale(${renderSize.width / baseSize.width})`,
            transformOrigin: "top left",
          }}
        >
          <div className={textRuns.length > 0 ? "h-full w-full" : "h-full w-full px-[8%] py-[10%]"}>
          <PassageText
            chunkId={pageChunks[0].chunk_id}
            text={pageChunks.map((chunk) => chunk.text).join(" ")}
            marks={marks}
            overlay
            placedLines={textRuns}
            onAddMark={onAddMark}
            onExplain={(selectedText) =>
              onSelection(resolveChunk(pageChunks, selectedText), {
                top: 120,
                left: renderSize.width / 2,
                start: 0,
                end: selectedText.length,
                text: selectedText,
              })
            }
            onAddNote={(quote, note) =>
              onAddNote(quote, note, resolveChunk(pageChunks, quote))
            }
            onSelectionChange={(selection) => {
              if (!selection?.text.trim()) {
                onSelection(pageChunks[0], null);
                return;
              }
              onSelection(resolveChunk(pageChunks, selection.text), selection);
            }}
          />
          </div>
        </div>
      ) : null}
      <span className="sr-only" style={{ color: theme.textSecondaryHex }}>
        {pageChunks[0]?.section_heading ?? `Page ${pageNumber}`}
      </span>
    </div>
  );
}
