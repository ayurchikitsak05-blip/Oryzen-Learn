import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateStudyText } from "@/lib/ai/providers";
import { answerFromTextbook, type TextbookSlice } from "@/lib/vaults/compose";

async function modelText(params: {
  prompt: string;
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}): Promise<{ text: string; budgetBlocked: boolean } | null> {
  const modeled = await generateStudyText({
    prompt: params.prompt,
    userId: params.userId,
    supabase: params.supabase,
    spendClass: "vault_chat",
  });
  if (!modeled || modeled.budgetBlocked || !modeled.text.trim()) {
    return modeled?.budgetBlocked ? { text: "", budgetBlocked: true } : null;
  }
  return { text: modeled.text, budgetBlocked: false };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { vaultId?: string; question?: string };
    const vaultId = body.vaultId?.trim();
    const question = body.question?.trim();
    if (!vaultId || !question) {
      return NextResponse.json(
        { error: "Choose a subject vault and ask a question." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Sign in to use the study chat." }, { status: 401 });
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
    const fallback = answerFromTextbook(question, slices);
    const modeled = await modelText({
      userId: userData.user.id,
      supabase,
      prompt: [
        "Answer the question using only the textbook excerpts. If the excerpts do not contain the answer, say so. Quote the source title.",
        `Question: ${question}`,
        slices.map((slice) => `# ${slice.title}\n${slice.excerpt.slice(0, 12000)}`).join("\n\n"),
      ].join("\n\n"),
    });
    const answer = modeled?.text ?? fallback;

    const { error: userInsertError } = await supabase.from("vault_messages").insert([
      { vault_id: vaultId, user_id: userData.user.id, role: "user", content: question },
      { vault_id: vaultId, user_id: userData.user.id, role: "assistant", content: answer },
    ]);
    if (userInsertError) {
      return NextResponse.json({ error: userInsertError.message }, { status: 500 });
    }

    return NextResponse.json({
      answer,
      grounded: modeled?.text ? "model" : "textbook",
      budgetBlocked: Boolean(modeled?.budgetBlocked),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The question could not be answered.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
