"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { whenAccountVaultOpen } from "@/lib/privacy/account-vault";
import { listLocalPdfDocuments } from "@/lib/reader/storage";
import { readPersistedReaderView } from "@/lib/reader/fit";
import { isSampleBook, readBookSubjects } from "@/lib/reader/library";
import {
  chapterRows,
  chapterSummary,
  readChapterReady,
  writeChapterReady,
  type ChapterBook,
  type ChapterStatus,
} from "@/lib/subjects/chapters";

const STATUS_LABEL: Record<ChapterStatus, string> = {
  ready: "Exam-ready",
  read: "Read",
  reading: "Reading",
  new: "Not started",
};

const STATUS_BADGE: Record<ChapterStatus, string> = {
  ready: "bg-[#eff1ec] text-[#58705e]",
  read: "bg-[#f6f1e6] text-[#806b45]",
  reading: "bg-[#f6efe8] text-[#94664f]",
  new: "bg-beige-2 text-muted",
};

type Filter = "all" | ChapterStatus;
const PAGE = 40;

/**
 * Every chapter of the subject's books, with its pages, how far the student has read, and a
 * tick for "exam-ready" (owner, 27 Nov 2026). Built from the book contents; no AI.
 */
export function SubjectChapters({ subject }: { subject: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [books, setBooks] = useState<ChapterBook[] | null>(null);
  const [ready, setReady] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await fetchSignedInUser().catch(() => null);
      const id = user?.userId ?? null;
      if (id) await whenAccountVaultOpen().catch(() => false);
      const documents = await listLocalPdfDocuments().catch(() => []);
      if (cancelled) return;
      const subjects = readBookSubjects(id);
      const key = subject.trim().toLowerCase();
      setUserId(id);
      setReady(readChapterReady(id));
      setBooks(
        documents
          .filter((doc) => !isSampleBook({ fileName: doc.fileName }))
          .filter((doc) => (subjects[doc.id] ?? "").toLowerCase() === key)
          .map((doc) => {
            const view = readPersistedReaderView(doc.id, id);
            return {
              id: doc.id,
              title: doc.title,
              pageCount: doc.pageCount,
              chapters: doc.chapters.map((chapter) => ({ title: chapter.title, pageNumber: chapter.pageNumber })),
              reachedPage: Math.max(doc.lastReadPage ?? 0, view?.page ?? 0),
            };
          })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [subject]);

  const rows = useMemo(() => (books ? chapterRows(books, ready) : []), [books, ready]);
  const summary = useMemo(() => chapterSummary(rows), [rows]);
  const visible = filter === "all" ? rows : rows.filter((row) => row.status === filter);
  const multipleBooks = (books?.length ?? 0) > 1;

  const toggleReady = (key: string) => {
    setReady((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeChapterReady(userId, next);
      return next;
    });
  };

  if (books === null) {
    return <p className="text-sm text-muted" data-testid="subject-chapters-loading">Opening your chapters…</p>;
  }
  if (books.length === 0) {
    return (
      <div className="card-soft space-y-2 p-5" data-testid="subject-chapters-empty">
        <p className="font-semibold text-heading">No books in {subject} yet</p>
        <p className="text-sm text-muted">
          Add a book to this subject on the Sources tab (or in Books). Its chapters will appear here with your reading progress.
        </p>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="card-soft space-y-2 p-5" data-testid="subject-chapters-none">
        <p className="font-semibold text-heading">We couldn&apos;t find chapters in this book</p>
        <p className="text-sm text-muted">Open the book and use Contents or Pages to move around; progress still counts.</p>
      </div>
    );
  }

  return (
    <section className="space-y-4" data-testid="subject-chapters">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {(
          [
            ["Exam-ready", `${summary.ready} / ${summary.total}`],
            ["Read", String(summary.read)],
            ["Reading", String(summary.reading)],
            ["Not started", String(summary.new)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="card-soft px-4 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-xl font-bold text-heading">{value}</p>
          </div>
        ))}
      </div>

      <div className="card-soft overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3" role="group" aria-label="Show chapters">
          {(
            [
              ["all", `All ${summary.total}`],
              ["reading", `Reading ${summary.reading}`],
              ["read", `Read ${summary.read}`],
              ["ready", `Exam-ready ${summary.ready}`],
              ["new", `Not started ${summary.new}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                setShown(PAGE);
              }}
              className={`min-h-9 rounded-full border px-3 text-sm ${
                filter === id ? "border-line bg-selected font-semibold text-heading" : "border-line bg-surface text-muted hover:text-heading"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <ul>
          {visible.slice(0, shown).map((row, index) => (
            <li
              key={row.key}
              className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3 first:border-t-0 sm:grid-cols-[36px_minmax(0,1fr)_140px_auto]"
              data-testid="subject-chapter-row"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-[11px] text-sm font-bold ${
                  row.status === "ready" ? "bg-[#58705e] text-white" : row.status === "new" ? "bg-beige-2 text-muted" : "bg-[#b08a68] text-white"
                }`}
                aria-hidden="true"
              >
                {row.status === "ready" ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-heading">{row.title}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_BADGE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                  <span className="rounded-full bg-beige-2 px-2 py-0.5">
                    {multipleBooks ? `${row.bookTitle} · ` : "Book "}p. {row.startPage}
                    {row.endPage > row.startPage ? `–${row.endPage}` : ""}
                  </span>
                </p>
              </div>
              <div className="col-span-2 space-y-1 sm:col-span-1" aria-label={`${row.percent}% read`}>
                <div className="h-1.5 overflow-hidden rounded-full bg-beige-2">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#b08a68,var(--accent))]" style={{ width: `${row.percent}%` }} />
                </div>
                <p className="text-[11px] text-muted">{row.percent}% read</p>
              </div>
              <div className="col-span-2 flex gap-2 sm:col-span-1">
                <Link
                  href={`/reader?doc=${encodeURIComponent(row.bookId)}&page=${row.startPage}`}
                  className="inline-flex min-h-9 items-center rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-heading hover:bg-beige-2"
                >
                  {row.status === "new" ? "Start" : row.status === "reading" ? "Continue" : "Open"}
                </Link>
                <button
                  type="button"
                  aria-pressed={row.status === "ready"}
                  onClick={() => toggleReady(row.key)}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold ${
                    row.status === "ready" ? "bg-[#eff1ec] text-[#58705e]" : "text-muted hover:bg-beige-2 hover:text-heading"
                  }`}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {row.status === "ready" ? "Exam-ready" : "Mark exam-ready"}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {visible.length > shown ? (
          <div className="border-t border-line px-4 py-3">
            <button type="button" onClick={() => setShown((current) => current + PAGE)} className="min-h-10 text-sm font-semibold text-accent">
              Show {Math.min(PAGE, visible.length - shown)} more chapters
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
