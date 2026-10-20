"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, FileText, Sparkles, Video } from "lucide-react";
import type { Dosha, PrakritiThemePalette } from "@/lib/prakriti/config";
import { listNotebookEntries } from "@/lib/ai/notebook-store";
import { getLocalCognitiveDnaState } from "@/lib/ai/adaptive-memory";
import {
  buildAvailableNotebookSources,
  DEFAULT_VIDEO_LECTURES,
  MIN_REQUIRED_NOTEBOOKS,
  MIN_REQUIRED_VIDEO_TRANSCRIPTS,
  synthesizeMasterStudyBook,
  type MasterStudyBookCitation,
  type SynthesizedMasterStudyBook,
  type SynthesisNotebookSource,
} from "@/lib/synthesis/master-book";
import type { VideoLectureRecord } from "@/lib/video/sync-engine";

export interface SynthesisStudioProps {
  prakritiDosha: Dosha;
  theme: PrakritiThemePalette;
}

export default function SynthesisStudio({
  prakritiDosha,
}: SynthesisStudioProps) {
  const [availableNotebooks, setAvailableNotebooks] = useState<
    SynthesisNotebookSource[]
  >(() => buildAvailableNotebookSources([]));

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAvailableNotebooks(
        buildAvailableNotebookSources(listNotebookEntries())
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const [availableVideoLectures] = useState<VideoLectureRecord[]>(
    () => DEFAULT_VIDEO_LECTURES
  );

  const [selectedNotebookIds, setSelectedNotebookIds] = useState<string[]>(() =>
    availableNotebooks.slice(0, 2).map((n) => n.id)
  );
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>(() =>
    availableVideoLectures.slice(0, 2).map((v) => v.id)
  );
  const [customTitle, setCustomTitle] = useState<string>(
    "Cross-Faculty Master Study Book"
  );
  const [masterBook, setMasterBook] =
    useState<SynthesizedMasterStudyBook | null>(null);
  const [activeCitationPreview, setActiveCitationPreview] =
    useState<MasterStudyBookCitation | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [synthesisToast, setSynthesisToast] = useState<string | null>(null);

  const toggleNotebookSelection = (id: string) => {
    setValidationError(null);
    setSelectedNotebookIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleVideoSelection = (id: string) => {
    setValidationError(null);
    setSelectedVideoIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleGenerateMasterBook = () => {
    setValidationError(null);
    const chosenNotebooks = availableNotebooks.filter((n) =>
      selectedNotebookIds.includes(n.id)
    );
    const chosenVideos = availableVideoLectures.filter((v) =>
      selectedVideoIds.includes(v.id)
    );

    try {
      const dna = getLocalCognitiveDnaState(
        "local-student-scholar",
        prakritiDosha
      );
      const book = synthesizeMasterStudyBook({
        notebooks: chosenNotebooks,
        videoLectures: chosenVideos,
        prakritiDosha,
        cognitiveDnaSummary: dna.summary_text,
        customTitle,
      });
      setMasterBook(book);
      setActiveCitationPreview(book.allCitations[0] ?? null);
      setSynthesisToast(
        `Merged ${chosenNotebooks.length} notebooks and ${chosenVideos.length} lectures into “${book.title}”.`
      );
    } catch (err) {
      setValidationError(
        err instanceof Error
          ? err.message
          : "Select at least 2 notebooks and 2 video transcripts."
      );
    }
  };

  const canSynthesize =
    selectedNotebookIds.length >= MIN_REQUIRED_NOTEBOOKS &&
    selectedVideoIds.length >= MIN_REQUIRED_VIDEO_TRANSCRIPTS;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <section className="space-y-5 backdrop-blur-xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl shadow-xl shadow-zinc-950/5 p-8 lg:col-span-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-zinc-500">Notebooks</p>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                <FileText className="h-4 w-4" />
                Choose at least {MIN_REQUIRED_NOTEBOOKS}
              </h2>
            </div>
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-500">
              {selectedNotebookIds.length} selected
            </span>
          </div>

          <div className="space-y-3">
            {availableNotebooks.map((nb) => {
              const isSelected = selectedNotebookIds.includes(nb.id);
              return (
                <button
                  key={nb.id}
                  type="button"
                  data-testid={`select-notebook-${nb.id}`}
                  onClick={() => toggleNotebookSelection(nb.id)}
                  className={`flex min-h-[56px] w-full flex-col justify-between rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${
                    isSelected
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-zinc-950 dark:border-white"
                      : "border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/70 dark:bg-zinc-800/40 text-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-medium">{nb.title}</span>
                    {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                  </div>
                  <p
                    className={`mt-1 line-clamp-2 text-xs ${
                      isSelected ? "opacity-80" : "text-zinc-500"
                    }`}
                  >
                    {nb.excerpt}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-5 backdrop-blur-xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl shadow-xl shadow-zinc-950/5 p-8 lg:col-span-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-zinc-500">Lectures</p>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                <Video className="h-4 w-4" />
                Choose at least {MIN_REQUIRED_VIDEO_TRANSCRIPTS}
              </h2>
            </div>
            <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-500">
              {selectedVideoIds.length} selected
            </span>
          </div>

          <div className="space-y-3">
            {availableVideoLectures.map((lec) => {
              const isSelected = selectedVideoIds.includes(lec.id);
              return (
                <button
                  key={lec.id}
                  type="button"
                  data-testid={`select-video-${lec.id}`}
                  onClick={() => toggleVideoSelection(lec.id)}
                  className={`flex min-h-[56px] w-full flex-col justify-between rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${
                    isSelected
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-zinc-950 dark:border-white"
                      : "border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/70 dark:bg-zinc-800/40 text-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-medium">{lec.title}</span>
                    {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                  </div>
                  <span
                    className={`mt-1 text-xs ${
                      isSelected ? "opacity-80" : "text-zinc-500"
                    }`}
                  >
                    {lec.facultyName} · {lec.notes.length} timed notes
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-3 pt-2">
            <label
              htmlFor="master-book-title"
              className="block text-xs font-medium text-zinc-500"
            >
              Master Study Book title
            </label>
            <input
              id="master-book-title"
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="min-h-[44px] w-full rounded-full border border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-800/60 px-4 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
            />

            {validationError && (
              <p className="text-xs text-zinc-500">{validationError}</p>
            )}

            <button
              type="button"
              data-testid="synthesize-master-book-btn"
              onClick={handleGenerateMasterBook}
              disabled={!canSynthesize}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 px-6 py-3 text-sm font-medium hover:opacity-90 transition-all active:scale-95 disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" />
              Create Master Study Book
            </button>

            {synthesisToast && (
              <p
                role="status"
                data-testid="synthesis-success-toast"
                className="text-xs text-zinc-500"
              >
                {synthesisToast}
              </p>
            )}
          </div>
        </section>
      </div>

      {masterBook && (
        <section
          data-testid="synthesized-master-study-book"
          className="space-y-6 backdrop-blur-xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl shadow-xl shadow-zinc-950/5 p-8"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500">
                Unified Master Study Book · Cognitive Energy Blueprint
                <span className="ml-1 opacity-70">({masterBook.prakritiDosha})</span>
              </p>
              <h3 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {masterBook.title}
              </h3>
              <p className="max-w-2xl text-sm leading-relaxed text-zinc-500">
                {masterBook.executiveSummary}
              </p>
            </div>
            <span className="rounded-full border border-zinc-200/60 dark:border-zinc-800/60 px-4 py-2 text-xs font-medium text-zinc-500">
              {masterBook.allCitations.length} citations
            </span>
          </div>

          <div className="space-y-4">
            {masterBook.sections.map((section) => (
              <article
                key={section.sectionNumber}
                className="space-y-3 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/70 dark:bg-zinc-800/40 p-5"
              >
                <h4 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  {section.heading}
                </h4>
                <div className="whitespace-pre-line text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {section.prakritiFormattedBody}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {section.inlineCitations.map((cite) => (
                    <button
                      key={`${section.sectionNumber}-${cite.id}`}
                      type="button"
                      onClick={() => setActiveCitationPreview(cite)}
                      className={`min-h-[44px] rounded-full px-4 py-2 text-xs font-medium transition-all active:scale-95 ${
                        activeCitationPreview?.id === cite.id
                          ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                          : "border border-zinc-200/60 dark:border-zinc-800/60 text-zinc-600 dark:text-zinc-300"
                      }`}
                    >
                      {cite.badge}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>

          {activeCitationPreview && (
            <p className="text-xs text-zinc-500">
              {activeCitationPreview.badge} · {activeCitationPreview.title}
              {activeCitationPreview.sourceType === "document"
                ? ` · Page ${activeCitationPreview.pageNumber}`
                : ` · ${activeCitationPreview.timestampSeconds}s`}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
