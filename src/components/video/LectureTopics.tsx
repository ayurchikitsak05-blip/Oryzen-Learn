"use client";

import React, { useState } from "react";
import { Clock, Flag, Trash2 } from "lucide-react";
import { formatTimestampBadge, type TimestampedLectureNote } from "@/lib/video/sync-engine";
import { currentTopicId, isMarkedTopic } from "@/lib/video/lecture-topics";

export interface LectureTopicsProps {
  lectureTitle: string;
  topics: TimestampedLectureNote[];
  currentTimeSeconds: number;
  /** Where the topics came from, shown under the title. */
  sourceText: string | null;
  onSeek: (seconds: number, badge: string) => void;
  onMark: (heading: string) => void;
  onRemove: (id: string) => void;
  onSaveOutline: () => void;
}

/**
 * "Topics in this lecture": the video's own chapter list and topics the student marks while
 * watching. Tap a topic to jump there. Free: no AI.
 */
export default function LectureTopics({
  lectureTitle,
  topics,
  currentTimeSeconds,
  sourceText,
  onSeek,
  onMark,
  onRemove,
  onSaveOutline,
}: LectureTopicsProps) {
  const [draft, setDraft] = useState("");
  const [marking, setMarking] = useState(false);
  const sorted = topics.slice().sort((a, b) => a.startSeconds - b.startSeconds);
  const playing = currentTopicId(sorted, currentTimeSeconds);
  const markAt = formatTimestampBadge(currentTimeSeconds);

  const submit = () => {
    const heading = draft.trim();
    if (!heading) return;
    onMark(heading);
    setDraft("");
    setMarking(false);
  };

  return (
    <div data-testid="lecture-topics" className="surface-card space-y-4 p-6">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted">Topics in this lecture</p>
        <h3 className="font-display text-lg text-heading">{lectureTitle}</h3>
        {sourceText ? <p className="text-xs text-muted" data-testid="lecture-topics-source">{sourceText}</p> : null}
      </div>

      {marking ? (
        <form
          className="space-y-2 rounded-2xl border border-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="block text-xs font-medium text-heading" htmlFor="mark-topic-input">
            New topic at {markAt}
          </label>
          <input
            id="mark-topic-input"
            autoFocus
            value={draft}
            maxLength={120}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="e.g. Newton's 2nd law"
            className="field-input w-full text-sm"
            data-testid="mark-topic-input"
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary min-h-11 text-sm" disabled={!draft.trim()} data-testid="mark-topic-save">
              Add topic
            </button>
            <button type="button" className="btn-secondary min-h-11 text-sm" onClick={() => setMarking(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 text-sm"
          onClick={() => setMarking(true)}
          data-testid="mark-topic"
        >
          <Flag className="h-4 w-4" aria-hidden="true" />
          Mark topic at {markAt}
        </button>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-sm leading-relaxed text-muted" data-testid="lecture-topics-empty">
          This video has no chapter list. When the teacher starts a new topic, tap <strong>Mark topic</strong> and type a
          short heading. Writing your own headings helps you remember.
        </p>
      ) : (
        <ol className="space-y-2" data-testid="lecture-topics-list">
          {sorted.map((topic) => {
            const now = topic.id === playing;
            return (
              <li
                key={topic.id}
                className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${now ? "border-beige bg-selected" : "border-line"}`}
              >
                <button
                  type="button"
                  onClick={() => onSeek(topic.startSeconds, topic.timestampBadge)}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full bg-beige-2 px-3 text-xs font-medium text-heading"
                  aria-label={`Play from ${topic.timestampBadge}: ${topic.heading}`}
                >
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {topic.timestampBadge.replace(/[[\]]/g, "")}
                </button>
                <span className="min-w-0 flex-1 text-sm text-ink">{topic.heading}</span>
                {now ? <span className="text-[11px] font-medium text-muted">Now</span> : null}
                {isMarkedTopic(topic) ? (
                  <button
                    type="button"
                    onClick={() => onRemove(topic.id)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-beige-2"
                    aria-label={`Remove topic ${topic.heading}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {sorted.length > 0 ? (
        <button type="button" className="btn-secondary min-h-11 w-full text-sm" onClick={onSaveOutline} data-testid="lecture-topics-save">
          Save topics to My Notes
        </button>
      ) : null}
    </div>
  );
}
