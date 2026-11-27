import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signedInClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Most cards one import request may save; the browser sends bigger decks in batches. */
const IMPORT_BATCH = 500;

function missingTable(message: string): boolean {
  return /note_subjects|study_notes|schema cache|does not exist/i.test(message);
}

export async function GET() {
  const { supabase, user } = await signedInClient();
  if (!user) {
    return NextResponse.json({ error: "Sign in to keep your notes." }, { status: 401 });
  }

  const subjects = await supabase
    .from("note_subjects")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (subjects.error) {
    return NextResponse.json(
      {
        error: missingTable(subjects.error.message)
          ? "My Notes isn't ready yet. Please try again in a moment."
          : subjects.error.message,
      },
      { status: 500 }
    );
  }

  const notes = await supabase
    .from("study_notes")
    .select("id, subject_id, title, body, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (notes.error) {
    return NextResponse.json({ error: notes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    subjects: subjects.data ?? [],
    notes: notes.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await signedInClient();
  if (!user) {
    return NextResponse.json({ error: "Sign in to keep your notes." }, { status: 401 });
  }

  const body = (await request.json()) as {
    action?:
      | "create_subject"
      | "create_note"
      | "delete_subject"
      | "delete_note"
      | "save_passage"
      | "import_notes";
    title?: string;
    notes?: Array<{ title?: unknown; body?: unknown }>;
    noteBody?: string;
    subjectId?: string;
    subjectTitle?: string;
    id?: string;
  };

  if (body.action === "create_subject") {
    const title = body.title?.trim() ?? "";
    if (!title) {
      return NextResponse.json({ error: "Name the subject first." }, { status: 400 });
    }
    // A subject with this name already? Reuse it ("Hindi" was created 3 times in one second
    // by repeated taps: manual test, 18 Nov 2026).
    const { data: sameName } = await supabase
      .from("note_subjects")
      .select("id, title")
      .eq("user_id", user.id);
    const match = (sameName ?? []).find(
      (row: { id: string; title: string | null }) => (row.title ?? "").trim().toLowerCase() === title.toLowerCase()
    );
    if (match) return NextResponse.json({ id: match.id, existing: true });
    const { data, error } = await supabase
      .from("note_subjects")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "The subject could not be created." },
        { status: 400 }
      );
    }
    return NextResponse.json({ id: data.id });
  }

  if (body.action === "import_notes") {
    // Anki import (27 Nov 2026): many notes in one request, into the subject named after the deck.
    const subjectTitle = (body.subjectTitle?.trim() || "Imported deck").slice(0, 120);
    const incoming = Array.isArray(body.notes) ? body.notes : [];
    if (incoming.length === 0) return NextResponse.json({ error: "There were no cards to import." }, { status: 400 });
    if (incoming.length > IMPORT_BATCH) {
      return NextResponse.json({ error: `Import at most ${IMPORT_BATCH} cards at a time.` }, { status: 400 });
    }
    const { data: subjects, error: subjectsError } = await supabase
      .from("note_subjects")
      .select("id, title")
      .eq("user_id", user.id);
    if (subjectsError) return NextResponse.json({ error: subjectsError.message }, { status: 400 });
    let subjectId =
      (subjects ?? []).find(
        (row: { id: string; title: string | null }) => (row.title ?? "").trim().toLowerCase() === subjectTitle.toLowerCase()
      )?.id ?? null;
    if (!subjectId) {
      const created = await supabase
        .from("note_subjects")
        .insert({ user_id: user.id, title: subjectTitle })
        .select("id")
        .single();
      if (created.error || !created.data) {
        return NextResponse.json({ error: created.error?.message ?? "The subject could not be created." }, { status: 400 });
      }
      subjectId = created.data.id;
    }
    const rows = incoming
      .map((note) => ({
        subject_id: subjectId,
        user_id: user.id,
        title: typeof note.title === "string" ? note.title.trim().slice(0, 300) : "",
        body: typeof note.body === "string" ? note.body.trim().slice(0, 5000) : "",
      }))
      .filter((row) => row.title);
    if (rows.length === 0) return NextResponse.json({ error: "There were no cards to import." }, { status: 400 });
    const { error } = await supabase.from("study_notes").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ subjectId, imported: rows.length });
  }

  if (body.action === "save_passage") {
    const title = body.title?.trim() ?? "";
    const subjectTitle = body.subjectTitle?.trim() || "Saved passages";
    if (!title) {
      return NextResponse.json(
        { error: "Name the saved passage before keeping it." },
        { status: 400 }
      );
    }

    const existing = await supabase
      .from("note_subjects")
      .select("id")
      .eq("user_id", user.id)
      .eq("title", subjectTitle)
      .maybeSingle();
    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 400 });
    }

    let subjectId = existing.data?.id ?? null;
    if (!subjectId) {
      const created = await supabase
        .from("note_subjects")
        .insert({ user_id: user.id, title: subjectTitle })
        .select("id")
        .single();
      if (created.error || !created.data) {
        return NextResponse.json(
          { error: created.error?.message ?? "The subject could not be created." },
          { status: 400 }
        );
      }
      subjectId = created.data.id;
    }

    const { data, error } = await supabase
      .from("study_notes")
      .insert({
        subject_id: subjectId,
        user_id: user.id,
        title,
        body: body.noteBody?.trim() ?? "",
      })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "The note could not be saved." },
        { status: 400 }
      );
    }
    return NextResponse.json({ id: data.id, subjectId });
  }

  if (body.action === "create_note") {
    const title = body.title?.trim() ?? "";
    if (!body.subjectId || !title) {
      return NextResponse.json({ error: "Choose a subject and name the note." }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("study_notes")
      .insert({
        subject_id: body.subjectId,
        user_id: user.id,
        title,
        body: body.noteBody?.trim() ?? "",
      })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "The note could not be saved." },
        { status: 400 }
      );
    }
    return NextResponse.json({ id: data.id });
  }

  if (body.action === "delete_subject" && body.id) {
    const { error } = await supabase.from("note_subjects").delete().eq("id", body.id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete_note" && body.id) {
    const { error } = await supabase.from("study_notes").delete().eq("id", body.id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown notes action." }, { status: 400 });
}
