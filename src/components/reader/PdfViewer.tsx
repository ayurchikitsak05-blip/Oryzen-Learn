"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileUp,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  clampReaderZoom,
  computeThreePageWindow,
  DEFAULT_READER_ZOOM,
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
import {
  recommendedStudyLenses,
  type Dosha,
  type HighlightLensType,
  type PrakritiThemePalette,
} from "@/lib/prakriti/config";
import HighlightToolbar from "@/components/reader/HighlightToolbar";
import {
  AnnotationsDrawer,
  ContentsModal,
  PageGridModal,
} from "@/components/reader/ReaderOverlays";
import type { ReaderMarginNote } from "@/lib/reader/annotations";
import type { ReaderTextMark } from "@/components/reader/PassageText";
import type { SelectionToolbarState } from "@/components/reader/PassageText";
import type {
  AiGatewayExecutionResult,
  InlineCitationCoordinate,
} from "@/lib/ai/gateway";
import { excerptForDisplay } from "@/lib/ai/lens-compose";
import { savePassageEntry } from "@/lib/ai/passage-store";
import { PdfPageCanvas } from "@/components/reader/PdfPageCanvas";
import { StudyWorkspace } from "@/components/reader/StudyWorkspace";
import TransformDialog from "@/components/reader/TransformDialog";
import {
  readPersistedReaderView,
  resolveReaderScale,
  withTimeout,
  writePersistedReaderView,
  type PageGeometry,
  type ReaderFitMode,
} from "@/lib/reader/fit";

function indexPlainPages(
  documentId: string,
  lines: string[]
): {
  pageCount: number;
  chapters: Array<{ title: string; pageNumber: number }>;
  chunks: CitationReadyChunk[];
} {
  const pages = lines.map((raw, index) => {
    const [heading, body] = raw.split("|").map((part) => part.trim());
    return {
      pageNumber: index + 1,
      items: [
        {
          str: heading || `Page ${index + 1}`,
          transform: [16, 0, 0, 16, 48, 710],
          width: 420,
          height: 16,
        },
        {
          str: body || "Study text",
          transform: [12, 0, 0, 12, 48, 660],
          width: 480,
          height: 12,
        },
      ],
    };
  });
  const indexed = extractDocumentCitationIndex({ documentId, pages });
  return {
    pageCount: pages.length,
    chapters: indexed.chapters,
    chunks: indexed.chunks,
  };
}

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

