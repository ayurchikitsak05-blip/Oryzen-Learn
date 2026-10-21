"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Archive, MoreHorizontal } from "lucide-react";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";
import { createClient } from "@/lib/supabase/client";
import { AUTHORIZED_DOCUMENTS_BUCKET } from "@/lib/supabase/storage";

interface VaultCard {
  id: string;
  title: string;
  updated_at: string;
}

function vaultError(message: string): string {
  if (/subject_vaults|schema cache|does not exist/i.test(message)) {
    return "Subject Vaults are not installed on the database yet. Apply supabase/migrations/20261021000001_subject_vaults.sql, then reload.";
  }
  return message;
}

export default function VaultLibrary() {
  const router = useRouter();
  const [vaults, setVaults] = useState<VaultCard[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = async () => {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/auth?next=/vaults");
      return;
    }
    const { data, error: loadError } = await supabase
      .from("subject_vaults")
      .select("id, title, updated_at")
      .eq("user_id", userData.user.id)
      .order("updated_at", { ascending: false });
    if (loadError) {
      setError(vaultError(loadError.message));
      setVaults([]);
    } else {
      setError(null);
      setVaults(data ?? []);
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
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data, error: insertError } = await supabase
      .from("subject_vaults")
      .insert({ user_id: userData.user.id, title: nextTitle })
      .select("id")
      .single();
    if (insertError || !data) {
      setError(vaultError(insertError?.message ?? "The vault could not be created."));
      return;
    }
    router.push(`/vaults/${data.id}`);
  };

  const renameVault = async (vaultId: string) => {
    const nextTitle = renameValue.trim();
    if (!nextTitle) return;
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("subject_vaults")
      .update({ title: nextTitle })
      .eq("id", vaultId);
    if (updateError) {
      setError(vaultError(updateError.message));
      return;
    }
    setRenamingId(null);
    setVaults((current) =>
      current.map((vault) => (vault.id === vaultId ? { ...vault, title: nextTitle } : vault))
    );
  };

  const deleteVault = async (vaultId: string) => {
    const supabase = createClient();
    const { data: sources } = await supabase
      .from("vault_sources")
      .select("storage_path")
      .eq("vault_id", vaultId);
    const paths = (sources ?? []).map((source) => source.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from(AUTHORIZED_DOCUMENTS_BUCKET).remove(paths);
    }
    const { error: deleteError } = await supabase.from("subject_vaults").delete().eq("id", vaultId);
    if (deleteError) {
      setError(vaultError(deleteError.message));
      return;
    }
    setMenuId(null);
    setVaults((current) => current.filter((vault) => vault.id !== vaultId));
  };

  const clearChat = async (vaultId: string) => {
    const supabase = createClient();
    const { error: clearError } = await supabase.from("vault_messages").delete().eq("vault_id", vaultId);
    if (clearError) setError(vaultError(clearError.message));
    setMenuId(null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100">
      <header className="sticky top-0 z-30 px-4 pt-5 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-amber-500/30 bg-zinc-950/80 px-5 py-2.5 backdrop-blur-xl">
          <OryzenLearnBrand subtitle="Subject Vaults" />
          <Link href="/hub" className="inline-flex min-h-[44px] items-center gap-1 text-sm text-amber-200">
            <ArrowLeft className="h-4 w-4" />
            Study hub
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 md:px-8">
        <p className="text-xs font-medium uppercase tracking-widest text-amber-200">Study Compendiums</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Subject Vaults</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-amber-100">
          Keep a textbook, its sources, and the notes you generate in one place.
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
            placeholder="Advanced Pharmacology - CNS Notes"
            aria-label="New vault title"
            className="min-h-[48px] flex-1 rounded-2xl border border-amber-500/30 bg-black px-4 text-sm text-amber-50"
          />
          <button
            type="submit"
            className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-amber-500/40 bg-amber-950/50 px-5 text-sm font-medium text-amber-100 hover:bg-amber-950/70"
          >
            Create vault
          </button>
        </form>

        {error && (
          <p className="mt-4 rounded-2xl border border-red-700/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {loading && <p className="text-sm text-amber-200">Loading your vaults…</p>}
          {!loading && vaults.length === 0 && !error && (
            <p className="text-sm text-amber-100">No subject vaults yet. Create one for a textbook or exam topic.</p>
          )}
          {vaults.map((vault) => (
            <article
              key={vault.id}
              className="relative rounded-3xl border border-amber-500/30 bg-amber-950/20 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <Archive className="h-5 w-5 text-amber-200" />
                <button
                  type="button"
                  aria-label={`Vault actions for ${vault.title}`}
                  onClick={() => setMenuId((current) => (current === vault.id ? null : vault.id))}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-amber-200 hover:bg-amber-950/40"
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
                    aria-label="Rename vault"
                    className="min-h-[44px] flex-1 rounded-xl border border-amber-500/30 bg-black px-3 text-sm text-amber-50"
                  />
                  <button type="submit" className="text-sm text-amber-100">
                    Save
                  </button>
                </form>
              ) : (
                <Link href={`/vaults/${vault.id}`} className="mt-4 block text-lg font-semibold text-white">
                  {vault.title}
                </Link>
              )}
              {menuId === vault.id && (
                <div className="absolute right-4 top-16 z-10 w-44 rounded-2xl border border-amber-500/30 bg-zinc-950 p-2 shadow-xl">
                  <button
                    type="button"
                    className="block min-h-[40px] w-full rounded-xl px-3 text-left text-sm hover:bg-amber-950/40"
                    onClick={() => {
                      setRenamingId(vault.id);
                      setRenameValue(vault.title);
                      setMenuId(null);
                    }}
                  >
                    Rename Vault
                  </button>
                  <button
                    type="button"
                    className="block min-h-[40px] w-full rounded-xl px-3 text-left text-sm hover:bg-amber-950/40"
                    onClick={() => void clearChat(vault.id)}
                  >
                    Clear Chat History
                  </button>
                  <button
                    type="button"
                    className="block min-h-[40px] w-full rounded-xl px-3 text-left text-sm text-red-200 hover:bg-red-950/40"
                    onClick={() => void deleteVault(vault.id)}
                  >
                    Delete Vault
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
