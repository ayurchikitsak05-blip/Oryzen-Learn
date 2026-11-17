import { describe, expect, it, vi } from "vitest";
import {
  chaptersFromDescription,
  chaptersFromWatchPage,
  descriptionFromWatchPage,
  fetchYouTubeChapters,
  parseClock,
  titleFromWatchPage,
} from "../youtube-chapters";
import {
  currentTopicId,
  isTopicsOnly,
  markTopic,
  removeTopic,
  topicsAsOutline,
  topicsFromChapters,
} from "../lecture-topics";

const DESCRIPTION = [
  "Complete NLM in one shot 🔥",
  "Timestamps:",
  "0:00 Introduction",
  "05:12 - Newton's First Law (Inertia)",
  "(12:40) Newton's 2nd law",
  "Free body diagrams – 1:02:03",
  "Join our Telegram: https://t.me/x",
  "Call 98765 43210",
].join("\n");

function watchPage(extra = "") {
  return `<script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"abcdefghijk","title":"Laws of Motion \\"One Shot\\"","shortDescription":${JSON.stringify(
    DESCRIPTION
  )}}};</script>${extra}`;
}

describe("lecture chapters from YouTube (free)", () => {
  it("reads times in mm:ss and h:mm:ss", () => {
    expect(parseClock("12:40")).toBe(760);
    expect(parseClock("1:02:03")).toBe(3723);
    expect(parseClock("12:75")).toBeNull();
    expect(parseClock("12")).toBeNull();
  });

  it("finds topics in a description with the time at the start or the end", () => {
    expect(chaptersFromDescription(DESCRIPTION)).toEqual([
      { startSeconds: 0, title: "Introduction" },
      { startSeconds: 312, title: "Newton's First Law (Inertia)" },
      { startSeconds: 760, title: "Newton's 2nd law" },
      { startSeconds: 3723, title: "Free body diagrams" },
    ]);
    expect(chaptersFromDescription("Only one 0:00 line")).toEqual([]);
  });

  it("prefers YouTube's own chapter markers", () => {
    const markers =
      '"chapterRenderer":{"title":{"simpleText":"Intro"},"timeRangeStartMillis":0,"x":1}' +
      '"chapterRenderer":{"title":{"simpleText":"Friction \\u0026 more"},"timeRangeStartMillis":95000}';
    expect(chaptersFromWatchPage(markers)).toEqual([
      { startSeconds: 0, title: "Intro" },
      { startSeconds: 95, title: "Friction & more" },
    ]);
    expect(titleFromWatchPage(watchPage())).toBe('Laws of Motion "One Shot"');
    expect(descriptionFromWatchPage(watchPage())).toBe(DESCRIPTION);
  });

  it("fetches the public page once: chapters, then description, else none", async () => {
    const page = vi.fn(async () => new Response(watchPage()));
    const result = await fetchYouTubeChapters("abcdefghijk", page as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: true, source: "description", title: 'Laws of Motion "One Shot"' });
    expect(page).toHaveBeenCalledTimes(1);

    const bare = vi.fn(async () => new Response('{"videoDetails":{"title":"x","shortDescription":"no times"}}'));
    expect(await fetchYouTubeChapters("abcdefghijk", bare as unknown as typeof fetch)).toMatchObject({ ok: false, reason: "no_chapters" });
    const bot = vi.fn(async () => new Response("<html>confirm you're not a bot</html>"));
    expect(await fetchYouTubeChapters("abcdefghijk", bot as unknown as typeof fetch)).toMatchObject({ ok: false, reason: "blocked" });
    expect(await fetchYouTubeChapters("bad", bot as unknown as typeof fetch)).toMatchObject({ ok: false, reason: "unavailable" });
  });
});

describe("lecture topics and Mark topic", () => {
  const chapters = [
    { startSeconds: 0, title: "Intro" },
    { startSeconds: 300, title: "First law" },
  ];

  it("turns chapters into tappable topics that run until the next one", () => {
    const topics = topicsFromChapters("lec-student-1", chapters);
    expect(topics.map((topic) => [topic.timestampBadge, topic.heading, topic.endSeconds])).toEqual([
      ["[00:00]", "Intro", 300],
      ["[05:00]", "First law", 900],
    ]);
    expect(isTopicsOnly(topics)).toBe(true);
    expect(currentTopicId(topics, 450)).toBe(topics[1].id);
  });

  it("adds a student's topic at the current time and can remove it", () => {
    const topics = topicsFromChapters("lec-student-1", chapters);
    const marked = markTopic(topics, { lectureId: "lec-student-1", seconds: 125.7, heading: "  Mass  vs weight ", now: 1 });
    expect(marked?.map((topic) => topic.heading)).toEqual(["Intro", "Mass vs weight", "First law"]);
    expect(marked?.[1]).toMatchObject({ startSeconds: 125, timestampBadge: "[02:05]", endSeconds: 300 });
    expect(markTopic(topics, { lectureId: "x", seconds: 5, heading: "   " })).toBeNull();
    expect(removeTopic(marked!, marked![1].id)).toHaveLength(2);
  });

  it("saves topics to My Notes as an Outline note", () => {
    expect(topicsAsOutline(topicsFromChapters("l", chapters))).toBe("Format: Outline\n- [00:00] Intro\n- [05:00] First law");
  });
});
