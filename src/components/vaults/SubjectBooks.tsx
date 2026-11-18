"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { ui } from "@/components/ui/classes";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { whenAccountVaultOpen } from "@/lib/privacy/account-vault";
import { listLocalPdfDocuments } from "@/lib/reader/storage";
import { writeLastReaderDocumentId } from "@/lib/reader/fit";
import { isSampleBook, readBookSubjects, setBookSubject, type LibraryBook } from "@/lib/reader/library";

/** The student's books (from Books) given this subject, on the subject's own page. */
export function SubjectBooks({ subject }: { subject: string }) {
  const router = useRouter();
  const [books, setBooks] = useState<LibraryBook[] | null>(null);
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const user = await fetchSignedInUser().catch(() => null);
      if (user?.userId) await whenAccountVaultOpen();
      const documents = await listLocalPdfDocuments().catch(() => []);
      if (!active) return;
      setUserId(user?.userId ?? null);
      setSubjects(readBookSubjects(user?.userId ?? null));
      setBooks(
        documents
          .map((doc) => ({ id: doc.id, title: doc.title, fileName: doc.fileName, pageCount: doc.pageCount, updatedAt: doc.updatedAt }))
          .filter((book) => !isSampleBook(book))
      );
    })();
    return () => {
      active = false;
    };
  }, []);

  const key = subject.trim().toLowerCase();
  const inSubject = (books ?? []).filter((book) => (subjects[book.id] ?? "").toLowerCase() === key);
  const others = (books ?? []).filter((book) => (subjects[book.id] ?? "").toLowerCase() !== key);

  return (
    <div className="space-y-3" data-testid="subject-books">
      <h3 className="text-sm font-semibold text-heading">Your books in {subject}</h3>
      {books === null ? <p className={ui.loading}>Opening your books...</p> : null}
      {books !== null && inSubject.length === 0 ? (
        <p className="text-sm text-muted">No books in this subject yet. Add one from Books below.</p>
      ) : null}
      <ul className="space-y-2">
        {inSubject.map((book) => (
          <li key={book.id}>
            <button
              type="button"
              onClick={() => {
                writeLastReaderDocumentId(book.id, userId);
                router.push("/reader");
              }}
              className={`${ui.card} flex min-h-11 w-full items-center gap-3 p-4 text-left`}
              data-testid="subject-book"
            >
              <BookOpen className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-heading">{book.title}</span>
                <span className="block text-xs text-muted">{book.pageCount} pages · tap to open</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {others.length > 0 ? (
        <label className="block text-sm text-muted">
          <span className="mb-1 block">Add a book from Books to {subject}</span>
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) setSubjects(setBookSubject(userId, event.target.value, subject));
            }}
            className={`${ui.input} min-h-11 w-full`}
            data-testid="subject-book-add"
          >
            <option value="">Choose a book…</option>
            {others.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
