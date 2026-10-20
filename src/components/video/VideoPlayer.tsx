"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  FastForward,
  FileVideo,
  Link2,
  Pause,
  Play,
  RotateCcw,
  Video,
} from "lucide-react";
import type { PrakritiThemePalette } from "@/lib/prakriti/config";
import {
  detectVideoRewindFriction,
  extractYouTubeVideoId,
  formatTimestampBadge,
} from "@/lib/video/sync-engine";

export interface VideoPlayerProps {
  youtubeUrlOrId: string | null;
  currentTimeSeconds: number;
  durationSeconds: number;
  onTimeUpdate: (seconds: number) => void;
  onRewindFriction?: (fromSeconds: number, toSeconds: number) => void;
  onChangeYouTubeUrl?: (newUrl: string, extractedId: string) => void;
  theme: PrakritiThemePalette;
}

export default function VideoPlayer({
  youtubeUrlOrId,
  currentTimeSeconds,
  durationSeconds,
  onTimeUpdate,
  onRewindFriction,
  onChangeYouTubeUrl,
}: VideoPlayerProps) {
  const [sourceMode, setSourceMode] = useState<"youtube" | "local_mp4">(
    "youtube"
  );
  const [urlInput, setUrlInput] = useState<string>(
    youtubeUrlOrId ?? "https://www.youtube.com/watch?v=M7lc1UVf-VE"
  );
  const [activeYouTubeId, setActiveYouTubeId] = useState<string>(
    extractYouTubeVideoId(youtubeUrlOrId ?? "") ?? "M7lc1UVf-VE"
  );
  const [localVideoObjectUrl, setLocalVideoObjectUrl] = useState<string | null>(
    null
  );
  const [localVideoName, setLocalVideoName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastTrackedTimeRef = useRef<number>(currentTimeSeconds);

  useEffect(() => {
    if (
      sourceMode === "local_mp4" &&
      htmlVideoRef.current &&
      Math.abs(htmlVideoRef.current.currentTime - currentTimeSeconds) > 1.5
    ) {
      htmlVideoRef.current.currentTime = currentTimeSeconds;
    }
    lastTrackedTimeRef.current = currentTimeSeconds;
  }, [currentTimeSeconds, sourceMode]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      const next = Math.min(durationSeconds, lastTrackedTimeRef.current + 1);
      lastTrackedTimeRef.current = next;
      onTimeUpdate(next);
      if (next >= durationSeconds) {
        setIsPlaying(false);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isPlaying, durationSeconds, onTimeUpdate]);

  useEffect(() => {
    return () => {
      if (localVideoObjectUrl) {
        URL.revokeObjectURL(localVideoObjectUrl);
      }
    };
  }, [localVideoObjectUrl]);

  const handleLoadYouTubeUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractYouTubeVideoId(urlInput);
    if (id) {
      setSourceMode("youtube");
      setActiveYouTubeId(id);
      onChangeYouTubeUrl?.(urlInput, id);
      onTimeUpdate(0);
    }
  };

  const handleLocalMp4Select = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (localVideoObjectUrl) {
      URL.revokeObjectURL(localVideoObjectUrl);
    }
    const objUrl = URL.createObjectURL(file);
    setLocalVideoObjectUrl(objUrl);
    setLocalVideoName(file.name);
    setSourceMode("local_mp4");
    onTimeUpdate(0);
  };

  const handleScrubOrRewind = (targetSeconds: number) => {
    const clamped = Math.min(Math.max(0, targetSeconds), durationSeconds);
    const prev = lastTrackedTimeRef.current;
    const friction = detectVideoRewindFriction(prev, clamped);
    if (friction.isRewindFriction) {
      onRewindFriction?.(prev, clamped);
    }
    lastTrackedTimeRef.current = clamped;
    onTimeUpdate(clamped);
  };

  return (
    <div className="space-y-5 backdrop-blur-xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl shadow-xl shadow-zinc-950/5 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSourceMode("youtube")}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-all active:scale-95 ${
              sourceMode === "youtube"
                ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                : "border border-zinc-200/60 dark:border-zinc-800/60 text-zinc-600 dark:text-zinc-300"
            }`}
          >
            <Video className="h-4 w-4" />
            YouTube
          </button>

          <label
            className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-all active:scale-95 ${
              sourceMode === "local_mp4"
                ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                : "border border-zinc-200/60 dark:border-zinc-800/60 text-zinc-600 dark:text-zinc-300"
            }`}
          >
            <FileVideo className="h-4 w-4" />
            Local file
            <input
              type="file"
              accept="video/mp4,video/webm"
              onChange={handleLocalMp4Select}
              className="hidden"
            />
          </label>
        </div>

        <span className="text-xs text-zinc-500">
          {formatTimestampBadge(currentTimeSeconds)} /{" "}
          {formatTimestampBadge(durationSeconds)}
        </span>
      </div>

      {sourceMode === "youtube" && (
        <form onSubmit={handleLoadYouTubeUrl} className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute top-3.5 left-3 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              aria-label="YouTube Lecture Link"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste a lecture link"
              className="min-h-[44px] w-full rounded-full border border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-800/60 pr-4 pl-9 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 px-5 py-2 text-xs font-medium hover:opacity-90 transition-all active:scale-95"
          >
            Load
          </button>
        </form>
      )}

      <div className="relative aspect-video overflow-hidden rounded-2xl bg-zinc-950">
        {sourceMode === "youtube" ? (
          <iframe
            data-testid="youtube-iframe-player"
            title="YouTube Lecture Player"
            src={`https://www.youtube.com/embed/${activeYouTubeId}?enablejsapi=1&start=${Math.floor(
              currentTimeSeconds
            )}`}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : localVideoObjectUrl ? (
          <video
            ref={htmlVideoRef}
            data-testid="local-mp4-player"
            src={localVideoObjectUrl}
            controls
            onTimeUpdate={(e) => {
              const sec = Math.floor(e.currentTarget.currentTime);
              handleScrubOrRewind(sec);
            }}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-sm text-zinc-400">
            <FileVideo className="mb-2 h-8 w-8 opacity-70" />
            <p>{localVideoName ?? "Choose a lecture file from this device."}</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="video-play-pause-btn"
            onClick={() => setIsPlaying((p) => !p)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 px-5 py-2 text-xs font-medium hover:opacity-90 transition-all active:scale-95"
          >
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Play
              </>
            )}
          </button>

          <button
            type="button"
            data-testid="video-rewind-10s-btn"
            onClick={() => handleScrubOrRewind(currentTimeSeconds - 10)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-zinc-200/60 dark:border-zinc-800/60 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-all active:scale-95"
          >
            <RotateCcw className="h-4 w-4" />
            −10s
          </button>

          <button
            type="button"
            data-testid="video-forward-30s-btn"
            onClick={() => handleScrubOrRewind(currentTimeSeconds + 30)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-zinc-200/60 dark:border-zinc-800/60 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-all active:scale-95"
          >
            <FastForward className="h-4 w-4" />
            +30s
          </button>
        </div>

        <input
          type="range"
          min={0}
          max={durationSeconds}
          aria-label="Video Lecture Timeline Scrubber"
          value={currentTimeSeconds}
          onChange={(e) => handleScrubOrRewind(Number(e.target.value))}
          className="h-2 w-full cursor-pointer accent-zinc-950 dark:accent-white"
        />
      </div>
    </div>
  );
}
