import { NextResponse } from "next/server";
import { listGoogleModelIds } from "@/lib/ai/providers";
import { createClient } from "@/lib/supabase/server";

/** Diagnostic for checking which Gemini models the server key can use. Never on Production. */
export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  try {
    const ids = await listGoogleModelIds();
    const flashLite = ids.filter((id) => /flash-lite/i.test(id));
    return NextResponse.json({
      flashLite,
      hasGemini35FlashLite: ids.includes("gemini-3.5-flash-lite"),
      hasGemini25FlashLite: ids.includes("gemini-2.5-flash-lite"),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 240) : "Could not list models.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
