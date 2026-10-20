/**
 * Layer 4: Parallel Video Lecture Studio Sync Engine
 * Manages YouTube URL parsing, `[mm:ss]` timestamp formatting, real-time note reveal
 * synchronization with `currentTime`, 10-second rewind friction detection, and
 * pre-loaded + custom video lecture transcripts stored locally (0 MB cloud storage cost).
 */

export interface TimestampedLectureNote {
  id: string;
  lectureId: string;
  startSeconds: number;
  endSeconds: number;
  timestampBadge: string; // e.g. "[04:18]"
  heading: string;
  speakerTranscript: string;
  studyNoteMarkdown: string;
  highYieldKeyPoint: string;
  modificationHistory: string[];
}

export interface VideoLectureRecord {
  id: string;
  title: string;
  facultyName: string;
  sourceType: "youtube" | "local_mp4";
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  localFileName: string | null;
  durationSeconds: number;
  notes: TimestampedLectureNote[];
}

/**
 * Formats seconds into a canonical `[MM:SS]` or `[HH:MM:SS]` timestamp badge (e.g., `258 -> "[04:18]"`).
 */
export function formatTimestampBadge(seconds: number): string {
  const safeSec = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safeSec / 3600);
  const mins = Math.floor((safeSec % 3600) / 60);
  const secs = safeSec % 60;

  if (hrs > 0) {
    return `[${String(hrs).padStart(2, "0")}:${String(mins).padStart(
      2,
      "0"
    )}:${String(secs).padStart(2, "0")}]`;
  }
  return `[${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}]`;
}

/**
 * Parses a `[MM:SS]` or `[HH:MM:SS]` timestamp badge back into total seconds.
 */
export function parseTimestampBadgeToSeconds(badge: string): number {
  const cleaned = badge.replace(/[\[\]\s]/g, "");
  const parts = cleaned.split(":").map((n) => Number(n));
  if (parts.some((n) => Number.isNaN(n) || n < 0)) {
    return 0;
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] ?? 0;
}

/**
 * Extracts the 11-character YouTube video ID from public or unlisted YouTube URLs
 * (`youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/embed/...`, `youtube.com/live/...`).
 */
export function extractYouTubeVideoId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const vParam = parsed.searchParams.get("v");
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }
      const pathSegments = parsed.pathname.split("/").filter(Boolean);
      const embedIdx = pathSegments.findIndex((seg) =>
        ["embed", "live", "shorts", "v"].includes(seg)
      );
      if (embedIdx >= 0 && pathSegments[embedIdx + 1]) {
        const candidate = pathSegments[embedIdx + 1];
        return /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : null;
      }
    }
  } catch {
    // Not a full URL
  }

  return null;
}

/**
 * Computes which timestamp-synced notes have been revealed at `currentTimeSeconds`
 * and identifies the currently active note block being spoken by the teacher.
 */
export function getSyncedNotesStateAtTime(
  notes: readonly TimestampedLectureNote[],
  currentTimeSeconds: number,
  showAllFutureNotes: boolean = false
): {
  revealedNotes: TimestampedLectureNote[];
  activeNote: TimestampedLectureNote | null;
  upcomingCount: number;
} {
  const sorted = [...notes].sort((a, b) => a.startSeconds - b.startSeconds);

  const activeNote =
    sorted.find(
      (n) =>
        currentTimeSeconds >= n.startSeconds &&
        currentTimeSeconds < n.endSeconds
    ) ??
    [...sorted]
      .reverse()
      .find((n) => currentTimeSeconds >= n.startSeconds) ??
    sorted[0] ??
    null;

  if (showAllFutureNotes) {
    return {
      revealedNotes: sorted,
      activeNote,
      upcomingCount: 0,
    };
  }

  // Reveal all notes whose startSeconds <= currentTimeSeconds (always showing at least the first note at t=0)
  const revealedNotes = sorted.filter(
    (n, idx) => n.startSeconds <= currentTimeSeconds || idx === 0
  );

  return {
    revealedNotes,
    activeNote,
    upcomingCount: Math.max(0, sorted.length - revealedNotes.length),
  };
}

/**
 * Detects whether a student scrubbed/rewound backward by between 3 and 90 seconds,
 * signaling comprehension friction on the current timestamp segment.
 */
export function detectVideoRewindFriction(
  previousSeconds: number,
  newSeconds: number
): { isRewindFriction: boolean; deltaSeconds: number } {
  const delta = previousSeconds - newSeconds;
  const isRewindFriction = delta >= 3 && delta <= 90;
  return {
    isRewindFriction,
    deltaSeconds: Number(delta.toFixed(1)),
  };
}

