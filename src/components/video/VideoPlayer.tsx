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
  onLocalFileSelected?: (fileName: string) => void;
  theme: PrakritiThemePalette;
}

export default function VideoPlayer({
  youtubeUrlOrId,
  currentTimeSeconds,
  durationSeconds,
  onTimeUpdate,
  onRewindFriction,
  onChangeYouTubeUrl,
  onLocalFileSelected,
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
  const youtubeFrameRef = useRef<HTMLIFrameElement | null>(null);
  const lastTrackedTimeRef = useRef<number>(currentTimeSeconds);
  const reportedTimeRef = useRef<number>(currentTimeSeconds);
  const applyingPlayerTimeRef = useRef(false);
  const preferredVideoIdRef = useRef<string | null>(null);

  const commandYouTube = (func: string, args: unknown[] = []) => {
    youtubeFrameRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "https://www.youtube.com"
    );
  };

  useEffect(() => {
    const nextId = extractYouTubeVideoId(youtubeUrlOrId ?? "");
    if (!nextId) return;
    if (preferredVideoIdRef.current && preferredVideoIdRef.current !== nextId) return;
    preferredVideoIdRef.current = null;
    if (nextId === activeYouTubeId) return;
    setActiveYouTubeId(nextId);
    setUrlInput(youtubeUrlOrId ?? nextId);
    setIsPlaying(false);
  }, [activeYouTubeId, youtubeUrlOrId]);

  useEffect(() => {
    if (sourceMode !== "youtube") return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== "https://www.youtube.com") return;
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload) as unknown;
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== "object") return;
      const data = payload as {
        event?: string;
        info?: { currentTime?: number } | number;
      };
      if (data.event === "onStateChange" && typeof data.info === "number") {
        if (data.info === 1) setIsPlaying(true);
        if (data.info === 0 || data.info === 2) setIsPlaying(false);
        return;
      }
      if (data.event !== "infoDelivery" || !data.info || typeof data.info === "number") return;
      if (typeof data.info.currentTime !== "number") return;
      const next = Math.min(durationSeconds, Math.max(0, Math.floor(data.info.currentTime)));
      if (Math.abs(next - reportedTimeRef.current) < 1) return;
      reportedTimeRef.current = next;
      lastTrackedTimeRef.current = next;
      applyingPlayerTimeRef.current = true;
      onTimeUpdate(next);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [durationSeconds, onTimeUpdate, sourceMode]);

  useEffect(() => {
    if (sourceMode !== "youtube") return;
    if (applyingPlayerTimeRef.current) {
      applyingPlayerTimeRef.current = false;
      lastTrackedTimeRef.current = currentTimeSeconds;
      return;
    }
    if (Math.abs(currentTimeSeconds - reportedTimeRef.current) < 1.5) {
      lastTrackedTimeRef.current = currentTimeSeconds;
      return;
    }
    reportedTimeRef.current = currentTimeSeconds;
    lastTrackedTimeRef.current = currentTimeSeconds;
    commandYouTube("seekTo", [currentTimeSeconds, true]);
  }, [currentTimeSeconds, sourceMode]);

  useEffect(() => {
    if (
      sourceMode === "local_mp4" &&
      htmlVideoRef.current &&
      Math.abs(htmlVideoRef.current.currentTime - currentTimeSeconds) > 1.5
    ) {
      htmlVideoRef.current.currentTime = currentTimeSeconds;
    }
    if (sourceMode === "local_mp4") lastTrackedTimeRef.current = currentTimeSeconds;
  }, [currentTimeSeconds, sourceMode]);

  useEffect(() => {
    if (!isPlaying || sourceMode !== "local_mp4") return;
    const interval = window.setInterval(() => {
      const next = Math.min(durationSeconds, lastTrackedTimeRef.current + 1);
      lastTrackedTimeRef.current = next;
      onTimeUpdate(next);
      if (next >= durationSeconds) {
        setIsPlaying(false);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isPlaying, durationSeconds, onTimeUpdate, sourceMode]);

  useEffect(() => {
    return () => {
      if (localVideoObjectUrl) {
        URL.revokeObjectURL(localVideoObjectUrl);
      }
    };
  }, [localVideoObjectUrl]);

  const handleLoadYouTubeUrl = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const field = e.currentTarget.querySelector("input");
    const raw = field instanceof HTMLInputElement ? field.value : urlInput;
    const id = extractYouTubeVideoId(raw);
    if (id) {
      preferredVideoIdRef.current = id;
      setSourceMode("youtube");
      setActiveYouTubeId(id);
      setUrlInput(raw.trim());
      reportedTimeRef.current = 0;
      lastTrackedTimeRef.current = 0;
      onChangeYouTubeUrl?.(raw.trim(), id);
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
    onLocalFileSelected?.(file.name);
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
    reportedTimeRef.current = clamped;
    if (sourceMode === "youtube") commandYouTube("seekTo", [clamped, true]);
    onTimeUpdate(clamped);
  };

  return (
    <div className="surface-card space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSourceMode("youtube")}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-all active:scale-95 ${
              sourceMode === "youtube"
                ? "bg-selected text-heading"
                : "border border-line text-muted"
            }`}
          >
            <Video className="h-4 w-4" />
            YouTube
          </button>

          <label
            className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-all active:scale-95 ${
              sourceMode === "local_mp4"
                ? "bg-selected text-heading"
                : "border border-line text-muted"
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

        <span className="text-xs text-muted">
          {formatTimestampBadge(currentTimeSeconds)} /{" "}
          {formatTimestampBadge(durationSeconds)}
        </span>
      </div>

      {sourceMode === "youtube" && (
        <form onSubmit={handleLoadYouTubeUrl} className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute top-3.5 left-3 h-4 w-4 text-muted" />
            <input
              type="text"
              aria-label="Lecture link"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste a lecture link"
              className="field-input pr-4 pl-9 text-sm"
            />
          </div>
          <button
            type="submit"
            className="btn-primary text-xs"
          >
            Load
          </button>
        </form>
      )}

      <div className="relative aspect-video overflow-hidden rounded-2xl bg-heading">
        {sourceMode === "youtube" ? (
          <iframe
            key={activeYouTubeId}
            ref={youtubeFrameRef}
            data-testid="youtube-iframe-player"
            title="Lecture player"
            src={`https://www.youtube.com/embed/${activeYouTubeId}?enablejsapi=1`}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onLoad={() => {
              youtubeFrameRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: "listening", id: "oryzen-lecture", channel: "widget" }),
                "https://www.youtube.com"
              );
              if (reportedTimeRef.current > 0) {
                commandYouTube("seekTo", [reportedTimeRef.current, true]);
              }
            }}
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
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-sm text-beige-2">
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
            onClick={() => {
              const next = !isPlaying;
              setIsPlaying(next);
              if (sourceMode === "youtube") commandYouTube(next ? "playVideo" : "pauseVideo");
            }}
            className="btn-primary text-xs"
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
            className="btn-secondary text-xs"
          >
            <RotateCcw className="h-4 w-4" />
            −10s
          </button>

          <button
            type="button"
            data-testid="video-forward-30s-btn"
            onClick={() => handleScrubOrRewind(currentTimeSeconds + 30)}
            className="btn-secondary text-xs"
          >
            <FastForward className="h-4 w-4" />
            +30s
          </button>
        </div>

        <input
          type="range"
          min={0}
          max={durationSeconds}
          aria-label="Lecture timeline"
          value={currentTimeSeconds}
          onChange={(e) => handleScrubOrRewind(Number(e.target.value))}
          className="h-2 w-full cursor-pointer accent-accent"
        />
      </div>
    </div>
  );
}
