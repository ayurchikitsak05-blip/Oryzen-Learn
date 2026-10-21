import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signedInClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

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
          ? "Your notebook isn't ready yet. Please try again in a moment."
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
    action?: "create_subject" | "create_note" | "delete_subject" | "delete_note";
    title?: string;
    noteBody?: string;
    subjectId?: string;
    id?: string;
  };

  if (body.action === "create_subject") {
    const title = body.title?.trim() ?? "";
    if (!title) {
      return NextResponse.json({ error: "Name the subject first." }, { status: 400 });
    }
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
