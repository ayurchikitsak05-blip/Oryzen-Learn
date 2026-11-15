import { describe, expect, it, vi } from "vitest";
import {
  captionTracksFromWatchPage,
  compactTranscript,
  fetchYouTubeCaptions,
  linesFromJson3,
  pickCaptionTrack,
} from "../youtube-captions";

const BASE = "https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&sig=abc";
const PAGE = `<html><script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"dQw4w9WgXcQ","title":"Laws of Motion \\"One Shot\\""},"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"${BASE}&lang=hi&kind=asr","name":{"simpleText":"Hindi (auto-generated)"},"languageCode":"hi","kind":"asr"},{"baseUrl":"${BASE}&lang=en","name":{"runs":[{"text":"English"}]},"languageCode":"en"}]}}};</script></html>`;

describe("YouTube subtitles", () => {
  it("finds the subtitle list and the title in a watch page", () => {
    const { tracks, title } = captionTracksFromWatchPage(PAGE);
    expect(title).toBe('Laws of Motion "One Shot"');
    expect(tracks.map((track) => [track.languageCode, track.kind ?? ""])).toEqual([
      ["hi", "asr"],
      ["en", ""],
    ]);
    expect(captionTracksFromWatchPage("<html>nothing</html>").tracks).toEqual([]);
  });

  it("prefers the teacher's own subtitles, then English, then Hindi, then automatic ones", () => {
    const hiAuto = { baseUrl: "a", languageCode: "hi", kind: "asr" };
    const enAuto = { baseUrl: "b", languageCode: "en", kind: "asr" };
    const hi = { baseUrl: "c", languageCode: "hi" };
    const ta = { baseUrl: "d", languageCode: "ta" };
    expect(pickCaptionTrack([hiAuto, enAuto, hi])).toBe(hi);
    expect(pickCaptionTrack([hiAuto, enAuto])).toBe(enAuto);
    expect(pickCaptionTrack([ta, hiAuto])).toBe(ta);
    expect(pickCaptionTrack([])).toBeNull();
  });

  it("reads YouTube's json3 subtitles and groups them about every 30 seconds with times", () => {
    const lines = linesFromJson3({
      events: [
        { tStartMs: 0, segs: [{ utf8: "aaj hum" }, { utf8: " Newton ke laws" }] },
        { tStartMs: 1000 },
        { tStartMs: 12_000, segs: [{ utf8: "padhenge" }] },
        { tStartMs: 45_000, segs: [{ utf8: "first law" }] },
        { tStartMs: 3_700_000, segs: [{ utf8: "late" }] },
      ],
    });
    expect(lines).toHaveLength(4);
    expect(compactTranscript(lines, { maxSeconds: 5400, maxChars: 10_000 })).toBe(
      "[00:00] aaj hum Newton ke laws padhenge\n[00:45] first law\n[1:01:40] late"
    );
    expect(compactTranscript(lines, { maxSeconds: 60, maxChars: 10_000 })).not.toContain("late");
    expect(compactTranscript(lines, { maxSeconds: 5400, maxChars: 20 }).length).toBeLessThanOrEqual(20);
  });

  it("fetches the page then the chosen track; a bot-check page counts as blocked", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("/watch?")
        ? new Response(PAGE)
        : new Response(JSON.stringify({ events: [{ tStartMs: 5000, segs: [{ utf8: "hello class" }] }] }))
    );
    const result = await fetchYouTubeCaptions("dQw4w9WgXcQ", fetchImpl as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: true, language: "en", auto: false, lines: [{ start: 5, text: "hello class" }] });
    expect(String(fetchImpl.mock.calls[1][0])).toContain("lang=en");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("fmt=json3");

    const bot = vi.fn(async () => new Response("<html>Sign in to confirm you're not a bot</html>"));
    expect(await fetchYouTubeCaptions("dQw4w9WgXcQ", bot as unknown as typeof fetch)).toEqual({ ok: false, reason: "blocked" });
    expect(await fetchYouTubeCaptions("bad", bot as unknown as typeof fetch)).toEqual({ ok: false, reason: "unavailable" });
  });
});
