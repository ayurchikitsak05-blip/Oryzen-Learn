import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateStudyText } from "@/lib/ai/providers";
import { composeRecallBank, composeStudyNotes, type TextbookSlice } from "@/lib/vaults/compose";

async function modelText(params: {
  prompt: string;
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}): Promise<{ text: string; budgetBlocked: boolean } | null> {
  const modeled = await generateStudyText({
    prompt: params.prompt,
    userId: params.userId,
    supabase: params.supabase,
    spendClass: "vault_generate",
  });
  if (!modeled || modeled.budgetBlocked || !modeled.text.trim()) {
    return modeled?.budgetBlocked ? { text: "", budgetBlocked: true } : null;
  }
  return { text: modeled.text, budgetBlocked: false };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      vaultId?: string;
      kind?: "study_notes" | "recall";
    };
    const vaultId = body.vaultId?.trim();
    const kind = body.kind === "recall" ? "recall" : "study_notes";
    if (!vaultId) {
      return NextResponse.json({ error: "A subject vault is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Sign in to generate study notes." }, { status: 401 });
    }

    const { data: sources, error: sourceError } = await supabase
      .from("vault_sources")
      .select("title, excerpt")
      .eq("vault_id", vaultId)
      .eq("user_id", userData.user.id);
    if (sourceError) {
      return NextResponse.json(
        { error: "Your learning library isn't ready yet. Please try again in a moment." },
        { status: 503 }
      );
    }

    const slices: TextbookSlice[] = (sources ?? []).map((source) => ({
      title: source.title,
      excerpt: source.excerpt ?? "",
    }));
    const fallback = kind === "recall" ? composeRecallBank(slices) : composeStudyNotes(slices);
    const prompt = [
      "You are a study tutor. Use only the textbook excerpts below.",
      kind === "recall"
        ? "Write an active-recall question bank in Markdown. Each question must be answerable from the excerpts."
        : "Write structured study notes in Markdown with key concepts, chapter summaries, and concise bullets. Stay inside the excerpts.",
      slices.map((slice) => `# ${slice.title}\n${slice.excerpt.slice(0, 12000)}`).join("\n\n"),
    ].join("\n\n");
    const modeled = await modelText({
      prompt,
      userId: userData.user.id,
      supabase,
    });
    const markdown = modeled?.text || fallback;
    const title = kind === "recall" ? "Active recall" : "Study notes";

    const { data: saved, error: saveError } = await supabase
      .from("vault_notes")
      .insert({
        vault_id: vaultId,
        user_id: userData.user.id,
        kind,
        title,
        body_markdown: markdown,
      })
      .select("id, title, body_markdown, kind, created_at")
      .single();
    if (saveError || !saved) {
      return NextResponse.json(
        { error: saveError?.message ?? "The notes could not be saved." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      note: saved,
      grounded: modeled?.text ? "model" : "textbook",
      budgetBlocked: Boolean(modeled?.budgetBlocked),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notes could not be generated.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
