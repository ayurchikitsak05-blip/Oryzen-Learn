import type { TimestampedLectureNote } from "@/lib/video/sync-engine";

export type PublicCaptionResult = {
  notes: TimestampedLectureNote[];
  reason: "ok" | "no_public_captions" | "unsupported";
};

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function notesFromTimedTextXml(xml: string, videoId: string): TimestampedLectureNote[] {
  const matches = [...xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)];
  const notes: TimestampedLectureNote[] = [];
  matches.forEach((match, index) => {
    const attrs = match[1] ?? "";
    const start = Number(/start="([^"]+)"/.exec(attrs)?.[1] ?? 0);
    const text = decodeXml(match[2] ?? "");
    if (!text) return;
    const minutes = Math.floor(start / 60);
    const seconds = Math.floor(start % 60);
    const badge = `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}]`;
    notes.push({
      id: `cap-${videoId}-${index}`,
      lectureId: `lec-student-${videoId}`,
      startSeconds: start,
      endSeconds: start + 8,
      timestampBadge: badge,
      heading: text.slice(0, 72),
      speakerTranscript: text,
      studyNoteMarkdown: text,
      highYieldKeyPoint: "",
      modificationHistory: [],
    });
  });
  return notes;
}

export async function fetchPublicYouTubeCaptions(
  videoId: string,
  fetchImpl: typeof fetch = fetch
): Promise<PublicCaptionResult> {
  const id = videoId.trim();
  if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) {
    return { notes: [], reason: "unsupported" };
  }
  const urls = [
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(id)}&lang=en`,
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(id)}&lang=en&kind=asr`,
  ];
  for (const url of urls) {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "application/xml,text/xml,text/plain" },
      });
      if (!response.ok) continue;
      const xml = await response.text();
      const notes = notesFromTimedTextXml(xml, id);
      if (notes.length > 0) return { notes, reason: "ok" };
    } catch {
      // Try the next public caption URL.
    }
  }
  return { notes: [], reason: "no_public_captions" };
}
