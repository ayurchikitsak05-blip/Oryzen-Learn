import { NextResponse, type NextRequest } from "next/server";
import { fetchPublicYouTubeCaptions } from "@/lib/video/public-captions";

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("v")?.trim() ?? "";
  const result = await fetchPublicYouTubeCaptions(videoId);
  return NextResponse.json(result);
}
