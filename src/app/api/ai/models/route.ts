import { NextResponse } from "next/server";
import { listGoogleModelIds } from "@/lib/ai/providers";

export async function GET() {
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
