/**
 * Lecture topics from YouTube's own chapter list (owner, 15–17 Nov 2026: free, no AI).
 * Many lectures list their topics with times ("0:00 Intro, 12:40 Newton's 2nd law"), either as
 * YouTube chapters or in the description. The server reads the public video page once; no API
 * key, no AI and no cost. Videos without a chapter list get topics the student marks.
 */

export interface LectureChapter {
  startSeconds: number;
  title: string;
}

export type ChapterFetchResult =
  | { ok: true; chapters: LectureChapter[]; title: string | null; source: "chapters" | "description" }
  | { ok: false; reason: "no_chapters" | "blocked" | "unavailable"; title: string | null };

const MAX_CHAPTERS = 80;
const PAGE_HEADERS = {
  "Accept-Language": "en-US,en;q=0.9",
  // Skips YouTube's cookie-consent page in some regions.
  Cookie: "CONSENT=YES+1; SOCS=CAI",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

function unescapeJsonString(raw: string): string | null {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return null;
  }
}

/** "1:02:03" or "12:40" → seconds; null if it isn't a time. */
export function parseClock(value: string): number | null {
  const parts = value.split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) return null;
  const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  if (s > 59 || (parts.length === 3 && m > 59)) return null;
  return h * 3600 + m * 60 + s;
}

function cleanTitle(value: string): string {
  return value
    .replace(/^[\s\-–—:|•·*>.)\]]+/, "")
    .replace(/[\s\-–—:|•·*(<[]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** Keeps a clean, increasing list; needs at least 2 topics to count as a chapter list. */
function finish(chapters: LectureChapter[]): LectureChapter[] {
  const seen = new Set<number>();
  const sorted = chapters
    .filter((chapter) => chapter.title && Number.isFinite(chapter.startSeconds))
    .sort((a, b) => a.startSeconds - b.startSeconds)
    .filter((chapter) => (seen.has(chapter.startSeconds) ? false : (seen.add(chapter.startSeconds), true)))
    .slice(0, MAX_CHAPTERS);
  return sorted.length >= 2 ? sorted : [];
}

/**
 * Topics written in a video description, one per line, with the time at the start
 * ("12:40 Newton's 2nd law", "(12:40) - Newton's 2nd law") or at the end ("Newton's 2nd law - 12:40").
 */
export function chaptersFromDescription(description: string): LectureChapter[] {
  const chapters: LectureChapter[] = [];
  for (const raw of description.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length > 200) continue;
    const start = /^[\s\-–—•·*>([]*((?:\d{1,2}:)?\d{1,2}:\d{2})[)\]]?\s*(.+)$/.exec(line);
    const end = start ? null : /^(.+?)[\s\-–—:|(]+((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*$/.exec(line);
    const clock = start ? start[1] : end?.[2];
    const text = start ? start[2] : end?.[1];
    if (!clock || !text) continue;
    const seconds = parseClock(clock);
    const title = cleanTitle(text);
    if (seconds == null || !title || /^https?:\/\//i.test(title)) continue;
    chapters.push({ startSeconds: seconds, title });
  }
  return finish(chapters);
}

/** YouTube's own chapter markers in the watch page (including ones YouTube adds itself). */
export function chaptersFromWatchPage(html: string): LectureChapter[] {
  const chapters: LectureChapter[] = [];
  const pattern = /"chapterRenderer":\{"title":\{"simpleText":"((?:[^"\\]|\\.)*)"\},"timeRangeStartMillis":(\d+)/g;
  for (const match of html.matchAll(pattern)) {
    const title = cleanTitle(unescapeJsonString(match[1]) ?? "");
    chapters.push({ startSeconds: Math.floor(Number(match[2]) / 1000), title });
  }
  return finish(chapters);
}

export function descriptionFromWatchPage(html: string): string {
  const match = /"shortDescription":"((?:[^"\\]|\\.)*)"/.exec(html);
  return match ? unescapeJsonString(match[1]) ?? "" : "";
}

export function titleFromWatchPage(html: string): string | null {
  const match = /"videoDetails":\{[^]*?"title":"((?:[^"\\]|\\.)*)"/.exec(html);
  return match ? unescapeJsonString(match[1])?.slice(0, 200) ?? null : null;
}

export async function fetchYouTubeChapters(videoId: string, fetchImpl: typeof fetch = fetch): Promise<ChapterFetchResult> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return { ok: false, reason: "unavailable", title: null };
  const response = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}&hl=en`, { headers: PAGE_HEADERS }).catch(
    () => null
  );
  if (!response?.ok) return { ok: false, reason: response?.status === 429 ? "blocked" : "unavailable", title: null };
  const html = await response.text().catch(() => "");
  if (!html.includes('"videoDetails"')) return { ok: false, reason: "blocked", title: null };
  const title = titleFromWatchPage(html);
  const marked = chaptersFromWatchPage(html);
  if (marked.length > 0) return { ok: true, chapters: marked, title, source: "chapters" };
  const listed = chaptersFromDescription(descriptionFromWatchPage(html));
  if (listed.length > 0) return { ok: true, chapters: listed, title, source: "description" };
  return { ok: false, reason: "no_chapters", title };
}
