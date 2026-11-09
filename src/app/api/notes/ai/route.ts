import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { googleApiKey } from "@/lib/ai/providers";
import { isEntitled } from "@/lib/access/gate";
import { checkPhoto, SHORT_NOTES_MAX_CHARS, SHORT_NOTES_MIN_CHARS } from "@/lib/notes/ai-notes";
import { makeAiNotes, type AiNotesInput } from "@/lib/notes/ai-notes-server";

/** Photo to notes and Short notes (group B). */
export const maxDuration = 150;

function readInput(body: Record<string, unknown>): AiNotesInput | { error: string } {
  if (body.kind === "photo") {
    const image = checkPhoto(body.image);
    return image ? { kind: "photo", image } : { error: "Send one JPEG, PNG or WebP photo under 3 MB." };
  }
  if (body.kind === "short") {
    const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, SHORT_NOTES_MAX_CHARS) : "";
    const chapterTitle = typeof body.chapterTitle === "string" ? body.chapterTitle.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    if (text.length < SHORT_NOTES_MIN_CHARS) {
      return { error: "This chapter has too little text to make short notes (it may be a scanned page)." };
    }
    return { kind: "short", chapterTitle: chapterTitle || "Chapter", text };
  }
  return { error: "Unknown request." };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  const userId = data?.user?.id;
  if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_status")
    .eq("id", userId)
    .maybeSingle()
    .then(
      (res) => res,
      () => ({ data: null })
    );
  const accessStatus = (profile as { access_status?: string | null } | null)?.access_status ?? null;
  if (!isEntitled(accessStatus)) {
    return NextResponse.json({ error: "Choose a plan to use this.", code: "no_plan" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const input = readInput(body);
  if ("error" in input) return NextResponse.json({ error: input.error, code: "bad_request" }, { status: 400 });
  try {
    const outcome = await makeAiNotes({ supabase, userId, accessStatus, apiKey: googleApiKey(), input });
    const { status, ...payload } = outcome;
    return NextResponse.json(payload, { status });
  } catch {
    return NextResponse.json(
      { error: "Notes couldn't be made just now. Please try again later.", code: "server_error" },
      { status: 500 }
    );
  }
}