export const DEFAULT_VIDEO_LECTURES: VideoLectureRecord[] = [
  {
    id: "lec-physics-newton-01",
    title: "Mechanics Lec 1: Newton's Laws and Free-Body Diagrams",
    facultyName: "Prof. A. Mehta (Department of Physics)",
    sourceType: "youtube",
    youtubeVideoId: "M7lc1UVf-VE",
    youtubeUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
    localFileName: null,
    durationSeconds: 360,
    notes: [
      {
        id: "note-newton-1",
        lectureId: "lec-physics-newton-01",
        startSeconds: 0,
        endSeconds: 90,
        timestampBadge: "[00:00]",
        heading: "1. Inertia and the First Law",
        speakerTranscript:
          "Welcome. An object keeps a constant velocity unless a net force acts on it. That is Newton's first law, and it is the reason a free-body diagram starts by asking what is actually pushing or pulling.",
        studyNoteMarkdown:
          "**First law:** Velocity stays constant when the net force is zero. Draw every contact and field force before you decide whether the object accelerates.",
        highYieldKeyPoint:
          "Zero net force means constant velocity, including the special case of rest.",
        modificationHistory: [],
      },
      {
        id: "note-newton-2",
        lectureId: "lec-physics-newton-01",
        startSeconds: 90,
        endSeconds: 180,
        timestampBadge: "[01:30]",
        heading: "2. Force, Mass, and Acceleration",
        speakerTranscript:
          "At 1 minute 30 seconds, write F = ma only after you confirm the mass is constant. The general statement is that net force equals the rate of change of momentum.",
        studyNoteMarkdown:
          "**Second law:** Net force equals the rate of change of momentum. When mass is constant, that reduces to *F = ma*, with acceleration in the direction of the net force.",
        highYieldKeyPoint:
          "F = ma applies when mass is constant; otherwise use the change in momentum.",
        modificationHistory: [],
      },
      {
        id: "note-newton-3",
        lectureId: "lec-physics-newton-01",
        startSeconds: 180,
        endSeconds: 258,
        timestampBadge: "[03:00]",
        heading: "3. Action-Reaction Pairs",
        speakerTranscript:
          "Newton's third law pairs are equal in magnitude, opposite in direction, and they act on two different objects. They never cancel on a single free-body diagram.",
        studyNoteMarkdown:
          "**Third law:** The force of A on B and the force of B on A are equal and opposite, and they appear on two separate diagrams.",
        highYieldKeyPoint:
          "Action-reaction pairs never cancel because they act on different objects.",
        modificationHistory: [],
      },
      {
        id: "note-newton-4",
        lectureId: "lec-physics-newton-01",
        startSeconds: 258,
        endSeconds: 360,
        timestampBadge: "[04:18]",
        heading: "4. Choosing Axes on an Incline",
        speakerTranscript:
          "At 04:18, tilt the axes for an incline: one axis along the surface, one perpendicular to it. Then the normal force has only one component, and gravity splits into mg sin theta and mg cos theta.",
        studyNoteMarkdown:
          "**Incline setup (`[04:18]`):** Align axes with the surface. The normal force is *mg cos θ* on a frictionless incline, and the acceleration down the slope is *g sin θ*.",
        highYieldKeyPoint:
          "On a frictionless incline, acceleration down the slope is g sin θ.",
        modificationHistory: [],
      },
    ],
  },
  {
    id: "lec-economics-elasticity-02",
    title: "Economics Lec 2: Elasticity, Revenue, and Substitutes",
    facultyName: "Prof. L. Iyer (Department of Economics)",
    sourceType: "youtube",
    youtubeVideoId: "dQw4w9WgXcQ",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    localFileName: null,
    durationSeconds: 300,
    notes: [
      {
        id: "note-econ-1",
        lectureId: "lec-economics-elasticity-02",
        startSeconds: 0,
        endSeconds: 120,
        timestampBadge: "[00:00]",
        heading: "1. Price Elasticity of Demand",
        speakerTranscript:
          "Price elasticity of demand is the percentage change in quantity demanded divided by the percentage change in price. Elastic demand is greater than one in absolute value; inelastic demand is less than one.",
        studyNoteMarkdown:
          "**Elasticity:** Compare the percentage change in quantity with the percentage change in price. Use absolute value when you only need to say elastic or inelastic.",
        highYieldKeyPoint:
          "Elastic demand means quantity responds more than proportionally to a price change.",
        modificationHistory: [],
      },
      {
        id: "note-econ-2",
        lectureId: "lec-economics-elasticity-02",
        startSeconds: 120,
        endSeconds: 300,
        timestampBadge: "[02:00]",
        heading: "2. Elasticity and Total Revenue",
        speakerTranscript:
          "When demand is elastic, a price increase lowers total revenue. When demand is inelastic, the same price increase raises total revenue. At unit elasticity, revenue stays flat.",
        studyNoteMarkdown:
          "**Revenue rule:** Price and total revenue move in opposite directions when demand is elastic, and in the same direction when demand is inelastic.",
        highYieldKeyPoint:
          "A price rise lowers total revenue only when demand is elastic.",
        modificationHistory: [],
      },
    ],
  },
];
