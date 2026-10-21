import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AUTHORIZED_DOCUMENTS_BUCKET } from "@/lib/supabase/storage";
import { isOwnedVaultPath, vaultStoragePath } from "@/lib/vaults/paths";

async function signedInClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function missingTable(message: string): boolean {
  return /subject_vaults|vault_sources|vault_messages|vault_notes|schema cache|does not exist/i.test(
    message
  );
}

function tableError(message: string, fallback: string) {
  return missingTable(message)
    ? "Your learning library isn't ready yet. Please try again in a moment."
    : message || fallback;
}

export async function GET(request: NextRequest) {
  const { supabase, user } = await signedInClient();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to open your learning library." },
      { status: 401 }
    );
  }

  const vaultId = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!vaultId) {
    const vaults = await supabase
      .from("subject_vaults")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (vaults.error) {
      return NextResponse.json(
        { error: tableError(vaults.error.message, "Your library could not be opened.") },
        { status: 500 }
      );
    }
    return NextResponse.json({ vaults: vaults.data ?? [] });
  }

  const vault = await supabase
    .from("subject_vaults")
    .select("id, title, updated_at")
    .eq("id", vaultId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (vault.error) {
    return NextResponse.json(
      { error: tableError(vault.error.message, "This collection could not be opened.") },
      { status: 500 }
    );
  }
  if (!vault.data) {
    return NextResponse.json({ error: "This collection could not be opened." }, { status: 404 });
  }

  const [sources, messages, notes] = await Promise.all([
    supabase
      .from("vault_sources")
      .select("id, title, storage_path, page_count, created_at")
      .eq("vault_id", vaultId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("vault_messages")
      .select("id, role, content, created_at")
      .eq("vault_id", vaultId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("vault_notes")
      .select("id, kind, title, body_markdown, created_at")
      .eq("vault_id", vaultId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);
  const firstError = sources.error ?? messages.error ?? notes.error;
  if (firstError) {
    return NextResponse.json(
      { error: tableError(firstError.message, "This collection could not be opened.") },
      { status: 500 }
    );
  }

  return NextResponse.json({
    vault: vault.data,
    sources: sources.data ?? [],
    messages: messages.data ?? [],
    notes: notes.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await signedInClient();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to use your learning library." },
      { status: 401 }
    );
  }

  const body = (await request.json()) as {
    action?:
      | "create"
      | "rename"
      | "delete"
      | "clear_chat"
      | "prepare_upload"
      | "register_source";
    title?: string;
    id?: string;
    vaultId?: string;
    fileName?: string;
    sourceId?: string;
    storagePath?: string;
    pageCount?: number;
    excerpt?: string;
  };

  if (body.action === "create") {
    const title = body.title?.trim() ?? "";
    if (!title) {
      return NextResponse.json({ error: "Name the collection first." }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("subject_vaults")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: tableError(error?.message ?? "", "This collection could not be created.") },
        { status: 400 }
      );
    }
    return NextResponse.json({ id: data.id });
  }

  if (body.action === "rename" && body.id) {
    const title = body.title?.trim() ?? "";
    if (!title) {
      return NextResponse.json({ error: "Name the collection first." }, { status: 400 });
    }
    const { error } = await supabase
      .from("subject_vaults")
      .update({ title })
      .eq("id", body.id)
      .eq("user_id", user.id);
    if (error) {
      return NextResponse.json(
        { error: tableError(error.message, "The collection could not be renamed.") },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete" && body.id) {
    const { data: sources } = await supabase
      .from("vault_sources")
      .select("storage_path")
      .eq("vault_id", body.id)
      .eq("user_id", user.id);
    const paths = (sources ?? [])
      .map((source) => source.storage_path)
      .filter((path): path is string => Boolean(path));
    if (paths.length > 0) {
      await supabase.storage.from(AUTHORIZED_DOCUMENTS_BUCKET).remove(paths);
    }
    const { error } = await supabase
      .from("subject_vaults")
      .delete()
      .eq("id", body.id)
      .eq("user_id", user.id);
    if (error) {
      return NextResponse.json(
        { error: tableError(error.message, "The collection could not be removed.") },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "clear_chat" && body.id) {
    const { error } = await supabase
      .from("vault_messages")
      .delete()
      .eq("vault_id", body.id)
      .eq("user_id", user.id);
    if (error) {
      return NextResponse.json(
        { error: tableError(error.message, "Chat history could not be cleared.") },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "prepare_upload") {
    const vaultId = body.vaultId?.trim() ?? "";
    if (!vaultId) {
      return NextResponse.json({ error: "A collection is required." }, { status: 400 });
    }
    const { data: vault } = await supabase
      .from("subject_vaults")
      .select("id")
      .eq("id", vaultId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!vault) {
      return NextResponse.json({ error: "This collection could not be opened." }, { status: 404 });
    }
    const sourceId = crypto.randomUUID();
    const storagePath = vaultStoragePath(user.id, vaultId, sourceId);
    const { data, error } = await supabase.storage
      .from(AUTHORIZED_DOCUMENTS_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !data?.signedUrl || !data.token) {
      return NextResponse.json(
        {
          error:
            error?.message ??
            "This document could not be stored. Please check the format and try again.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({
      sourceId,
      storagePath,
      signedUrl: data.signedUrl,
      token: data.token,
    });
  }

  if (body.action === "register_source") {
    const vaultId = body.vaultId?.trim() ?? "";
    const sourceId = body.sourceId?.trim() ?? "";
    const storagePath = body.storagePath?.trim() ?? "";
    const title = body.title?.trim() || "Textbook";
    const pageCount = Number.isFinite(body.pageCount) ? Math.max(0, Number(body.pageCount)) : 0;
    const excerpt = body.excerpt?.trim() ?? "";
    if (!vaultId || !sourceId || !storagePath || !excerpt) {
      return NextResponse.json(
        { error: "The textbook could not be saved. Please try again." },
        { status: 400 }
      );
    }
    if (!isOwnedVaultPath(storagePath, user.id, vaultId)) {
      return NextResponse.json({ error: "That file does not belong to this collection." }, { status: 400 });
    }
    const { data: vault } = await supabase
      .from("subject_vaults")
      .select("id")
      .eq("id", vaultId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!vault) {
      return NextResponse.json({ error: "This collection could not be opened." }, { status: 404 });
    }
    const { error } = await supabase.from("vault_sources").insert({
      id: sourceId,
      vault_id: vaultId,
      user_id: user.id,
      title,
      storage_path: storagePath,
      page_count: pageCount,
      excerpt,
    });
    if (error) {
      return NextResponse.json(
        { error: tableError(error.message, "The textbook could not be saved.") },
        { status: 400 }
      );
    }
    return NextResponse.json({ id: sourceId });
  }

  return NextResponse.json({ error: "Unknown library action." }, { status: 400 });
}