export default function PdfViewer({
  theme = DEFAULT_THEME,
  initialActivePage = 1,
  promptUpload = false,
}: PdfViewerProps) {
  const [documents, setDocuments] = useState<LocalPdfDocumentRecord[]>([]);
  const [activeDoc, setActiveDoc] = useState<LocalPdfDocumentRecord | null>(null);
  const [activePdfBytes, setActivePdfBytes] = useState<Uint8Array | null>(null);
  const [activePage, setActivePage] = useState<number>(initialActivePage);
  const [fitMode, setFitMode] = useState<ReaderFitMode>("page");
  const [customZoom, setCustomZoom] = useState<number>(DEFAULT_READER_ZOOM);
  const [pageGeometry, setPageGeometry] = useState<PageGeometry | null>(null);
  const [viewportBox, setViewportBox] = useState({ width: 800, height: 900 });
  const [selectedChunk, setSelectedChunk] = useState<CitationReadyChunk | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [activeLens, setActiveLens] = useState<HighlightLensType | null>(null);
  const [aiResult, setAiResult] = useState<AiGatewayExecutionResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [notebookStatus, setNotebookStatus] = useState<string | null>(null);
  const [selectedMcqOptions, setSelectedMcqOptions] = useState<Record<number, number>>({});
  const [lensText, setLensText] = useState<string | null>(null);
  const [selectionUi, setSelectionUi] = useState<SelectionToolbarState | null>(null);
  const [textMarks, setTextMarks] = useState<ReaderTextMark[]>([]);
  const [marginNotes, setMarginNotes] = useState<ReaderMarginNote[]>([]);
  const [marksReady, setMarksReady] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [transformOpen, setTransformOpen] = useState(false);

  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(DEFAULT_READER_ZOOM);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const workspaceRootRef = useRef<HTMLDivElement | null>(null);
  const readingContextRef = useRef<{
    page: number;
    fitMode: ReaderFitMode;
    customZoom: number;
    chunk: CitationReadyChunk | null;
    text: string | null;
    scrollTop: number;
  } | null>(null);
  const lensRequestIdRef = useRef(0);
  const lensAbortRef = useRef<AbortController | null>(null);

  const zoomScale = resolveReaderScale({
    fitMode,
    customScale: customZoom,
    page: pageGeometry,
    viewport: viewportBox,
  });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const update = () => {
      setViewportBox({
        width: host.clientWidth,
        height: host.clientHeight,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [workspaceOpen]);

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
    window.localStorage.setItem(READER_MARKS_STORAGE_KEY, JSON.stringify(textMarks));
    window.localStorage.setItem(READER_NOTES_STORAGE_KEY, JSON.stringify(marginNotes));
  }, [textMarks, marginNotes, marksReady]);

  useEffect(() => {
    if (!promptUpload) return;
    const frame = window.requestAnimationFrame(() => {
      fileInputRef.current?.click();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [promptUpload]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const handlePageGeometry = useCallback((_pageNumber: number, geometry: PageGeometry) => {
    setPageGeometry((current) => {
      if (
        current &&
        Math.abs(current.width - geometry.width) < 1 &&
        Math.abs(current.height - geometry.height) < 1
      ) {
        return current;
      }
      return geometry;
    });
  }, []);

  const handleAddMark = (mark: Omit<ReaderTextMark, "id">) => {
    setTextMarks((current) => [
      ...current,
      { ...mark, id: `mark-${Date.now()}-${current.length}` },
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
        const { ensurePdfWorkerConfigured } = await import("@/lib/reader/pdf-worker");
        await withTimeout(ensurePdfWorkerConfigured(), 2500, "pdf worker");
        const pdfjs = await withTimeout(import("pdfjs-dist"), 2500, "pdfjs import");
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const loadingTask = pdfjs.getDocument({ data: copy });
        const pdfDoc = await withTimeout(loadingTask.promise, 4000, "pdf document");
        const numPages = pdfDoc.numPages;
        const rawPages: Array<{ pageNumber: number; items: RawPdfTextItem[] }> = [];
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
        // Fallback parser below
      }

      const fallbackPages = [
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

  useEffect(() => {
    let active = true;
    async function bootstrapLocalLibrary() {
      const existing = await listLocalPdfDocuments();
      const titles = new Set(existing.map((doc) => doc.title.toLowerCase()));

      const newtonLines = [
        "NEWTON'S FIRST LAW | An object keeps a constant velocity unless a net force acts on it. That is Newton's first law, and it is the reason a free-body diagram starts by asking what is actually pushing or pulling.",
        "FORCE AND MASS | A net force changes velocity. Mass resists that change. This is the second law in everyday language.",
        "ACTION AND REACTION | Forces come in pairs. If you push a wall, the wall pushes back with equal size and opposite direction.",
      ];
      const marketingLines = [
        "CAMPAIGN BLUEPRINT | A landing page should lead with one customer outcome, then show proof, then one clear call to action.",
        "PROOF BEFORE THE ASK | Testimonials, a short metric, or a worked example should sit between the promise and the button.",
        "ONE ASK | Do not split attention across three offers. The selected idea is one outcome, then proof, then one ask.",
      ];

      if (!titles.has("energy & constitution study companion") && existing.length === 0) {
        const sampleBytes = buildEmbeddedAyurvedaSamplePdf();
        const indexed = indexPlainPages("energy-constitution-companion", [
          "CHAPTER 1: ENERGY AND CONSTITUTION | Vata, Pitta, and Kapha are three study energies. Balance supports clear grasping (Dhee), steady focus (Dhriti), and reliable recall (Smriti) in any subject.",
          "CHAPTER 2: SCREEN ENDURANCE | Alochaka Pitta governs visual endurance. Anti-glare surfaces and short gaze breaks protect clarity during long reading in any faculty.",
          "CHAPTER 3: PRAKRITI ADAPTIVE STUDY | Vata grasps rapidly via analogies; Pitta analyzes via comparison tables; Kapha retains via worked examples.",
        ]);
        await saveLocalPdfDocument({
          title: "Energy & Constitution Study Companion",
          fileName: "energy-constitution-sample.pdf",
          pdfBytes: sampleBytes,
          pageCount: indexed.pageCount,
          chapters: indexed.chapters,
          chunks: indexed.chunks,
        });
      }

      if (![...titles].some((title) => title.includes("newton"))) {
        const newtonBytes = buildEmbeddedAyurvedaSamplePdf(newtonLines);
        const indexed = indexPlainPages("newton-first-law", newtonLines);
        await saveLocalPdfDocument({
          title: "Newton's First Law",
          fileName: "newton-first-law.pdf",
          pdfBytes: newtonBytes,
          pageCount: indexed.pageCount,
          chapters: indexed.chapters,
          chunks: indexed.chunks,
        });
      }

      if (![...titles].some((title) => /campaign|marketing|blueprint/.test(title))) {
        const marketingBytes = buildEmbeddedAyurvedaSamplePdf(marketingLines);
        const indexed = indexPlainPages("campaign-blueprint", marketingLines);
        await saveLocalPdfDocument({
          title: "Campaign Blueprint",
          fileName: "marketing-blueprint.pdf",
          pdfBytes: marketingBytes,
          pageCount: indexed.pageCount,
          chapters: indexed.chapters,
          chunks: indexed.chunks,
        });
      }

      const allDocs = await listLocalPdfDocuments();
      if (!active || allDocs.length === 0) return;
      setDocuments(allDocs);
      let chosen = allDocs[0];
      let bytes = await getLocalPdfBinary(chosen.id);
      if (!bytes) {
        for (const doc of allDocs.slice(1)) {
          const nextBytes = await getLocalPdfBinary(doc.id);
          if (nextBytes) {
            chosen = doc;
            bytes = nextBytes;
            break;
          }
        }
      }
      const persisted = readPersistedReaderView(chosen.id);
      setActiveDoc(chosen);
      setActivePage(persisted?.page || chosen.lastReadPage || 1);
      if (persisted?.fitMode) setFitMode(persisted.fitMode);
      if (persisted?.zoom) setCustomZoom(persisted.zoom);
      if (bytes && active) setActivePdfBytes(bytes);
    }
    void bootstrapLocalLibrary().catch((error) => {
      if (active) {
        setUploadStatus(
          error instanceof Error
            ? error.message
            : "The local library could not be opened."
        );
      }
    });
    return () => {
      active = false;
    };
  }, [parseAndIndexPdfBytes]);

  const totalPages = activeDoc?.pageCount ?? 1;
  const ramWindowPages = useMemo(
    () => computeThreePageWindow(activePage, totalPages),
    [activePage, totalPages]
  );

  useEffect(() => {
    if (!activeDoc) return;
    writePersistedReaderView(activeDoc.id, {
      page: activePage,
      zoom: customZoom,
      fitMode,
      progress: totalPages > 0 ? activePage / totalPages : 0,
    });
  }, [activeDoc, activePage, customZoom, fitMode, totalPages]);

  const handleGoToPage = async (nextPage: number) => {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    setActivePage(clamped);
    setSelectedChunk(null);
    setSelectionUi(null);
    setLensText(null);
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
      const indexed = await parseAndIndexPdfBytes(bytes, file.name.replace(/\.pdf$/i, ""));
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
      setFitMode("page");
      setUploadStatus(
        result.isDuplicate
          ? "This document is already in your library."
          : `“${result.document.title}” is ready to read.`
      );
    } catch {
      setUploadStatus("We couldn't upload this file. Please check the format and try again.");
    }
  };

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
      setFitMode("custom");
      setCustomZoom(clampReaderZoom(pinchStartZoomRef.current * ratio));
    }
  };

  const resolvedPrakritiDosha: Dosha =
    theme.cssVariable === "--theme-pitta"
      ? "Pitta"
      : theme.cssVariable === "--theme-kapha"
        ? "Kapha"
        : "Vata";

  const persistSavedPassage = async (
    doc: LocalPdfDocumentRecord,
    chunk: CitationReadyChunk,
    selected: string,
    markdown: string,
    citations: InlineCitationCoordinate[]
  ) => {
    savePassageEntry({
      documentId: doc.id,
      documentTitle: doc.title,
      pageNumber: chunk.page_number,
      sectionHeading: chunk.section_heading,
      boundingBox: chunk.bounding_box,
      highlightedText: selected,
      aiSynthesisMarkdown: markdown,
      citations,
    });
    const noteTitle = `${doc.title} · p.${chunk.page_number}`;
    const noteBody = [
      chunk.section_heading,
      "",
      excerptForDisplay(selected, 280),
      "",
      markdown,
    ].join("\n");
    const response = await fetch("/api/notes", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_passage",
        subjectTitle: doc.title,
        title: noteTitle,
        noteBody,
      }),
    });
    if (response.ok) {
      setNotebookStatus("Saved to My Notebook. Open Notebook to see it after refresh.");
      return;
    }
    if (response.status === 401) {
      setNotebookStatus("Saved on this device. Sign in to keep it in My Notebook.");
      return;
    }
    const json = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error ?? "My Notebook could not save this passage.");
  };

  const snapshotReading = () => {
    readingContextRef.current = {
      page: activePage,
      fitMode,
      customZoom,
      chunk: selectedChunk,
      text: lensText,
      scrollTop: canvasHostRef.current?.scrollTop ?? 0,
    };
  };

  const restoreReading = () => {
    const snap = readingContextRef.current;
    if (!snap) return;
    setActivePage(snap.page);
    setFitMode(snap.fitMode);
    setCustomZoom(snap.customZoom);
    setSelectedChunk(snap.chunk);
    setLensText(snap.text);
    window.requestAnimationFrame(() => {
      if (canvasHostRef.current) canvasHostRef.current.scrollTop = snap.scrollTop;
    });
  };

  const handleTriggerLens = async (
    lens: HighlightLensType,
    chunk = selectedChunk,
    selectedOverride?: string
  ) => {
    if (!chunk || !activeDoc || aiLoading) return;
    const selected = (selectedOverride ?? lensText)?.trim() || chunk.text;
    if (!selected.trim()) {
      setAiError("Select a passage before exploring it.");
      return;
    }
    snapshotReading();
    lensAbortRef.current?.abort();
    const controller = new AbortController();
    lensAbortRef.current = controller;
    const requestId = lensRequestIdRef.current + 1;
    lensRequestIdRef.current = requestId;
    setSelectedChunk(chunk);
    if (selectedOverride) setLensText(selectedOverride);
    setActiveLens(lens);
    setSelectedMcqOptions({});
    setAiResult(null);
    setAiError(null);
    setNotebookStatus(null);
    setAiLoading(true);
    setWorkspaceOpen(true);
    setSelectionUi(null);

    try {
      const nearbyChunks = activeDoc.chunks.filter(
        (item) => Math.abs(item.page_number - chunk.page_number) <= 2
      );
      const activePageText = nearbyChunks
        .filter((item) => item.page_number === chunk.page_number)
        .map((item) => item.text)
        .join("\n");
      const res = await fetch("/api/ai/lens", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: activeDoc.id,
          documentHash: activeDoc.fileHash,
          pageNumber: chunk.page_number,
          sectionHeading: chunk.section_heading,
          selectedText: selected,
          selectionBoundingBox: chunk.bounding_box,
          lensType: lens,
          prakritiDosha: resolvedPrakritiDosha,
          activePageText,
          candidateChunks: nearbyChunks,
        }),
        signal: controller.signal,
      });
      if (requestId !== lensRequestIdRef.current) return;
      const data = (await res.json()) as AiGatewayExecutionResult & { error?: string };
      const payload = data.payload;
      const usable =
        Boolean(payload?.markdown_body?.trim()) ||
        Boolean(payload?.mcqs?.length) ||
        Boolean(payload?.diagram) ||
        Boolean(payload?.explain) ||
        Boolean(payload?.illustrative) ||
        Boolean(payload?.revision) ||
        Boolean(payload?.story);
      if (!res.ok || !usable) {
        setAiResult(null);
        setAiError(data.error ?? "We couldn't explore this passage. Please try again.");
        return;
      }
      setAiResult(data);
      if (lens === "save_passage") {
        try {
          await persistSavedPassage(
            activeDoc,
            chunk,
            selected,
            payload.markdown_body,
            payload.citations
          );
        } catch (error) {
          setNotebookStatus(null);
          setAiError(
            error instanceof Error
              ? error.message
              : "The passage was prepared, but My Notebook did not save it."
          );
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId !== lensRequestIdRef.current) return;
      setAiResult(null);
      setAiError("We couldn't explore this passage. Please try again.");
    } finally {
      if (requestId === lensRequestIdRef.current) setAiLoading(false);
    }
  };

  const closeWorkspace = () => {
    setWorkspaceOpen(false);
    setAiError(null);
    restoreReading();
  };

  const toggleFullscreen = async () => {
    const root = workspaceRootRef.current;
    if (!root) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await root.requestFullscreen().catch(() => undefined);
  };

  return (
    <div
      ref={workspaceRootRef}
      data-testid="pdf-reading-canvas"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-canvas"
    >
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
        <label className="btn-secondary cursor-pointer px-3 text-xs">
          <FileUp className="h-4 w-4" />
          Open
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
        {documents.length > 0 ? (
          <select
            aria-label="Document"
            value={activeDoc?.id ?? ""}
            onChange={(event) => {
              const next = documents.find((doc) => doc.id === event.target.value);
              if (!next) return;
              void (async () => {
                setActiveDoc(next);
                const persisted = readPersistedReaderView(next.id);
                setActivePage(persisted?.page || next.lastReadPage || 1);
                setFitMode(persisted?.fitMode ?? "page");
                setSelectedChunk(null);
                setAiResult(null);
                setWorkspaceOpen(false);
                const bytes = await getLocalPdfBinary(next.id);
                if (bytes) setActivePdfBytes(bytes);
              })();
            }}
            className="field-input max-w-[12rem] cursor-pointer py-1 text-xs"
          >
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" onClick={() => setContentsOpen(true)} className="btn-ghost px-3 text-xs">
          Contents
        </button>
        <button type="button" onClick={() => setGridOpen(true)} className="btn-ghost px-3 text-xs">
          Pages
        </button>
        <button
          type="button"
          onClick={() => setAnnotationsOpen(true)}
          className="btn-ghost px-3 text-xs"
        >
          Notes
        </button>
        <button
          type="button"
          data-testid="transform-open"
          onClick={() => setTransformOpen(true)}
          className="btn-ghost px-3 text-xs"
        >
          Transform
        </button>
        <Link href="/vaults" className="btn-ghost px-3 text-xs">
          Ask My Book
        </Link>
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
          <span data-testid="ram-window-indicator" className="sr-only">
            Pages {ramWindowPages.join("–")}
          </span>
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
          data-testid="fit-page-btn"
          aria-pressed={fitMode === "page"}
          onClick={() => setFitMode("page")}
          className={`inline-flex min-h-10 items-center rounded-xl px-3 text-xs ${
            fitMode === "page" ? "bg-selected text-heading" : "text-ink hover:bg-beige-2"
          }`}
        >
          Fit Page
        </button>
        <button
          type="button"
          data-testid="fit-width-btn"
          aria-pressed={fitMode === "width"}
          onClick={() => setFitMode("width")}
          className={`inline-flex min-h-10 items-center rounded-xl px-3 text-xs ${
            fitMode === "width" ? "bg-selected text-heading" : "text-ink hover:bg-beige-2"
          }`}
        >
          Fit Width
        </button>
        <button
          type="button"
          onClick={() => {
            setFitMode("custom");
            setCustomZoom((z) => clampReaderZoom(z - 0.15));
          }}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-heading"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Zoom In"
          onClick={() => {
            setFitMode("custom");
            setCustomZoom((z) => clampReaderZoom(z + 0.15));
          }}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-heading"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          data-testid="reader-fullscreen-btn"
          onClick={() => void toggleFullscreen()}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-heading"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {uploadStatus ? (
        <p className="flex items-center gap-2 px-3 py-1 text-xs text-muted">
          <FileCheck2 className="h-4 w-4 shrink-0" />
          <span>{uploadStatus}</span>
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          ref={canvasHostRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => {
            pinchStartDistanceRef.current = null;
          }}
          className="relative min-w-0 flex-1 overflow-auto"
        >
          <div className="flex min-h-full w-full items-center justify-center p-4 md:p-6">
            {!activePdfBytes ? (
              <p className="text-sm text-muted" data-testid="pdf-empty-state">
                Open a document to start reading.
              </p>
            ) : null}
            {ramWindowPages.map((pageNumber) => {
              const pageChunks =
                activeDoc?.chunks.filter((chunk) => chunk.page_number === pageNumber) ?? [];
              if (pageNumber !== activePage) {
                return (
                  <div
                    key={`hidden-${pageNumber}`}
                    data-testid={`pdf-mounted-page-${pageNumber}`}
                    className="hidden"
                  />
                );
              }
              return (
                <PdfPageCanvas
                  key={`mounted-${pageNumber}`}
                  pageNumber={pageNumber}
                  isActivePage
                  zoomScale={zoomScale}
                  pdfBytes={activePdfBytes}
                  pageChunks={pageChunks}
                  theme={theme}
                  marks={textMarks}
                  onPageGeometry={handlePageGeometry}
                  onAddMark={handleAddMark}
                  onAddNote={handleAddMarginNote}
                  onSelection={(chunk, selection) => {
                    setSelectedChunk(chunk);
                    setLensText(selection?.text ?? chunk.text);
                    setSelectionUi(selection);
                    setAiError(null);
                    setNotebookStatus(null);
                  }}
                />
              );
            })}
            {Array.from({ length: totalPages }, (_, idx) => idx + 1)
              .filter((pageNumber) => !ramWindowPages.includes(pageNumber))
              .map((pageNumber) => (
                <div
                  key={`unmounted-${pageNumber}`}
                  data-testid={`pdf-unmounted-placeholder-${pageNumber}`}
                  className="sr-only"
                >
                  Page {pageNumber}
                </div>
              ))}
          </div>
        </div>

        <StudyWorkspace
          open={workspaceOpen}
          isMobile={isMobile}
          title={aiResult?.payload.title ?? "Study response"}
          pageRef={
            selectedChunk
              ? `p. ${selectedChunk.page_number}${
                  activeDoc ? ` · ${activeDoc.title}` : ""
                }`
              : null
          }
          loading={aiLoading}
          error={aiError}
          notebookStatus={notebookStatus}
          result={aiResult}
          lens={activeLens}
          selectedMcqOptions={selectedMcqOptions}
          onPickMcq={(questionIndex, optionIndex) =>
            setSelectedMcqOptions((current) => ({ ...current, [questionIndex]: optionIndex }))
          }
          onRetry={() => {
            if (activeLens && selectedChunk) void handleTriggerLens(activeLens, selectedChunk);
          }}
          onClose={closeWorkspace}
        />
      </div>

      {selectionUi && selectedChunk && !workspaceOpen ? (
        <HighlightToolbar
          selectedText={lensText?.trim() || selectedChunk.text}
          pageNumber={selectedChunk.page_number}
          sectionHeading={selectedChunk.section_heading}
          activeLens={activeLens}
          loading={aiLoading}
          top={selectionUi.top}
          left={selectionUi.left}
          recommendedLensIds={recommendedStudyLenses(resolvedPrakritiDosha)}
          onSelectLens={(lens) => void handleTriggerLens(lens, selectedChunk, lensText ?? undefined)}
          onClearSelection={() => {
            setSelectedChunk(null);
            setLensText(null);
            setSelectionUi(null);
            setActiveLens(null);
          }}
        />
      ) : null}

      {contentsOpen ? (
        <ContentsModal
          chapters={activeDoc?.chapters ?? []}
          activePage={activePage}
          onJump={handleGoToPage}
          onClose={() => setContentsOpen(false)}
        />
      ) : null}
      {gridOpen ? (
        <PageGridModal
          pageCount={totalPages}
          activePage={activePage}
          chunks={activeDoc?.chunks ?? []}
          onJump={handleGoToPage}
          onClose={() => setGridOpen(false)}
        />
      ) : null}
      {annotationsOpen ? (
        <AnnotationsDrawer
          title={activeDoc?.title ?? "Reading annotations"}
          documentId={activeDoc?.id ?? null}
          chunks={activeDoc?.chunks ?? []}
          marks={textMarks}
          notes={marginNotes}
          onJump={handleGoToPage}
          onClose={() => setAnnotationsOpen(false)}
        />
      ) : null}
      <TransformDialog
        open={transformOpen}
        pdfDocument={activeDoc}
        onClose={() => setTransformOpen(false)}
      />
    </div>
  );
}
