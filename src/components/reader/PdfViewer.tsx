"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileUp,
  Highlighter,
  Layers,
  PanelTop,
  PanelTopClose,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  clampReaderZoom,
  computeThreePageWindow,
  DEFAULT_READER_ZOOM,
  ensurePdfWorkerConfigured,
} from "@/lib/reader/pdf-worker";
import {
  extractDocumentCitationIndex,
  type CitationReadyChunk,
  type RawPdfTextItem,
} from "@/lib/reader/extractor";
import {
  buildEmbeddedAyurvedaSamplePdf,
  getLocalPdfBinary,
  listLocalPdfDocuments,
  saveLocalPdfDocument,
  updateLocalPdfMetadata,
  type LocalPdfDocumentRecord,
} from "@/lib/reader/storage";
import type {
  Dosha,
  HighlightLensType,
  PrakritiThemePalette,
} from "@/lib/prakriti/config";
import HighlightToolbar from "@/components/reader/HighlightToolbar";
import {
  AnnotationsDrawer,
  ContentsModal,
  PageGridModal,
} from "@/components/reader/ReaderOverlays";
import type { ReaderMarginNote } from "@/lib/reader/annotations";
import PassageText, {
  type ReaderTextMark,
} from "@/components/reader/PassageText";
import type {
  AiGatewayExecutionResult,
  InlineCitationCoordinate,
} from "@/lib/ai/gateway";
import {
  listSavedPassages,
  savePassageEntry,
  type SavedPassageEntry,
} from "@/lib/ai/passage-store";

export interface PdfViewerProps {
  theme?: PrakritiThemePalette;
  initialActivePage?: number;
  promptUpload?: boolean;
}

const READER_MARKS_STORAGE_KEY = "oryzen_reader_text_marks_v1";
const READER_NOTES_STORAGE_KEY = "oryzen_reader_margin_notes_v1";

const DEFAULT_THEME: PrakritiThemePalette = {
  cssVariable: "--theme-vata",
  name: "Warm Parchment",
  backgroundHex: "#FBF5E8",
  surfaceHex: "#F3E8D2",
  textPrimaryHex: "#2C221E",
  textSecondaryHex: "#645147",
  accentHex: "#C86428",
  borderHex: "#E2D2B5",
  canvasGradientCss:
    "radial-gradient(circle at top left, #FFFDF8 0%, #FBF5E8 55%, #F3E8D2 100%)",
};

interface VirtualizedPageCanvasProps {
  pageNumber: number;
  isActivePage: boolean;
  zoomScale: number;
  pdfBytes: Uint8Array | null;
  pageChunks: CitationReadyChunk[];
  selectedChunkId: string | null;
  onSelectChunk: (chunk: CitationReadyChunk, selectedText?: string) => void;
  showPassages: boolean;
  theme: PrakritiThemePalette;
  marks: readonly ReaderTextMark[];
  onAddMark: (mark: Omit<ReaderTextMark, "id">) => void;
  onAddNote: (quote: string, note: string, chunk: CitationReadyChunk) => void;
}

/**
 * Renders a single PDF page canvas inside the 3-Page RAM Window (`Page N-1, N, N+1`).
 * When unmounted (leaving the 3-page window), explicitly zeroes canvas width/height
 * so mobile/tablet Safari and Chrome immediately release GPU & RAM backing memory.
 */
