import { NextResponse, type NextRequest } from "next/server";
import { fetchYouTubeChapters } from "@/lib/video/youtube-chapters";

/** A YouTube lecture's own chapter list (free: no AI, no API key). */
export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("v")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ ok: false, reason: "unavailable", chapters: [] }, { status: 400 });
  }
  const result = await fetchYouTubeChapters(videoId).catch(() => null);
  if (!result) return NextResponse.json({ ok: false, reason: "unavailable", chapters: [] });
  if (!result.ok) {
    console.warn(JSON.stringify({ event: "lecture_chapters_missing", videoId, reason: result.reason }));
    return NextResponse.json({ ok: false, reason: result.reason, title: result.title, chapters: [] });
  }
  return NextResponse.json(
    { ok: true, chapters: result.chapters, title: result.title, source: result.source },
    { headers: { "Cache-Control": "private, max-age=3600" } }
  );
}
