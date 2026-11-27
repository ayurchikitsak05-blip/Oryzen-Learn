"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { whenAccountVaultOpen } from "@/lib/privacy/account-vault";
import { listLocalPdfDocuments } from "@/lib/reader/storage";
import { readPersistedReaderView } from "@/lib/reader/fit";
import { isSampleBook, readBookSubjects } from "@/lib/reader/library";
import { chapterRows, chapterSummary, readChapterReady } from "@/lib/subjects/chapters";
import { StudyIconTile, type StudyIconName } from "@/components/icons/StudyIcons";

interface SubjectCard {
  name: string;
  books: number;
  total: number;
  read: number;
  ready: number;
}

const ICONS: StudyIconName[] = ["books", "timer", "lectures", "style", "revision"];

/** "My subjects" on Today: chapters read and exam-ready per subject, from the student's books. No AI. */
export function SubjectsStrip() {
  const [cards, setCards] = useState<SubjectCard[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await fetchSignedInUser().catch(() => null);
      const userId = user?.userId ?? null;
      if (!userId) return;
      await whenAccountVaultOpen().catch(() => false);
      const documents = await listLocalPdfDocuments().catch(() => []);
      if (cancelled) return;
      const subjects = readBookSubjects(userId);
      const ready = readChapterReady(userId);
      const groups = new Map<string, SubjectCard>();
      for (const doc of documents) {
        if (isSampleBook({ fileName: doc.fileName })) continue;
        const name = (subjects[doc.id] ?? "").trim();
        if (!name) continue;
        const view = readPersistedReaderView(doc.id, userId);
        const summary = chapterSummary(
          chapterRows(
            [{ id: doc.id, title: doc.title, pageCount: doc.pageCount, chapters: doc.chapters, reachedPage: Math.max(doc.lastReadPage ?? 0, view?.page ?? 0) }],
            ready
          )
        );
        const key = name.toLowerCase();
        const card = groups.get(key) ?? { name, books: 0, total: 0, read: 0, ready: 0 };
        card.books += 1;
        card.total += summary.total;
        card.read += summary.read + summary.ready;
        card.ready += summary.ready;
        groups.set(key, card);
      }
      setCards([...groups.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 6));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!cards || cards.length === 0) return null;
  return (
    <section aria-labelledby="today-subjects-title" data-testid="today-subjects" className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="today-subjects-title" className="text-lg font-semibold text-heading">My subjects</h2>
        <Link href="/vaults" className="text-sm font-semibold text-accent">All subjects</Link>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card, index) => {
          const percent = card.total > 0 ? Math.round((card.read / card.total) * 100) : 0;
          return (
            <Link key={card.name} href="/vaults" className="card-soft lift space-y-2.5 p-4">
              <span className="flex items-center justify-between">
                <StudyIconTile name={ICONS[index % ICONS.length]} box={40} delay={0.2 + index * 0.06} />
                <span className="text-xs font-semibold text-muted">{card.ready} exam-ready</span>
              </span>
              <span className="block font-semibold text-heading">{card.name}</span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-beige-2" aria-hidden="true">
                <span className="grow-bar block h-full rounded-full bg-[linear-gradient(90deg,#b08a68,var(--accent))]" style={{ width: `${percent}%` }} />
              </span>
              <span className="block text-xs text-muted">
                {card.read} of {card.total} chapters read · {card.books} book{card.books === 1 ? "" : "s"}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
