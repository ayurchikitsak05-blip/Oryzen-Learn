import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PrakritiThemePalette } from "@/lib/prakriti/config";
import VideoPlayer from "../VideoPlayer";

const theme = {
  id: "classic",
} as unknown as PrakritiThemePalette;

describe("lecture player", () => {
  it("keeps the same YouTube frame while the lecture clock moves", () => {
    vi.useFakeTimers();
    const onTimeUpdate = vi.fn();
    const view = render(
      <VideoPlayer
        youtubeUrlOrId="https://www.youtube.com/watch?v=M7lc1UVf-VE"
        currentTimeSeconds={258}
        durationSeconds={360}
        onTimeUpdate={onTimeUpdate}
        theme={theme}
      />
    );
    const frame = view.getByTestId("youtube-iframe-player");
    const initial = frame.getAttribute("src");
    expect(initial).toBe("https://www.youtube.com/embed/M7lc1UVf-VE?enablejsapi=1");
    expect(initial).not.toContain("start=");
    fireEvent.click(view.getByTestId("video-play-pause-btn"));
    vi.advanceTimersByTime(3000);
    expect(view.getByTestId("youtube-iframe-player").getAttribute("src")).toBe(initial);
    view.rerender(
      <VideoPlayer
        youtubeUrlOrId="https://www.youtube.com/watch?v=M7lc1UVf-VE"
        currentTimeSeconds={261}
        durationSeconds={360}
        onTimeUpdate={onTimeUpdate}
        theme={theme}
      />
    );
    expect(view.getByTestId("youtube-iframe-player").getAttribute("src")).toBe(initial);
    vi.useRealTimers();
  });
});
