"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";
import { createClient } from "@/lib/supabase/client";
import { AUTHORIZED_DOCUMENTS_BUCKET } from "@/lib/supabase/storage";
import { extractTextbookText } from "@/lib/vaults/extract-pdf";
import { buildPlainPdf, downloadBlob, safeDownloadName } from "@/lib/vaults/download";

type TabId = "sources" | "chat" | "studio";

interface SourceRow {
  id: string;
  title: string;
  storage_path: string;
  page_count: number;
  created_at: string;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface NoteRow {
  id: string;
  kind: "study_notes" | "recall";
  title: string;
  body_markdown: string;
  created_at: string;
}

const MAX_PDF_BYTES = 200 * 1024 * 1024;

function describeFailure(message: string): string {
  if (/vault_|subject_vaults|schema cache|does not exist/i.test(message)) {
    return "Subject Vaults are not installed on the database yet. Apply the vault migration, then try again.";
  }
  return message;
}

export default function VaultStudio({ vaultId }: { vaultId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [tab, setTab] = useState<TabId>("sources");
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [question, setQuestion] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [grounded, setGrounded] = useState<"model" | "textbook" | null>(null);

  const load = async () => {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push(`/auth?next=/vaults/${vaultId}`);
      return;
    }
    const { data: vault, error: vaultError } = await supabase
      .from("subject_vaults")
      .select("title")
      .eq("id", vaultId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (vaultError || !vault) {
      setError(describeFailure(vaultError?.message ?? "This subject vault could not be opened."));
      return;
    }
    setTitle(vault.title);
    const [sourceResult, messageResult, noteResult] = await Promise.all([
      supabase
        .from("vault_sources")
        .select("id, title, storage_path, page_count, created_at")
        .eq("vault_id", vaultId)
        .order("created_at", { ascending: true }),
      supabase
        .from("vault_messages")
        .select("id, role, content, created_at")
        .eq("vault_id", vaultId)
        .order("created_at", { ascending: true }),
      supabase
        .from("vault_notes")
        .select("id, kind, title, body_markdown, created_at")
        .eq("vault_id", vaultId)
        .order("created_at", { ascending: false }),
    ]);
    const firstError = sourceResult.error ?? messageResult.error ?? noteResult.error;
    if (firstError) {
      setError(describeFailure(firstError.message));
      return;
    }
    setSources(sourceResult.data ?? []);
    setMessages((messageResult.data ?? []) as MessageRow[]);
    setNotes(noteResult.data ?? []);
    setError(null);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
    // Reload when the vault id changes. The loader is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId]);

  const saveTitle = async () => {
    const next = title.trim();
    if (!next) return;
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("subject_vaults")
      .update({ title: next })
      .eq("id", vaultId);
    if (updateError) setError(describeFailure(updateError.message));
    else setRenaming(false);
  };

  const uploadPdf = async (file: File) => {
    if (file.type !== "application/pdf") {
      setError("Choose a PDF textbook.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError("This PDF is larger than 200 MB. Split it or choose a smaller file.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Reading the textbook…");
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sign in before uploading.");
      const bytes = await file.arrayBuffer();
      const extracted = await extractTextbookText(bytes);
      if (!extracted.excerpt) {
        throw new Error("No readable text was found in this PDF.");
      }
      const sourceId = crypto.randomUUID();
      const storagePath = `users/${userData.user.id}/vaults/${vaultId}/${sourceId}.pdf`;
      setStatus("Saving the textbook…");
      const { error: uploadError } = await supabase.storage
        .from(AUTHORIZED_DOCUMENTS_BUCKET)
        .upload(storagePath, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const { error: insertError } = await supabase.from("vault_sources").insert({
        id: sourceId,
        vault_id: vaultId,
        user_id: userData.user.id,
        title: file.name.replace(/\.pdf$/i, ""),
        storage_path: storagePath,
        page_count: extracted.pageCount,
        excerpt: extracted.excerpt,
      });
      if (insertError) throw new Error(insertError.message);
      setStatus(null);
      await load();
    } catch (uploadFailure) {
      setStatus(null);
      setError(
        describeFailure(
          uploadFailure instanceof Error ? uploadFailure.message : "The textbook could not be saved."
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vaults/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId, question: trimmed }),
      });
      const payload = (await response.json()) as {
        error?: string;
        answer?: string;
        grounded?: "model" | "textbook";
      };
      if (!response.ok) throw new Error(payload.error ?? "The question could not be answered.");
      setQuestion("");
      setGrounded(payload.grounded ?? null);
      await load();
    } catch (askFailure) {
      setError(askFailure instanceof Error ? askFailure.message : "The question could not be answered.");
    } finally {
      setBusy(false);
    }
  };

  const generate = async (kind: "study_notes" | "recall") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/vaults/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId, kind }),
      });
      const payload = (await response.json()) as {
        error?: string;
        grounded?: "model" | "textbook";
      };
      if (!response.ok) throw new Error(payload.error ?? "Notes could not be generated.");
      setGrounded(payload.grounded ?? null);
      setTab("studio");
      await load();
    } catch (generateFailure) {
      setError(generateFailure instanceof Error ? generateFailure.message : "Notes could not be generated.");
    } finally {
      setBusy(false);
    }
  };

  const latestNotes = notes.find((note) => note.kind === "study_notes") ?? notes[0];

  const downloadNotes = (kind: "md" | "txt" | "pdf") => {
    if (!latestNotes) return;
    const name = safeDownloadName(title || latestNotes.title, kind === "txt" ? "txt" : kind);
    if (kind === "pdf") {
      const pdfBytes = buildPlainPdf(latestNotes.title, latestNotes.body_markdown);
      const pdfCopy = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(pdfCopy).set(pdfBytes);
      downloadBlob(name, new Blob([pdfCopy], { type: "application/pdf" }));
      return;
    }
    downloadBlob(
      name,
      new Blob([latestNotes.body_markdown], {
        type: kind === "md" ? "text/markdown" : "text/plain",
      })
    );
  };

  const clearChat = async () => {
    const supabase = createClient();
    const { error: clearError } = await supabase.from("vault_messages").delete().eq("vault_id", vaultId);
    if (clearError) setError(describeFailure(clearError.message));
    else setMessages([]);
    setMenuOpen(false);
  };

  const deleteVault = async () => {
    const supabase = createClient();
    const paths = sources.map((source) => source.storage_path);
    if (paths.length > 0) {
      await supabase.storage.from(AUTHORIZED_DOCUMENTS_BUCKET).remove(paths);
    }
    const { error: deleteError } = await supabase.from("subject_vaults").delete().eq("id", vaultId);
    if (deleteError) {
      setError(describeFailure(deleteError.message));
      return;
    }
    router.push("/vaults");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100">
      <header className="sticky top-0 z-30 px-4 pt-5 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full border border-amber-500/30 bg-zinc-950/80 px-5 py-2.5 backdrop-blur-xl">
          <OryzenLearnBrand subtitle="Subject Vault" />
          <Link href="/vaults" className="inline-flex min-h-[44px] items-center gap-1 text-sm text-amber-200">
            <ArrowLeft className="h-4 w-4" />
            All vaults
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="flex items-start justify-between gap-3">
          {renaming ? (
            <form
              className="flex flex-1 gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void saveTitle();
              }}
            >
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                aria-label="Vault title"
                className="min-h-[48px] flex-1 rounded-2xl border border-amber-500/30 bg-black px-4 text-2xl font-semibold text-white"
              />
              <button type="submit" className="text-sm text-amber-100">
                Save
              </button>
            </form>
          ) : (
            <h1 className="text-3xl font-semibold tracking-tight text-white">{title || "Subject Vault"}</h1>
          )}
          <div className="relative">
            <button
              type="button"
              aria-label="Vault actions"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-amber-500/30 text-amber-200"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-2 w-48 rounded-2xl border border-amber-500/30 bg-zinc-950 p-2 shadow-xl">
                <button
                  type="button"
                  className="block min-h-[40px] w-full rounded-xl px-3 text-left text-sm hover:bg-amber-950/40"
                  onClick={() => {
                    setRenaming(true);
                    setMenuOpen(false);
                  }}
                >
                  Rename Vault
                </button>
                <button
                  type="button"
                  className="block min-h-[40px] w-full rounded-xl px-3 text-left text-sm hover:bg-amber-950/40"
                  onClick={() => void clearChat()}
                >
                  Clear Chat History
                </button>
                <button
                  type="button"
                  className="block min-h-[40px] w-full rounded-xl px-3 text-left text-sm text-red-200 hover:bg-red-950/40"
                  onClick={() => void deleteVault()}
                >
                  Delete Vault
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ["sources", "Sources"],
              ["chat", "AI Chat"],
              ["studio", "Studio"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm ${
                tab === id
                  ? "border-amber-200/40 bg-amber-950/50 text-amber-50"
                  : "border-amber-500/30 text-amber-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-4 rounded-2xl border border-red-700/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        )}
        {status && <p className="mt-4 text-sm text-amber-200">{status}</p>}
        {grounded === "textbook" && (
          <p className="mt-3 text-xs text-amber-200">
            Composed from the textbook text. Add a Gemini key to use the model.
          </p>
        )}

        {tab === "sources" && (
          <section className="mt-6 space-y-4">
            <label className="inline-flex min-h-[48px] cursor-pointer items-center rounded-full border border-amber-500/40 bg-amber-950/50 px-5 text-sm font-medium text-amber-100">
              {busy ? "Working…" : "Upload textbook PDF"}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void uploadPdf(file);
                }}
              />
            </label>
            {sources.length === 0 ? (
              <p className="text-sm text-amber-100">No textbooks yet. Upload a full PDF to index it.</p>
            ) : (
              <ul className="space-y-3">
                {sources.map((source) => (
                  <li key={source.id} className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
                    <p className="font-medium text-white">{source.title}</p>
                    <p className="mt-1 text-sm text-amber-200">{source.page_count} pages indexed</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "chat" && (
          <section className="mt-6 space-y-4">
            <div className="space-y-3">
              {messages.length === 0 && (
                <p className="text-sm text-amber-100">Ask a question that the uploaded textbooks can answer.</p>
              )}
              {messages.map((message) => (
                <p
                  key={message.id}
                  className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "border-amber-200/30 bg-amber-950/40 text-amber-50"
                      : "border-amber-500/30 bg-black text-amber-100"
                  }`}
                >
                  {message.content}
                </p>
              ))}
            </div>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                void ask();
              }}
            >
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                aria-label="Question for this vault"
                placeholder="What does this textbook say about the topic?"
                className="min-h-[48px] flex-1 rounded-2xl border border-amber-500/30 bg-black px-4 text-sm text-amber-50"
              />
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-amber-500/40 bg-amber-950/50 px-5 text-sm text-amber-100 disabled:opacity-50"
              >
                Ask
              </button>
            </form>
          </section>
        )}

        {tab === "studio" && (
          <section className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void generate("study_notes")}
                className="inline-flex min-h-[44px] items-center rounded-full border border-amber-500/40 bg-amber-950/50 px-4 text-sm text-amber-100 disabled:opacity-50"
              >
                Generate study notes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void generate("recall")}
                className="inline-flex min-h-[44px] items-center rounded-full border border-amber-500/30 px-4 text-sm text-amber-100 disabled:opacity-50"
              >
                Generate recall questions
              </button>
            </div>
            {latestNotes ? (
              <article className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-white">{latestNotes.title}</h2>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => downloadNotes("md")} className="text-sm text-amber-100 underline">
                      Download Notes
                    </button>
                    <button type="button" onClick={() => downloadNotes("txt")} className="text-sm text-amber-200 underline">
                      Text
                    </button>
                    <button type="button" onClick={() => downloadNotes("pdf")} className="text-sm text-amber-200 underline">
                      PDF
                    </button>
                  </div>
                </div>
                <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-amber-100">
                  {latestNotes.body_markdown}
                </pre>
              </article>
            ) : (
              <p className="text-sm text-amber-100">Generate study notes after a textbook is uploaded.</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
