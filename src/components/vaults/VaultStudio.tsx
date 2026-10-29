"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import AppChrome from "@/components/layout/AppChrome";
import { tabClass, ui } from "@/components/ui/classes";
import { registerLeaveGuard } from "@/lib/navigation/app-back";
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
    return "Your learning library isn't ready yet. Please try again in a moment.";
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
  const [budgetBlocked, setBudgetBlocked] = useState(false);

  const load = async () => {
    const response = await fetch(`/api/vaults?id=${encodeURIComponent(vaultId)}`, {
      credentials: "same-origin",
    });
    const json = (await response.json()) as {
      vault?: { title: string };
      sources?: SourceRow[];
      messages?: MessageRow[];
      notes?: NoteRow[];
      error?: string;
    };
    if (response.status === 401) {
      router.push(`/auth?next=/vaults/${vaultId}`);
      return;
    }
    if (!response.ok || !json.vault) {
      setError(describeFailure(json.error ?? "This collection could not be opened."));
      return;
    }
    setTitle(json.vault.title);
    setSources(json.sources ?? []);
    setMessages((json.messages ?? []) as MessageRow[]);
    setNotes(json.notes ?? []);
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

  useEffect(() => {
    return registerLeaveGuard(() =>
      renaming ? "You are renaming this collection. Leave without saving the new title?" : null
    );
  }, [renaming]);

  const saveTitle = async () => {
    const next = title.trim();
    if (!next) return;
    const response = await fetch("/api/vaults", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", id: vaultId, title: next }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) setError(describeFailure(json.error ?? "The collection could not be renamed."));
    else setRenaming(false);
  };

  const uploadPdf = async (file: File) => {
    if (file.type !== "application/pdf") {
      setError("We couldn't upload this file. Please use a PDF and try again.");
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
      const bytes = await file.arrayBuffer();
      const extracted = await extractTextbookText(bytes);
      if (!extracted.excerpt) {
        throw new Error("No readable text was found in this PDF.");
      }
      setStatus("Saving the textbook…");
      const prepared = await fetch("/api/vaults", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare_upload", vaultId }),
      });
      const upload = (await prepared.json()) as {
        sourceId?: string;
        storagePath?: string;
        token?: string;
        error?: string;
      };
      if (!prepared.ok || !upload.sourceId || !upload.storagePath || !upload.token) {
        throw new Error(upload.error ?? "This document could not be stored.");
      }
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(AUTHORIZED_DOCUMENTS_BUCKET)
        .uploadToSignedUrl(upload.storagePath, upload.token, file, {
          contentType: "application/pdf",
        });
      if (uploadError) throw new Error(uploadError.message);
      const registered = await fetch("/api/vaults", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_source",
          vaultId,
          sourceId: upload.sourceId,
          storagePath: upload.storagePath,
          title: file.name.replace(/\.pdf$/i, ""),
          pageCount: extracted.pageCount,
          excerpt: extracted.excerpt,
        }),
      });
      const saved = (await registered.json()) as { error?: string };
      if (!registered.ok) throw new Error(saved.error ?? "The textbook could not be saved.");
      setStatus(null);
      await load();
    } catch (uploadFailure) {
      setStatus(null);
      setError(
        describeFailure(
          uploadFailure instanceof Error ? uploadFailure.message : "We couldn't upload this file. Please check the format and try again."
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
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId, question: trimmed }),
      });
      const payload = (await response.json()) as {
        error?: string;
        answer?: string;
        grounded?: "model" | "textbook";
        budgetBlocked?: boolean;
      };
      if (!response.ok) throw new Error(payload.error ?? "The question could not be answered.");
      setQuestion("");
      setGrounded(payload.grounded ?? null);
      setBudgetBlocked(Boolean(payload.budgetBlocked));
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
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId, kind }),
      });
      const payload = (await response.json()) as {
        error?: string;
        grounded?: "model" | "textbook";
        budgetBlocked?: boolean;
      };
      if (!response.ok) throw new Error(payload.error ?? "Notes could not be generated.");
      setGrounded(payload.grounded ?? null);
      setBudgetBlocked(Boolean(payload.budgetBlocked));
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
    const response = await fetch("/api/vaults", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_chat", id: vaultId }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) setError(describeFailure(json.error ?? "Chat history could not be cleared."));
    else setMessages([]);
    setMenuOpen(false);
  };

  const deleteVault = async () => {
    const response = await fetch("/api/vaults", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: vaultId }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(describeFailure(json.error ?? "The collection could not be removed."));
      return;
    }
    router.push("/vaults");
  };

  return (
    <AppChrome subtitle="My Learning Library">
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
                aria-label="Collection title"
                className={`${ui.input} flex-1 text-2xl font-semibold`}
              />
              <button type="submit" className={ui.ghost}>
                Save
              </button>
            </form>
          ) : (
            <h1 className={`${ui.heading} text-3xl`}>{title || "Learning library"}</h1>
          )}
          <div className="relative">
            <button
              type="button"
              aria-label="Library actions"
              onClick={() => setMenuOpen((open) => !open)}
              className={`${ui.iconBtn} border border-line`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="surface-card absolute right-0 z-20 mt-2 w-48 p-2 shadow-[0_16px_40px_-24px_rgba(32,36,43,0.45)]">
                <button
                  type="button"
                  className="block min-h-11 w-full rounded-xl px-3 text-left text-sm hover:bg-beige-2"
                  onClick={() => {
                    setRenaming(true);
                    setMenuOpen(false);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="block min-h-11 w-full rounded-xl px-3 text-left text-sm hover:bg-beige-2"
                  onClick={() => void clearChat()}
                >
                  Clear chat history
                </button>
                <button
                  type="button"
                  className="block min-h-11 w-full rounded-xl px-3 text-left text-sm text-danger hover:bg-danger-bg"
                  onClick={() => void deleteVault()}
                >
                  Delete from library
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
              className={tabClass(tab === id)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p className={`${ui.alert} mt-4`}>{error}</p>
        )}
        {status && <p className="mt-4 text-sm text-muted">{status}</p>}
        {grounded === "textbook" && (
          <p className="mt-3 text-xs text-muted" data-testid="vault-fallback-banner">
            {budgetBlocked
              ? "This month's study AI budget is used up. Showing notes from your textbook so you can keep studying."
              : "Composed from the textbook text. A study model was not used for this response."}
          </p>
        )}

        {tab === "sources" && (
          <section className="mt-6 space-y-4">
            <label className={`${ui.primary} cursor-pointer`}>
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
              <p className={ui.empty}>Your library is ready. Add your first document to begin.</p>
            ) : (
              <ul className="space-y-3">
                {sources.map((source) => (
                  <li key={source.id} className={`${ui.card} p-4`}>
                    <p className="font-medium text-heading">{source.title}</p>
                    <p className="mt-1 text-sm text-muted">{source.page_count} pages indexed</p>
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
                <p className="text-sm text-muted">Ask a question that the uploaded textbooks can answer.</p>
              )}
              {messages.map((message) => (
                <p
                  key={message.id}
                  className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                    message.role === "user" ? ui.selected : ui.idle
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
                aria-label="Question for this collection"
                placeholder="What does this textbook say about the topic?"
                className={`${ui.input} flex-1`}
              />
              <button
                type="submit"
                disabled={busy}
                className={`${ui.primary} disabled:opacity-50`}
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
                className={`${ui.primary} disabled:opacity-50`}
              >
                Generate study notes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void generate("recall")}
                className={`${ui.secondary} disabled:opacity-50`}
              >
                Generate recall questions
              </button>
            </div>
            {latestNotes ? (
              <article className={ui.cardPad}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className={`${ui.heading} text-lg`}>{latestNotes.title}</h2>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => downloadNotes("md")} className="text-sm text-heading underline">
                      Download Notes
                    </button>
                    <button type="button" onClick={() => downloadNotes("txt")} className="text-sm text-muted underline">
                      Text
                    </button>
                    <button type="button" onClick={() => downloadNotes("pdf")} className="text-sm text-muted underline">
                      PDF
                    </button>
                  </div>
                </div>
                <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">
                  {latestNotes.body_markdown}
                </pre>
              </article>
            ) : (
              <p className={ui.empty}>Add a document first, then generate study notes from it.</p>
            )}
          </section>
        )}
      </main>
    </AppChrome>
  );
}
