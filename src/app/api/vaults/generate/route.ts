import { NextResponse, type NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { composeRecallBank, composeStudyNotes, type TextbookSlice } from "@/lib/vaults/compose";

async function modelText(prompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    const text = response.text?.trim();
    return text || null;
  } catch {
    return null;
  }
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
    const modeled = await modelText(prompt);
    const markdown = modeled ?? fallback;
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
      grounded: modeled ? "model" : "textbook",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notes could not be generated.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
