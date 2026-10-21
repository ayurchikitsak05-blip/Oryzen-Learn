"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, MoreHorizontal } from "lucide-react";
import AppChrome from "@/components/layout/AppChrome";
import { ui } from "@/components/ui/classes";

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
          Keep your subjects, textbooks, and learning materials organized and easy to find.
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
            placeholder="Advanced Pharmacology - CNS"
            aria-label="New library collection title"
            className={`${ui.input} flex-1`}
          />
          <button type="submit" className={ui.primary}>
            Add to library
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
            <p className={ui.empty}>Your library is ready. Add your first document to begin.</p>
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
      </main>
    </AppChrome>
  );
}
