"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, BookOpen, MoreHorizontal } from "lucide-react";
import AppChrome from "@/components/layout/AppChrome";
import { ui } from "@/components/ui/classes";
import { fetchSignedInUser } from "@/lib/supabase/session";
import { whenAccountVaultOpen } from "@/lib/privacy/account-vault";
import { listLocalPdfDocuments } from "@/lib/reader/storage";
import { writeLastReaderDocumentId } from "@/lib/reader/fit";
import {
  groupBooksBySubject,
  isSampleBook,
  NO_SUBJECT,
  readBookSubjects,
  setBookSubject,
  subjectChoices,
  type LibraryBook,
} from "@/lib/reader/library";

interface VaultCard {
  id: string;
  title: string;
  updated_at: string;
}

function vaultError(message: string): string {
  if (/subject_vaults|schema cache|does not exist/i.test(message)) {
    return "Your learning library isn't ready yet. Please try again in a moment.";
  }
  return message;
}

export default function VaultLibrary() {
  const router = useRouter();
  const [vaults, setVaults] = useState<VaultCard[]>([]);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // Books from the reader (kept on this device), sorted by the subject the student gives them.
  const [books, setBooks] = useState<LibraryBook[] | null>(null);
  const [bookSubjects, setBookSubjects] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const user = await fetchSignedInUser().catch(() => null);
      if (user?.userId) await whenAccountVaultOpen();
      const documents = await listLocalPdfDocuments().catch(() => []);
      if (!active) return;
      setUserId(user?.userId ?? null);
      setBookSubjects(readBookSubjects(user?.userId ?? null));
      setBooks(
        documents.map((doc) => ({
          id: doc.id,
          title: doc.title,
          fileName: doc.fileName,
          pageCount: doc.pageCount,
          updatedAt: doc.updatedAt,
        }))
      );
    })();
    return () => {
      active = false;
    };
  }, []);

  const openBook = (bookId: string) => {
    writeLastReaderDocumentId(bookId, userId);
    router.push("/reader");
  };

  const bookGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (books ?? []).filter(
      (book) =>
        !needle ||
        book.title.toLowerCase().includes(needle) ||
        (bookSubjects[book.id] ?? "").toLowerCase().includes(needle)
    );
    return groupBooksBySubject(list, bookSubjects);
  }, [books, bookSubjects, query]);
  const choices = useMemo(
    () => subjectChoices(vaults.map((vault) => vault.title), bookSubjects),
    [vaults, bookSubjects]
  );

  const load = async () => {
    const response = await fetch("/api/vaults", { credentials: "same-origin" });
    const json = (await response.json()) as {
      vaults?: VaultCard[];
      error?: string;
    };
    if (response.status === 401) {
      router.push("/auth?next=/vaults");
      return;
    }
    if (!response.ok) {
      setError(vaultError(json.error ?? "Your library could not be opened."));
      setVaults([]);
    } else {
      setError(null);
      setVaults(json.vaults ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
    // The loader closes over the router and runs once when the library opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createVault = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setError(null);
    const response = await fetch("/api/vaults", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", title: nextTitle }),
    });
    const json = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !json.id) {
      setError(vaultError(json.error ?? "This collection could not be created."));
      return;
    }
    router.push(`/vaults/${json.id}`);
  };

  const renameVault = async (vaultId: string) => {
    const nextTitle = renameValue.trim();
    if (!nextTitle) return;
    const response = await fetch("/api/vaults", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", id: vaultId, title: nextTitle }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(vaultError(json.error ?? "The collection could not be renamed."));
      return;
    }
    setRenamingId(null);
    setVaults((current) =>
      current.map((vault) => (vault.id === vaultId ? { ...vault, title: nextTitle } : vault))
    );
  };

  const deleteVault = async (vaultId: string) => {
    const response = await fetch("/api/vaults", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: vaultId }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(vaultError(json.error ?? "The collection could not be removed."));
      return;
    }
    setMenuId(null);
    setVaults((current) => current.filter((vault) => vault.id !== vaultId));
  };

  const clearChat = async (vaultId: string) => {
    const response = await fetch("/api/vaults", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_chat", id: vaultId }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) setError(vaultError(json.error ?? "Chat history could not be cleared."));
    setMenuId(null);
  };

  const visibleVaults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return vaults;
    return vaults.filter((vault) => vault.title.toLowerCase().includes(needle));
  }, [query, vaults]);

  return (
    <AppChrome subtitle="My Learning Library">
      <main className={ui.main}>
        <p className={ui.eyebrow}>My Learning Library</p>
        <h1 className={`${ui.heading} mt-3 text-4xl`}>My Learning Library</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Your subjects and books in one place. Add a subject, then sort the books you read in Books under it.
        </p>

        <form
          className="mt-8 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void createVault();
          }}
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Physics"
            aria-label="New subject name"
            className={`${ui.input} flex-1`}
          />
          <button type="submit" className={ui.primary}>
            Add subject
          </button>
        </form>

        <label className="mt-4 block">
          <span className="sr-only">Search your library</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your library"
            aria-label="Search your library"
            className={ui.input}
          />
        </label>

        {error && <p className={`${ui.alert} mt-4`}>{error}</p>}

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {loading && <p className={ui.loading}>Opening your learning library...</p>}
          {!loading && vaults.length === 0 && !error && (
            <p className={ui.empty}>
              No subjects yet. Add one above (for example Physics), then give each of your books below a subject.
            </p>
          )}
          {!loading && vaults.length > 0 && visibleVaults.length === 0 && (
            <p className={ui.empty}>No collections match that search.</p>
          )}
          {visibleVaults.map((vault) => (
            <article key={vault.id} className={`${ui.card} relative`}>
              <div className="flex items-start justify-between gap-3">
                <span className={ui.chip}>
                  <Archive className="h-5 w-5" />
                </span>
                <button
                  type="button"
                  aria-label={`Library actions for ${vault.title}`}
                  onClick={() => setMenuId((current) => (current === vault.id ? null : vault.id))}
                  className={ui.iconBtn}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
              {renamingId === vault.id ? (
                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void renameVault(vault.id);
                  }}
                >
                  <input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    aria-label="Rename collection"
                    className={`${ui.input} flex-1`}
                  />
                  <button type="submit" className={ui.ghost}>
                    Save
                  </button>
                </form>
              ) : (
                <Link href={`/vaults/${vault.id}`} className={`${ui.heading} mt-4 block text-lg`}>
                  {vault.title}
                </Link>
              )}
              {menuId === vault.id && (
                <div className="surface-card absolute right-4 top-16 z-10 w-44 p-2 shadow-[0_16px_40px_-24px_rgba(32,36,43,0.45)]">
                  <button
                    type="button"
                    className="block min-h-11 w-full rounded-xl px-3 text-left text-sm hover:bg-beige-2"
                    onClick={() => {
                      setRenamingId(vault.id);
                      setRenameValue(vault.title);
                      setMenuId(null);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="block min-h-11 w-full rounded-xl px-3 text-left text-sm hover:bg-beige-2"
                    onClick={() => void clearChat(vault.id)}
                  >
                    Clear chat history
                  </button>
                  <button
                    type="button"
                    className="block min-h-11 w-full rounded-xl px-3 text-left text-sm text-danger hover:bg-danger-bg"
                    onClick={() => void deleteVault(vault.id)}
                  >
                    Delete from library
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>

        <section className="mt-10 space-y-4" aria-labelledby="library-books-heading" data-testid="library-books">
          <div>
            <h2 id="library-books-heading" className={`${ui.heading} text-2xl`}>
              My books, by subject
            </h2>
            <p className="mt-1 text-sm text-muted">
              The PDFs you added in Books. They stay on this device. Pick a subject for each to keep them sorted.
            </p>
          </div>
          {books === null ? <p className={ui.loading}>Opening your books...</p> : null}
          {books !== null && books.length === 0 ? (
            <p className={ui.empty}>
              No books yet. <Link href="/reader?upload=1" className="underline">Add a PDF in Books</Link>.
            </p>
          ) : null}
          {bookGroups.map((group) => (
            <div key={group.subject} className="space-y-2" data-testid="library-book-group">
              <h3 className="text-sm font-semibold text-heading">
                {group.subject} <span className="font-normal text-muted">· {group.books.length}</span>
              </h3>
              <ul className="space-y-2">
                {group.books.map((book) => (
                  <li
                    key={book.id}
                    className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center"
                    data-testid="library-book"
                  >
                    <button
                      type="button"
                      onClick={() => openBook(book.id)}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <BookOpen className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-heading">{book.title}</span>
                        <span className="block text-xs text-muted">
                          {book.pageCount} {book.pageCount === 1 ? "page" : "pages"} · tap to open
                        </span>
                      </span>
                    </button>
                    {isSampleBook(book) ? null : (
                      <label className="flex items-center gap-2 text-sm text-muted">
                        <span className="sr-only">Subject for {book.title}</span>
                        <select
                          value={bookSubjects[book.id] ?? ""}
                          onChange={(event) =>
                            setBookSubjects(setBookSubject(userId, book.id, event.target.value || null))
                          }
                          className={`${ui.input} min-h-11 py-2`}
                          data-testid="library-book-subject"
                        >
                          <option value="">{NO_SUBJECT}</option>
                          {choices.map((subject) => (
                            <option key={subject} value={subject}>
                              {subject}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {books !== null && books.length > 0 && choices.length === 0 ? (
            <p className="text-sm text-muted">Add a subject at the top of this page to sort your books.</p>
          ) : null}
        </section>
      </main>
    </AppChrome>
  );
}