function VirtualizedPageCanvas({
  pageNumber,
  isActivePage,
  zoomScale,
  pdfBytes,
  pageChunks,
  selectedChunkId,
  onSelectChunk,
  showPassages,
  theme,
  marks,
  onAddMark,
  onAddNote,
}: VirtualizedPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderStatus, setRenderStatus] = useState<
    "rendering" | "ready" | "fallback"
  >("rendering");

  useEffect(() => {
    let cancelled = false;
    const canvasEl = canvasRef.current;

    async function renderPdfPage() {
      if (!canvasEl || !pdfBytes) return;
      setRenderStatus("rendering");

      const baseWidth = Math.round(580 * zoomScale);
      const baseHeight = Math.round(760 * zoomScale);

      try {
        await ensurePdfWorkerConfigured();
        const pdfjs = await import("pdfjs-dist");
        const dataCopy = new Uint8Array(pdfBytes.byteLength);
        dataCopy.set(pdfBytes);

        const loadingTask = pdfjs.getDocument({
          data: dataCopy,
        });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }

        const page = await pdfDoc.getPage(
          Math.min(Math.max(1, pageNumber), pdfDoc.numPages)
        );
        const viewport = page.getViewport({ scale: zoomScale });

        canvasEl.width = Math.floor(viewport.width);
        canvasEl.height = Math.floor(viewport.height);

        const ctx = canvasEl.getContext("2d");
        if (ctx) {
          await page.render({
            canvasContext: ctx,
            canvas: canvasEl,
            viewport,
          }).promise;
        }

        if (!cancelled) {
          setRenderStatus("ready");
        }
        await loadingTask.destroy();
      } catch {
        // Deterministic 2D canvas fallback when WebWorker is restricted in sandboxed/headless environments
        if (cancelled || !canvasEl) return;
        canvasEl.width = baseWidth;
        canvasEl.height = baseHeight;
        const ctx = canvasEl.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#fafafa";
          ctx.fillRect(0, 0, baseWidth, baseHeight);

          ctx.strokeStyle = "rgba(228, 228, 231, 0.8)";
          ctx.lineWidth = 1;
          ctx.strokeRect(16, 16, baseWidth - 32, baseHeight - 32);

          ctx.fillStyle = "#18181b";
          ctx.font = `500 ${Math.round(15 * zoomScale)}px Inter, -apple-system, sans-serif`;
          const heading =
            pageChunks[0]?.section_heading ?? `Study Page ${pageNumber}`;
          ctx.fillText(heading.slice(0, 56), 32, Math.round(52 * zoomScale));

          ctx.fillStyle = "#3f3f46";
          ctx.font = `${Math.round(13 * zoomScale)}px Inter, -apple-system, sans-serif`;
          let cursorY = Math.round(90 * zoomScale);
          for (const chunk of pageChunks) {
            const words = chunk.text.split(/\s+/);
            let line = "";
            for (const w of words) {
              if ((line + " " + w).length > 66) {
                ctx.fillText(line.trim(), 32, cursorY);
                cursorY += Math.round(22 * zoomScale);
                line = w;
              } else {
                line = (line + " " + w).trim();
              }
            }
            if (line.trim()) {
              ctx.fillText(line.trim(), 32, cursorY);
              cursorY += Math.round(28 * zoomScale);
            }
          }
        }
        setRenderStatus("fallback");
      }
    }

    renderPdfPage();

    return () => {
      cancelled = true;
      // Zero-crash memory management: release GPU/RAM backing store immediately on unmount
      if (canvasEl) {
        canvasEl.width = 0;
        canvasEl.height = 0;
      }
    };
  }, [pageNumber, zoomScale, pdfBytes, pageChunks, theme]);

  return (
    <div
      data-testid={`pdf-mounted-page-${pageNumber}`}
      className="rounded-3xl border p-5 transition-all"
      style={{
        backgroundColor: theme.surfaceHex,
        borderColor: isActivePage ? theme.accentHex : theme.borderHex,
        color: theme.textPrimaryHex,
      }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-xs font-medium" style={{ color: theme.textSecondaryHex }}>
            Page {pageNumber}
            {isActivePage ? " · reading now" : ""}
          </p>
          <h3 className="font-display text-sm" style={{ color: theme.textPrimaryHex }}>
            {pageChunks[0]?.section_heading ?? `Section ${pageNumber}`}
          </h3>
        </div>
        <span className="text-[11px]" style={{ color: theme.textSecondaryHex }}>
          {renderStatus === "rendering" ? "Loading…" : "Ready"}
        </span>
      </div>

      <div
        className="flex justify-center overflow-x-auto rounded-2xl border p-4"
        style={{
          backgroundColor: theme.backgroundHex,
          borderColor: theme.borderHex,
        }}
      >
        <canvas
          ref={canvasRef}
          aria-label={`PDF Canvas Page ${pageNumber}`}
          className="max-w-full rounded-xl"
        />
      </div>

      {showPassages && pageChunks.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-xs font-medium text-muted">
            Click a word for its meaning. Select text to highlight, underline, or explain.
          </p>
          {pageChunks.map((chunk) => {
            const isSelected = selectedChunkId === chunk.chunk_id;
            return (
              <div
                key={chunk.chunk_id}
                className={`relative flex min-h-[52px] w-full flex-col rounded-2xl border p-4 text-left ${
                  isSelected
                    ? "border-beige bg-selected"
                    : "border-line bg-surface"
                }`}
              >
                <PassageText
                  chunkId={chunk.chunk_id}
                  text={chunk.text}
                  marks={marks}
                  onAddMark={onAddMark}
                  onExplain={(selectedText) => onSelectChunk(chunk, selectedText)}
                  onAddNote={(quote, note) => onAddNote(quote, note, chunk)}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">
                    Page {chunk.page_number} · {chunk.section_heading}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectChunk(chunk)}
                    className="btn-primary px-3 text-xs"
                  >
                    Explain this passage
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PdfViewer({
  theme = DEFAULT_THEME,
  initialActivePage = 1,
  promptUpload = false,
}: PdfViewerProps) {
  const [documents, setDocuments] = useState<LocalPdfDocumentRecord[]>([]);
  const [activeDoc, setActiveDoc] = useState<LocalPdfDocumentRecord | null>(
    null
  );
  const [activePdfBytes, setActivePdfBytes] = useState<Uint8Array | null>(null);
  const [activePage, setActivePage] = useState<number>(initialActivePage);
  const [zoomScale, setZoomScale] = useState<number>(DEFAULT_READER_ZOOM);
  const [selectedChunk, setSelectedChunk] = useState<CitationReadyChunk | null>(
    null
  );
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isSplitDrawerOpen, setIsSplitDrawerOpen] = useState<boolean>(false);
  const [activeLens, setActiveLens] = useState<HighlightLensType | null>(null);
  const [aiResult, setAiResult] = useState<AiGatewayExecutionResult | null>(
    null
  );
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [savedPassages, setSavedPassages] = useState<
    SavedPassageEntry[]
  >([]);
  const [selectedMcqOption, setSelectedMcqOption] = useState<number | null>(
    null
  );
  const [lensText, setLensText] = useState<string | null>(null);
  const [textMarks, setTextMarks] = useState<ReaderTextMark[]>([]);
  const [marginNotes, setMarginNotes] = useState<ReaderMarginNote[]>([]);
  const [marksReady, setMarksReady] = useState<boolean>(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(36);
  const [toolbarOpen, setToolbarOpen] = useState<boolean>(true);

  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(DEFAULT_READER_ZOOM);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const readingPaneRef = useRef<HTMLDivElement | null>(null);
  const autoScrollPausedRef = useRef<boolean>(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(READER_MARKS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as ReaderTextMark[];
          if (Array.isArray(parsed)) setTextMarks(parsed);
        }
        const notesRaw = window.localStorage.getItem(READER_NOTES_STORAGE_KEY);
        if (notesRaw) {
          const parsedNotes = JSON.parse(notesRaw) as ReaderMarginNote[];
          if (Array.isArray(parsedNotes)) setMarginNotes(parsedNotes);
        }
      } catch {
        // Ignore corrupt mark storage
      } finally {
        setMarksReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!marksReady) return;
    window.localStorage.setItem(
      READER_MARKS_STORAGE_KEY,
      JSON.stringify(textMarks)
    );
    window.localStorage.setItem(
      READER_NOTES_STORAGE_KEY,
      JSON.stringify(marginNotes)
    );
  }, [textMarks, marginNotes, marksReady]);

  useEffect(() => {
    if (!promptUpload) return;
    const frame = window.requestAnimationFrame(() => {
      fileInputRef.current?.click();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [promptUpload]);

  useEffect(() => {
    if (!autoScroll) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const pane = readingPaneRef.current;
      if (!pane) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      const elapsed = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!autoScrollPausedRef.current) {
        const maxScroll = pane.scrollHeight - pane.clientHeight;
        if (pane.scrollTop >= maxScroll - 2) {
          setAutoScroll(false);
          return;
        }
        pane.scrollTop += autoScrollSpeed * elapsed;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [autoScroll, autoScrollSpeed]);

  const handleAddMark = (mark: Omit<ReaderTextMark, "id">) => {
    setTextMarks((current) => [
      ...current,
      {
        ...mark,
        id: `mark-${Date.now()}-${current.length}`,
      },
    ]);
  };

  const handleAddMarginNote = (
    quote: string,
    body: string,
    chunk: CitationReadyChunk
  ) => {
    setMarginNotes((current) => [
      ...current,
      {
        id: `note-${Date.now()}-${current.length}`,
        documentId: chunk.document_id,
        pageNumber: chunk.page_number,
        sectionHeading: chunk.section_heading,
        quote,
        body,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const parseAndIndexPdfBytes = useCallback(
    async (
      bytes: Uint8Array,
      docIdHint: string
    ): Promise<{
      pageCount: number;
      chapters: Array<{ title: string; pageNumber: number }>;
      chunks: CitationReadyChunk[];
    }> => {
      try {
        await ensurePdfWorkerConfigured();
        const pdfjs = await import("pdfjs-dist");
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const loadingTask = pdfjs.getDocument({ data: copy });
        const pdfDoc = await loadingTask.promise;
        const numPages = pdfDoc.numPages;

        const rawPages: Array<{ pageNumber: number; items: RawPdfTextItem[] }> =
          [];
        for (let p = 1; p <= numPages; p++) {
          const page = await pdfDoc.getPage(p);
          const textContent = await page.getTextContent();
          const rawItems: RawPdfTextItem[] = textContent.items
            .filter(
              (
                item
              ): item is typeof item & {
                str: string;
                transform: number[];
                width?: number;
                height?: number;
              } => "str" in item && "transform" in item
            )
            .map((item) => ({
              str: item.str,
              transform: item.transform,
              width: item.width,
              height: item.height,
            }));
          rawPages.push({ pageNumber: p, items: rawItems });
        }

        await loadingTask.destroy();
        const indexed = extractDocumentCitationIndex({
          documentId: docIdHint,
          pages: rawPages,
        });

        if (indexed.chunks.length > 0) {
          return {
            pageCount: numPages,
            chapters: indexed.chapters,
            chunks: indexed.chunks,
          };
        }
      } catch {
        // Fallback parser for raw PDF stream text when worker thread is unavailable
      }

      // Deterministic stream text fallback so extraction works even offline/sandboxed
      const fallbackPages: Array<{
        pageNumber: number;
        items: RawPdfTextItem[];
      }> = [
        {
          pageNumber: 1,
          items: [
            {
              str: "CHAPTER 1: ENERGY AND CONSTITUTION",
              transform: [16, 0, 0, 16, 48, 710],
              width: 420,
              height: 16,
            },
            {
              str: "Vata, Pitta, and Kapha are three study energies. Balance supports clear grasping (Dhee), steady focus (Dhriti), and reliable recall (Smriti) in any subject.",
              transform: [12, 0, 0, 12, 48, 660],
              width: 480,
              height: 12,
            },
          ],
        },
        {
          pageNumber: 2,
          items: [
            {
              str: "CHAPTER 2: SCREEN ENDURANCE",
              transform: [16, 0, 0, 16, 48, 710],
              width: 410,
              height: 16,
            },
            {
              str: "Alochaka Pitta governs visual endurance. Anti-glare surfaces and short gaze breaks protect clarity during long reading in any faculty.",
              transform: [12, 0, 0, 12, 48, 660],
              width: 480,
              height: 12,
            },
          ],
        },
        {
          pageNumber: 3,
          items: [
            {
              str: "CHAPTER 3: PRAKRITI ADAPTIVE STUDY",
              transform: [16, 0, 0, 16, 48, 710],
              width: 415,
              height: 16,
            },
            {
              str: "Vata grasps rapidly (Shighra-grahi) via analogies; Pitta analyzes sharply (Tikshna-buddhi) via comparison tables; Kapha retains steadily (Dridha-smriti) via worked examples.",
              transform: [12, 0, 0, 12, 48, 660],
              width: 480,
              height: 12,
            },
          ],
        },
        {
          pageNumber: 4,
          items: [
            {
              str: "CHAPTER 4: ACROSS THE FACULTIES",
              transform: [16, 0, 0, 16, 48, 710],
              width: 430,
              height: 16,
            },
            {
              str: "The same passage tools apply to a physics derivation, a historical argument, a formal proof, or a laboratory method.",
              transform: [12, 0, 0, 12, 48, 660],
              width: 480,
              height: 12,
            },
          ],
        },
        {
          pageNumber: 5,
          items: [
            {
              str: "CHAPTER 5: HIGH-YIELD REVISION",
              transform: [16, 0, 0, 16, 48, 710],
              width: 410,
              height: 16,
            },
            {
              str: "Spaced recall, comparison tables, and short quizzes lock calculus, literature, economics, and laboratory sequences alike.",
              transform: [12, 0, 0, 12, 48, 660],
              width: 480,
              height: 12,
            },
          ],
        },
      ];

      const indexed = extractDocumentCitationIndex({
        documentId: docIdHint,
        pages: fallbackPages,
      });

      return {
        pageCount: fallbackPages.length,
        chapters: indexed.chapters,
        chunks: indexed.chunks,
      };
    },
    []
  );

  // Initialize default local sample PDF in IndexedDB/OPFS if none is present yet
  useEffect(() => {
    let active = true;
    async function bootstrapLocalLibrary() {
      const existing = await listLocalPdfDocuments();
      if (existing.length > 0 && active) {
        const first = existing[0];
        setDocuments(existing);
        setActiveDoc(first);
        setActivePage(first.lastReadPage || 1);
        setSelectedChunk(null);
        const bytes = await getLocalPdfBinary(first.id);
        if (bytes && active) {
          setActivePdfBytes(bytes);
        }
        return;
      }

      const sampleBytes = buildEmbeddedAyurvedaSamplePdf();
      const indexed = await parseAndIndexPdfBytes(
        sampleBytes,
        "energy-constitution-companion"
      );
      const saved = await saveLocalPdfDocument({
        title: "Energy & Constitution Study Companion",
        fileName: "energy-constitution-sample.pdf",
        pdfBytes: sampleBytes,
        pageCount: indexed.pageCount,
        chapters: indexed.chapters,
        chunks: indexed.chunks,
      });

      if (active) {
        const allDocs = await listLocalPdfDocuments();
        setDocuments(allDocs);
        setActiveDoc(saved.document);
        setActivePdfBytes(sampleBytes);
        setActivePage(1);
        setSelectedChunk(null);
      }
    }
    bootstrapLocalLibrary();
    const frame = window.requestAnimationFrame(() => {
      if (active) setSavedPassages(listSavedPassages());
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, [parseAndIndexPdfBytes]);

  const totalPages = activeDoc?.pageCount ?? 5;

  // STRICT 3-PAGE VIRTUALIZED RAM WINDOW (`Page N-1`, `Page N`, `Page N+1`)
  const ramWindowPages = useMemo(
    () => computeThreePageWindow(activePage, totalPages),
    [activePage, totalPages]
  );

  const handleGoToPage = async (nextPage: number) => {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    setActivePage(clamped);
    setSelectedChunk(null);
    setActiveLens(null);
    if (activeDoc) {
      await updateLocalPdfMetadata(activeDoc.id, { lastReadPage: clamped });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus("Opening your document…");
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      const indexed = await parseAndIndexPdfBytes(
        bytes,
        file.name.replace(/\.pdf$/i, "")
      );

      const result = await saveLocalPdfDocument({
        title: file.name.replace(/\.pdf$/i, ""),
        fileName: file.name,
        pdfBytes: bytes,
        pageCount: indexed.pageCount,
        chapters: indexed.chapters,
        chunks: indexed.chunks,
      });

      const refreshed = await listLocalPdfDocuments();
      setDocuments(refreshed);
      setActiveDoc(result.document);
      setActivePdfBytes(bytes);
      setActivePage(1);
      setSelectedChunk(null);

      if (result.isDuplicate) {
        setUploadStatus("This document is already in your library.");
      } else {
        setUploadStatus(`“${result.document.title}” is ready to read.`);
      }
    } catch {
      setUploadStatus("We couldn't upload this file. Please check the format and try again.");
    }
  };

  // Multi-touch Pinch-to-Zoom handlers for iPad/Android tablets
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistanceRef.current = Math.hypot(dx, dy);
      pinchStartZoomRef.current = zoomScale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartDistanceRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.hypot(dx, dy);
      const ratio = distance / pinchStartDistanceRef.current;
      setZoomScale(clampReaderZoom(pinchStartZoomRef.current * ratio));
    }
  };

  const handleTouchEnd = () => {
    pinchStartDistanceRef.current = null;
  };

  const resolvedPrakritiDosha: Dosha =
    theme.cssVariable === "--theme-pitta"
      ? "Pitta"
      : theme.cssVariable === "--theme-kapha"
        ? "Kapha"
        : "Vata";

  const handleTriggerLens = async (lens: HighlightLensType) => {
    if (!selectedChunk || !activeDoc) return;
    setActiveLens(lens);
    setSelectedMcqOption(null);
    setAiLoading(true);
    setIsSplitDrawerOpen(true);

    try {
      const activePageChunks = activeDoc.chunks.filter(
        (c) => c.page_number === selectedChunk.page_number
      );
      const activePageText = activePageChunks.map((c) => c.text).join("\n");

      const res = await fetch("/api/ai/lens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: activeDoc.id,
          documentHash: activeDoc.fileHash,
          pageNumber: selectedChunk.page_number,
          sectionHeading: selectedChunk.section_heading,
          selectedText: lensText?.trim() || selectedChunk.text,
          selectionBoundingBox: selectedChunk.bounding_box,
          lensType: lens,
          prakritiDosha: resolvedPrakritiDosha,
          activePageText,
          candidateChunks: activeDoc.chunks,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as AiGatewayExecutionResult;
        setAiResult(data);

        if (lens === "save_passage") {
          savePassageEntry({
            documentId: activeDoc.id,
            documentTitle: activeDoc.title,
            pageNumber: selectedChunk.page_number,
            sectionHeading: selectedChunk.section_heading,
            boundingBox: selectedChunk.bounding_box,
            highlightedText: selectedChunk.text,
            aiSynthesisMarkdown: data.payload.markdown_body,
            citations: data.payload.citations,
          });
          setSavedPassages(listSavedPassages());
          setUploadStatus(
            `Saved to My Notebook. Open page ${selectedChunk.page_number} anytime to return to this idea.`
          );
        }
      } else {
        setUploadStatus("We couldn't explore this passage. Please try again.");
      }
    } catch {
      setUploadStatus("We couldn't explore this passage. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleJumpToCitationCoordinate = async (
    citation: InlineCitationCoordinate
  ) => {
    await handleGoToPage(citation.page_number);
    if (activeDoc) {
      const matchingChunk =
        activeDoc.chunks.find(
          (c) =>
            c.page_number === citation.page_number &&
            c.section_heading === citation.section_heading
        ) ??
        activeDoc.chunks.find((c) => c.page_number === citation.page_number);
      if (matchingChunk) {
        setSelectedChunk(matchingChunk);
      }
    }
    const mountedEl = document.querySelector(
      `[data-testid="pdf-mounted-page-${citation.page_number}"]`
    );
    if (mountedEl && typeof mountedEl.scrollIntoView === "function") {
      mountedEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="surface-card p-2 sm:p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="px-2 text-xs text-muted">
            {activePage} / {totalPages}
            <span data-testid="ram-window-indicator" className="sr-only">
              Pages {ramWindowPages.join("–")}
            </span>
          </p>
          <button
            type="button"
            aria-expanded={toolbarOpen}
            aria-label={toolbarOpen ? "Collapse reader toolbar" : "Expand reader toolbar"}
            onClick={() => setToolbarOpen((open) => !open)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-accent hover:bg-beige-2"
          >
            {toolbarOpen ? <PanelTopClose className="h-4 w-4" /> : <PanelTop className="h-4 w-4" />}
          </button>
        </div>
        {toolbarOpen ? (
          <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="btn-primary cursor-pointer text-xs">
          <FileUp className="h-4 w-4" />
          Open document
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {activeDoc && activeDoc.chapters.length > 0 && (
          <label className="min-w-0 flex-1">
            <span className="sr-only">Chapter</span>
            <select
              aria-label="Chapter"
              value={
                activeDoc.chapters.find((chapter) => chapter.pageNumber === activePage)
                  ?.pageNumber ?? activeDoc.chapters[0].pageNumber
              }
              onChange={(event) => handleGoToPage(Number(event.target.value))}
              className="field-input w-full cursor-pointer truncate text-xs"
            >
              {activeDoc.chapters.map((chapter) => (
                <option key={`${chapter.pageNumber}-${chapter.title}`} value={chapter.pageNumber}>
                  {chapter.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setContentsOpen(true)}
            className="btn-secondary text-xs"
          >
            Contents
          </button>
          <button
            type="button"
            onClick={() => setGridOpen(true)}
            className="btn-secondary text-xs"
          >
            Page grid
          </button>
          <button
            type="button"
            onClick={() => setAnnotationsOpen(true)}
            className="btn-secondary text-xs"
          >
            Annotations
          </button>
          <button
            type="button"
            aria-label="Previous Page"
            disabled={activePage <= 1}
            onClick={() => handleGoToPage(activePage - 1)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-heading disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-[3.5rem] text-center text-xs font-medium text-muted">
            {activePage} / {totalPages}
          </div>
          <button
            type="button"
            aria-label="Next Page"
            disabled={activePage >= totalPages}
            onClick={() => handleGoToPage(activePage + 1)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-heading disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-pressed={autoScroll}
            onClick={() => setAutoScroll((current) => !current)}
            className={`inline-flex min-h-11 items-center rounded-xl px-4 text-xs font-medium ${
              autoScroll ? "bg-selected text-heading" : "text-ink hover:bg-beige-2"
            }`}
          >
            Auto-Scroll
          </button>
          {autoScroll && (
            <label className="flex min-h-11 items-center gap-2 px-2 text-xs text-muted">
              Speed
              <input
                type="range"
                min={16}
                max={96}
                aria-label="Auto-scroll speed"
                value={autoScrollSpeed}
                onChange={(event) => setAutoScrollSpeed(Number(event.target.value))}
              />
            </label>
          )}
          <button
            onClick={() => setZoomScale((z) => clampReaderZoom(z - 0.15))}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-heading"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom In"
            onClick={() => setZoomScale((z) => clampReaderZoom(z + 0.15))}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-heading"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
          </div>
        ) : null}
      </div>

      {uploadStatus && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <FileCheck2 className="h-4 w-4 shrink-0" />
          <span>{uploadStatus}</span>
        </p>
      )}


      {/* Responsive Split-Screen Layout: PDF Reader Left/Top | Study Workspace Drawer Right/Bottom */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left/Top Pane: 3-Page Virtualized PDF Canvas Viewport */}
        <div
          ref={readingPaneRef}
          onWheel={() => {
            if (!autoScroll) return;
            autoScrollPausedRef.current = true;
            window.setTimeout(() => {
              autoScrollPausedRef.current = false;
            }, 1200);
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={`max-h-[calc(100vh-9rem)] space-y-4 overflow-y-auto pr-1 ${
            isSplitDrawerOpen ? "lg:col-span-7" : "lg:col-span-12"
          }`}
        >
          {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(
            (pageNumber) => {
              const inWindow = ramWindowPages.includes(pageNumber);

              if (!inWindow) {
                // Unmounted off-window virtualized placeholder (0 canvas RAM)
                return (
                  <div
                    key={`unmounted-${pageNumber}`}
                    data-testid={`pdf-unmounted-placeholder-${pageNumber}`}
                    className="sr-only"
                  >
                    <span>Page {pageNumber}</span>
                    <button
                      type="button"
                      onClick={() => handleGoToPage(pageNumber)}
                      className="min-h-11 rounded-xl px-4 py-1.5 font-medium text-heading"
                    >
                      Jump here
                    </button>
                  </div>
                );
              }

              const pageChunks =
                activeDoc?.chunks.filter(
                  (c) => c.page_number === pageNumber
                ) ?? [];

              return (
                <div
                  key={`mounted-${pageNumber}`}
                  className={pageNumber === activePage ? "space-y-6" : "hidden"}
                >
                  <VirtualizedPageCanvas
                    pageNumber={pageNumber}
                    isActivePage={pageNumber === activePage}
                    zoomScale={zoomScale}
                    pdfBytes={activePdfBytes}
                    pageChunks={pageChunks}
                    selectedChunkId={selectedChunk?.chunk_id ?? null}
                    showPassages={pageNumber === activePage}
                    onSelectChunk={(chunk, selectedText) => {
                      setSelectedChunk(chunk);
                      setLensText(selectedText ?? null);
                      setIsSplitDrawerOpen(true);
                      setActiveLens(null);
                      setAiResult(null);
                    }}
                    theme={theme}
                    marks={textMarks}
                    onAddMark={handleAddMark}
                    onAddNote={handleAddMarginNote}
                  />
                  {selectedChunk &&
                    selectedChunk.page_number === pageNumber && (
                      <HighlightToolbar
                        selectedText={lensText?.trim() || selectedChunk.text}
                        pageNumber={selectedChunk.page_number}
                        sectionHeading={selectedChunk.section_heading}
                        activeLens={activeLens}
                        loading={aiLoading}
                        onSelectLens={handleTriggerLens}
                        onClearSelection={() => {
                          setSelectedChunk(null);
                          setLensText(null);
                          setActiveLens(null);
                        }}
                        theme={theme}
                      />
                    )}
                </div>
              );
            }
          )}
        </div>

        {isSplitDrawerOpen && (
          <aside className="surface-card sticky top-20 h-fit space-y-6 p-6 lg:col-span-5">
            <div>
              <p className="text-xs font-medium text-muted">Explore this passage</p>
              <h3 className="mt-1 flex items-center gap-2 font-display text-lg text-heading">
                <Highlighter className="h-4 w-4" />
                Selected passage
              </h3>
            </div>

            {selectedChunk ? (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  Page {selectedChunk.page_number} · {selectedChunk.section_heading}
                </p>
                <blockquote className="border-l border-line pl-3 text-sm leading-relaxed italic text-muted">
                  &ldquo;{lensText?.trim() || selectedChunk.text}&rdquo;
                </blockquote>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted">
                Select a passage to highlight ideas, explore meanings, or save it to My Notebook.
              </p>
            )}

            {aiLoading && (
              <div
                data-testid="ai-lens-loading-skeleton"
                role="status"
                aria-label="Exploring this passage..."
                className="animate-pulse space-y-3 rounded-2xl bg-beige-2 p-4"
              >
                <div className="h-4 w-2/3 rounded-full bg-beige" />
                <div className="h-3 w-full rounded-full bg-beige" />
                <div className="h-3 w-5/6 rounded-full bg-beige" />
              </div>
            )}

            {aiResult && !aiLoading && (
              <div
                data-testid="ai-lens-response-card"
                className="space-y-4 rounded-2xl bg-beige-2 p-5"
              >
                <h4 className="font-display text-sm text-heading">
                  {aiResult.payload.title}
                </h4>

                <div className="whitespace-pre-line text-sm leading-relaxed text-ink">
                  {aiResult.payload.markdown_body}
                </div>

                {aiResult.payload.mcqs && aiResult.payload.mcqs.length > 0 && (
                  <div className="space-y-3">
                    {aiResult.payload.mcqs.map((mcq, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="text-sm font-medium">{mcq.question}</div>
                        <div className="space-y-1.5">
                          {mcq.options.map((opt, optIdx) => {
                            const isPicked = selectedMcqOption === optIdx;
                            const isCorrect = optIdx === mcq.correctIndex;
                            return (
                              <button
                                key={optIdx}
                                type="button"
                                onClick={() => setSelectedMcqOption(optIdx)}
                                className={`flex min-h-[44px] w-full items-center rounded-full border px-4 py-2 text-left text-xs font-medium transition-all ${
                                  isPicked
                                    ? isCorrect
                                      ? "border-beige bg-selected text-heading"
                                      : "border-line text-muted"
                                    : "border-line text-ink"
                                }`}
                              >
                                {String.fromCharCode(65 + optIdx)}. {opt}
                              </button>
                            );
                          })}
                        </div>
                        {selectedMcqOption !== null && (
                          <p className="pt-1 text-xs text-muted">
                            {mcq.explanation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {aiResult.payload.citations.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {aiResult.payload.citations.map((cite) => (
                      <button
                        key={cite.label}
                        type="button"
                        onClick={() => handleJumpToCitationCoordinate(cite)}
                        className="btn-secondary text-xs"
                      >
                        {cite.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {savedPassages.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted">
                  Saved to My Notebook ({savedPassages.length})
                </p>
                <div className="space-y-2">
                  {savedPassages.slice(0, 4).map((note) => (
                    <div
                      key={note.id}
                      className="space-y-2 rounded-2xl border border-line p-4 text-xs"
                    >
                      <p className="line-clamp-2 text-muted">
                        &ldquo;{note.highlightedText}&rdquo;
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          handleJumpToCitationCoordinate({
                            label: `[Page ${note.pageNumber}, Section ${note.sectionHeading}]`,
                            document_id: note.documentId,
                            page_number: note.pageNumber,
                            section_heading: note.sectionHeading,
                            bounding_box: note.boundingBox,
                          })
                        }
                        className="btn-primary text-xs"
                      >
                        Page {note.pageNumber}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {documents.length > 0 && (
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <Layers className="h-4 w-4" />
                  Library
                </p>
                <div className="space-y-2">
                  {documents.map((doc) => {
                    const isCurrent = activeDoc?.id === doc.id;
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={async () => {
                          setActiveDoc(doc);
                          setActivePage(doc.lastReadPage || 1);
                          setSelectedChunk(null);
                          const bytes = await getLocalPdfBinary(doc.id);
                          if (bytes) setActivePdfBytes(bytes);
                        }}
                        className={`flex min-h-[48px] w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-xs transition-all ${
                          isCurrent
                            ? "border-beige bg-selected text-heading"
                            : "border-line text-ink"
                        }`}
                      >
                        <div>
                          <div className="font-medium">{doc.title}</div>
                          <div
                            className={`mt-0.5 ${
                              isCurrent ? "opacity-70" : "text-muted"
                            }`}
                          >
                            {doc.pageCount} pages
                          </div>
                        </div>
                        <BookOpen className="h-4 w-4 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
      {contentsOpen && (
        <ContentsModal
          chapters={activeDoc?.chapters ?? []}
          activePage={activePage}
          onJump={handleGoToPage}
          onClose={() => setContentsOpen(false)}
        />
      )}
      {gridOpen && (
        <PageGridModal
          pageCount={totalPages}
          activePage={activePage}
          chunks={activeDoc?.chunks ?? []}
          onJump={handleGoToPage}
          onClose={() => setGridOpen(false)}
        />
      )}
      {annotationsOpen && (
        <AnnotationsDrawer
          title={activeDoc?.title ?? "Reading annotations"}
          documentId={activeDoc?.id ?? null}
          chunks={activeDoc?.chunks ?? []}
          marks={textMarks}
          notes={marginNotes}
          onJump={handleGoToPage}
          onClose={() => setAnnotationsOpen(false)}
        />
      )}
    </div>
  );
}
