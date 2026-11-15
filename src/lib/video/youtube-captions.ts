/**
 * Reads a public YouTube video's subtitles, including YouTube's auto-generated ones
 * (owner, 15 Nov 2026: lecture headings come from subtitles, not from watching the video).
 * Free: no AI and no Google API key. Server side only (YouTube doesn't allow it from the browser).
 */

export interface CaptionLine {
  start: number;
  text: string;
}

export interface CaptionTrackInfo {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: string;
}

export type CaptionFetchResult =
  | { ok: true; lines: CaptionLine[]; language: string; auto: boolean; title: string | null }
  | { ok: false; reason: "no_captions" | "blocked" | "unavailable" };

const WATCH_HEADERS = {
  "Accept-Language": "en-US,en;q=0.9",
  // Skips YouTube's cookie-consent page in some regions.
  Cookie: "CONSENT=YES+1; SOCS=CAI",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Finds a JSON value that starts at `start` (an object or array) in a page, by matching brackets. */
function sliceJson(text: string, start: number): string | null {
  const open = text[start];
  const close = open === "[" ? "]" : open === "{" ? "}" : null;
  if (!close) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length && i - start < 400_000; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[" || ch === "{") depth += 1;
    else if (ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** The subtitle tracks listed in a watch page, plus the video title. */
export function captionTracksFromWatchPage(html: string): { tracks: CaptionTrackInfo[]; title: string | null } {
  let title: string | null = null;
  const titleMatch = /"videoDetails":\{[^]*?"title":"((?:[^"\\]|\\.)*)"/.exec(html);
  if (titleMatch) {
    try {
      title = JSON.parse(`"${titleMatch[1]}"`) as string;
    } catch {
      title = null;
    }
  }
  const at = html.indexOf('"captionTracks":');
  if (at < 0) return { tracks: [], title };
  const json = sliceJson(html, at + '"captionTracks":'.length);
  if (!json) return { tracks: [], title };
  try {
    const raw = JSON.parse(json) as Array<Record<string, unknown>>;
    const tracks = raw
      .map((track) => ({
        baseUrl: typeof track.baseUrl === "string" ? track.baseUrl : "",
        languageCode: typeof track.languageCode === "string" ? track.languageCode : "",
        kind: typeof track.kind === "string" ? track.kind : undefined,
        name:
          track.name && typeof track.name === "object"
            ? String((track.name as { simpleText?: string; runs?: Array<{ text?: string }> }).simpleText ??
                (track.name as { runs?: Array<{ text?: string }> }).runs?.map((run) => run.text ?? "").join("") ??
                "")
            : undefined,
      }))
      .filter((track) => track.baseUrl.startsWith("https://www.youtube.com/api/timedtext"));
    return { tracks, title };
  } catch {
    return { tracks: [], title };
  }
}

/**
 * Which subtitles to use: the teacher's own before YouTube's automatic ones; English, then Hindi,
 * then any other language.
 */
export function pickCaptionTrack(tracks: CaptionTrackInfo[]): CaptionTrackInfo | null {
  if (tracks.length === 0) return null;
  const rank = (track: CaptionTrackInfo) => {
    const lang = track.languageCode.toLowerCase();
    const langRank = lang.startsWith("en") ? 0 : lang.startsWith("hi") ? 1 : 2;
    const autoRank = track.kind === "asr" ? 1 : 0;
    return autoRank * 10 + langRank;
  };
  return tracks.slice().sort((a, b) => rank(a) - rank(b))[0];
}

/** YouTube's "json3" subtitle format → lines with start seconds. */
export function linesFromJson3(raw: unknown): CaptionLine[] {
  const events = (raw && typeof raw === "object" ? (raw as { events?: unknown }).events : null) ?? [];
  if (!Array.isArray(events)) return [];
  const lines: CaptionLine[] = [];
  for (const event of events) {
    const row = (event && typeof event === "object" ? event : {}) as { tStartMs?: number; segs?: Array<{ utf8?: string }> };
    if (!Array.isArray(row.segs)) continue;
    const text = row.segs.map((seg) => seg.utf8 ?? "").join("").replace(/\s+/g, " ").trim();
    if (!text) continue;
    lines.push({ start: Math.max(0, (row.tStartMs ?? 0) / 1000), text });
  }
  return lines;
}

/** YouTube's XML subtitle format → lines with start seconds. */
export function linesFromXml(xml: string): CaptionLine[] {
  return [...xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)]
    .map((match) => ({
      start: Number(/start="([^"]+)"/.exec(match[1] ?? "")?.[1] ?? 0) || 0,
      text: decodeEntities(match[2] ?? ""),
    }))
    .filter((line) => line.text);
}

async function readTrack(track: CaptionTrackInfo, fetchImpl: typeof fetch): Promise<CaptionLine[]> {
  const url = new URL(track.baseUrl);
  url.searchParams.set("fmt", "json3");
  const response = await fetchImpl(url.toString(), { headers: WATCH_HEADERS }).catch(() => null);
  if (!response?.ok) return [];
  const body = await response.text().catch(() => "");
  if (!body.trim()) return [];
  if (body.trimStart().startsWith("{")) {
    try {
      return linesFromJson3(JSON.parse(body));
    } catch {
      return [];
    }
  }
  return linesFromXml(body);
}

export async function fetchYouTubeCaptions(videoId: string, fetchImpl: typeof fetch = fetch): Promise<CaptionFetchResult> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return { ok: false, reason: "unavailable" };
  const page = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}&hl=en`, { headers: WATCH_HEADERS }).catch(() => null);
  if (!page?.ok) return { ok: false, reason: page && page.status === 429 ? "blocked" : "unavailable" };
  const html = await page.text().catch(() => "");
  if (!html.includes('"videoDetails"')) {
    // A "confirm you're not a bot" or consent page instead of the video.
    return { ok: false, reason: "blocked" };
  }
  const { tracks, title } = captionTracksFromWatchPage(html);
  const track = pickCaptionTrack(tracks);
  if (!track) return { ok: false, reason: "no_captions" };
  const lines = await readTrack(track, fetchImpl);
  if (lines.length === 0) return { ok: false, reason: "no_captions" };
  return { ok: true, lines, language: track.languageCode, auto: track.kind === "asr", title };
}

function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The subtitles as compact text for the AI: one line about every 30 seconds, each starting with
 * its time, cut at `maxSeconds` and `maxChars` (which caps the cost of one lecture).
 */
export function compactTranscript(lines: CaptionLine[], options: { maxSeconds: number; maxChars: number }): string {
  const out: string[] = [];
  let bucketStart = -1;
  let bucket: string[] = [];
  let length = 0;
  const flush = () => {
    if (bucketStart < 0 || bucket.length === 0) return;
    const line = `[${clock(bucketStart)}] ${bucket.join(" ")}`;
    out.push(line);
    length += line.length + 1;
    bucket = [];
    bucketStart = -1;
  };
  for (const line of lines) {
    if (line.start > options.maxSeconds) break;
    if (bucketStart < 0) bucketStart = line.start;
    else if (line.start - bucketStart >= 30) {
      flush();
      if (length >= options.maxChars) break;
      bucketStart = line.start;
    }
    bucket.push(line.text);
  }
  if (length < options.maxChars) flush();
  return out.join("\n").slice(0, options.maxChars);
}
