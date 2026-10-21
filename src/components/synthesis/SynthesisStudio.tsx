"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, FileText, Sparkles, Video } from "lucide-react";
import type { Dosha, PrakritiThemePalette } from "@/lib/prakriti/config";
import { listSavedPassages } from "@/lib/ai/passage-store";
import { getLocalCognitiveDnaState } from "@/lib/ai/adaptive-memory";
import {
  buildAvailableSources,
  DEFAULT_VIDEO_LECTURES,
  MIN_REQUIRED_SOURCES,
  MIN_REQUIRED_VIDEO_TRANSCRIPTS,
  synthesizeMasterStudyBook,
  type MasterStudyBookCitation,
  type SynthesizedMasterStudyBook,
  type SynthesisSource,
} from "@/lib/synthesis/master-book";
import type { VideoLectureRecord } from "@/lib/video/sync-engine";

export interface SynthesisStudioProps {
  prakritiDosha: Dosha;
  theme: PrakritiThemePalette;
}

export default function SynthesisStudio({
  prakritiDosha,
}: SynthesisStudioProps) {
  const [availableSources, setAvailableSources] = useState<
    SynthesisSource[]
  >(() => buildAvailableSources([]));

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAvailableSources(
        buildAvailableSources(listSavedPassages())
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const [availableVideoLectures] = useState<VideoLectureRecord[]>(
    () => DEFAULT_VIDEO_LECTURES
  );

  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(() =>
    availableSources.slice(0, 2).map((n) => n.id)
  );
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>(() =>
    availableVideoLectures.slice(0, 2).map((v) => v.id)
  );
  const [customTitle, setCustomTitle] = useState<string>(
    "My Study Guide"
  );
  const [masterBook, setMasterBook] =
    useState<SynthesizedMasterStudyBook | null>(null);
  const [activeCitationPreview, setActiveCitationPreview] =
    useState<MasterStudyBookCitation | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [synthesisToast, setSynthesisToast] = useState<string | null>(null);

  const toggleSourceSelection = (id: string) => {
    setValidationError(null);
    setSelectedSourceIds((prev) =>
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
    const chosenSources = availableSources.filter((n) =>
      selectedSourceIds.includes(n.id)
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
        sources: chosenSources,
        videoLectures: chosenVideos,
        prakritiDosha,
        cognitiveDnaSummary: dna.summary_text,
        customTitle,
      });
      setMasterBook(book);
      setActiveCitationPreview(book.allCitations[0] ?? null);
      setSynthesisToast(
        `Merged ${chosenSources.length} sources and ${chosenVideos.length} lectures into “${book.title}”.`
      );
    } catch (err) {
      setValidationError(
        err instanceof Error
          ? err.message
          : "Select at least 2 sources and 2 video transcripts."
      );
    }
  };

  const canSynthesize =
    selectedSourceIds.length >= MIN_REQUIRED_SOURCES &&
    selectedVideoIds.length >= MIN_REQUIRED_VIDEO_TRANSCRIPTS;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <section className="surface-card space-y-5 p-6 lg:col-span-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted">Compendiums</p>
              <h2 className="mt-1 flex items-center gap-2 font-display text-lg text-heading">
                <FileText className="h-4 w-4" />
                Choose at least {MIN_REQUIRED_SOURCES}
              </h2>
            </div>
            <span className="rounded-full bg-beige-2 px-3 py-1 text-xs font-medium text-muted">
              {selectedSourceIds.length} selected
            </span>
          </div>

          <div className="space-y-3">
            {availableSources.map((nb) => {
              const isSelected = selectedSourceIds.includes(nb.id);
              return (
                <button
                  key={nb.id}
                  type="button"
                  data-testid={`select-source-${nb.id}`}
                  onClick={() => toggleSourceSelection(nb.id)}
                  className={`flex min-h-[56px] w-full flex-col justify-between rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${
                    isSelected
                      ? "border-beige bg-selected text-heading"
                      : "border-line bg-beige-2 text-ink"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-medium">{nb.title}</span>
                    {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                  </div>
                  <p
                    className={`mt-1 line-clamp-2 text-xs ${
                      isSelected ? "opacity-80" : "text-muted"
                    }`}
                  >
                    {nb.excerpt}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="surface-card space-y-5 p-6 lg:col-span-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted">
                Lectures <span className="ml-1 text-[10px] uppercase tracking-wide text-accent">Demo</span>
              </p>
              <h2 className="mt-1 flex items-center gap-2 font-display text-lg text-heading">
                <Video className="h-4 w-4" />
                Choose at least {MIN_REQUIRED_VIDEO_TRANSCRIPTS}
              </h2>
            </div>
            <span className="rounded-full bg-beige-2 px-3 py-1 text-xs font-medium text-muted">
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
                      ? "border-beige bg-selected text-heading"
                      : "border-line bg-beige-2 text-ink"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-medium">{lec.title}</span>
                    {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                  </div>
                  <span
                    className={`mt-1 text-xs ${
                      isSelected ? "opacity-80" : "text-muted"
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
              className="block text-xs font-medium text-muted"
            >
              Study guide title
            </label>
            <input
              id="master-book-title"
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="field-input text-sm"
            />

            {validationError && (
              <p className="text-xs text-muted">{validationError}</p>
            )}

            <button
              type="button"
              data-testid="synthesize-master-book-btn"
              onClick={handleGenerateMasterBook}
              disabled={!canSynthesize}
              className="btn-primary w-full text-sm disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" />
              Create My Study Guide
            </button>

            {synthesisToast && (
              <p
                role="status"
                data-testid="synthesis-success-toast"
                className="text-xs text-muted"
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
          className="surface-card space-y-6 p-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted">
                Your study guide
                <span className="ml-1 opacity-70">({masterBook.prakritiDosha})</span>
              </p>
              <h3 className="font-display text-2xl text-heading">
                {masterBook.title}
              </h3>
              <p className="max-w-2xl text-sm leading-relaxed text-muted">
                {masterBook.executiveSummary}
              </p>
            </div>
            <span className="rounded-full border border-line px-4 py-2 text-xs font-medium text-muted">
              {masterBook.allCitations.length} citations
            </span>
          </div>

          <div className="space-y-4">
            {masterBook.sections.map((section) => (
              <article
                key={section.sectionNumber}
                className="space-y-3 rounded-2xl border border-line bg-beige-2 p-5"
              >
                <h4 className="font-display text-base text-heading">
                  {section.heading}
                </h4>
                <div className="whitespace-pre-line text-sm leading-relaxed text-ink">
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
                          ? "bg-selected text-heading"
                          : "border border-line text-ink"
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
            <p className="text-xs text-muted">
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
