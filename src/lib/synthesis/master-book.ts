/**
 * Layer 4: Multi-Source Synthesis Studio Engine (`master-book.ts`)
 *
 * Merges 2+ personal study compendiums and 2+ video lecture transcripts into a single,
 * unified, Prakriti-formatted Master Study Book with strict inline citations
 * (`[Doc: <Title>, p. <N>]` and `[Video: <Title>, <MM:SS>]`).
 */

import type { Dosha } from "@/lib/prakriti/config";
import type { SavedPassageEntry } from "@/lib/ai/passage-store";
import type { VideoLectureRecord } from "@/lib/video/sync-engine";
import { DEFAULT_VIDEO_LECTURES } from "@/lib/video/sync-engine";

export const MIN_REQUIRED_SOURCES = 2;
export const MIN_REQUIRED_VIDEO_TRANSCRIPTS = 2;

export interface SynthesisSource {
  id: string;
  title: string;
  documentId: string;
  pageNumber: number;
  sectionHeading: string;
  excerpt: string;
  notesMarkdown: string;
}

export interface MasterStudyBookCitation {
  id: string;
  sourceType: "document" | "video";
  badge: string; // e.g. "[Doc: University Physics Ch. 4, p. 1]" or "[Video: Mechanics Lec 1, 04:18]"
  sourceId: string;
  title: string;
  pageNumber?: number;
  timestampSeconds?: number;
}

export interface MasterStudyBookSection {
  sectionNumber: number;
  heading: string;
  prakritiFormattedBody: string;
  inlineCitations: MasterStudyBookCitation[];
}

export interface SynthesizedMasterStudyBook {
  id: string;
  title: string;
  prakritiDosha: Dosha;
  cognitiveDnaDirectiveUsed: string;
  selectedSourceCount: number;
  selectedVideoTranscriptCount: number;
  executiveSummary: string;
  sections: MasterStudyBookSection[];
  allCitations: MasterStudyBookCitation[];
  createdAt: string;
}

export const DEFAULT_SYNTHESIS_SOURCES: SynthesisSource[] = [
  {
    id: "nb-physics-newton-4",
    title: "University Physics • Ch. 4 (Newton's Laws of Motion)",
    documentId: "doc-physics-newton",
    pageNumber: 86,
    sectionHeading: "CHAPTER 4: FORCES AND NEWTON'S LAWS",
    excerpt:
      "A net force changes momentum. Newton's second law states that force equals the rate of change of momentum, written F = ma when mass is constant.",
    notesMarkdown:
      "Free-body diagrams isolate the object, then sum horizontal and vertical forces before applying *F = ma*.",
  },
  {
    id: "nb-economics-elasticity-5",
    title: "Principles of Economics • Ch. 5 (Elasticity of Demand)",
    documentId: "doc-economics-elasticity",
    pageNumber: 112,
    sectionHeading: "CHAPTER 5: ELASTICITY AND ITS APPLICATION",
    excerpt:
      "Price elasticity of demand measures how quantity demanded responds to a price change. Elastic demand falls sharply when price rises; inelastic demand barely moves.",
    notesMarkdown:
      "Compare percentage change in quantity with percentage change in price, then relate the result to total revenue.",
  },
  {
    id: "nb-constitution-primer-1",
    title: "Energy & Constitution Primer • Study Rhythms (Dhee, Dhriti, Smriti)",
    documentId: "doc-constitution-primer",
    pageNumber: 4,
    sectionHeading: "CHAPTER 1: ENERGY AND CONSTITUTION",
    excerpt:
      "Vata, Pitta, and Kapha describe study energy. Quick grasping (Dhee), steady focus (Dhriti), and lasting recall (Smriti) apply in every faculty, from proofs to essays to lab work.",
    notesMarkdown:
      "Match explanation density to the student's constitution: analogies for Vata, comparison tables for Pitta, worked examples for Kapha.",
  },
];

/**
 * Converts user-saved `SavedPassageEntry` records + default saved passages
 * into selectable `SynthesisSource` items.
 */
export function buildAvailableSources(
  userEntries: readonly SavedPassageEntry[]
): SynthesisSource[] {
  const mappedUser: SynthesisSource[] = userEntries.map((entry) => ({
    id: entry.id,
    title: `${entry.documentTitle} (p. ${entry.pageNumber})`,
    documentId: entry.documentId,
    pageNumber: entry.pageNumber,
    sectionHeading: entry.sectionHeading,
    excerpt: entry.highlightedText,
    notesMarkdown: entry.aiSynthesisMarkdown,
  }));

  const combined = [...mappedUser];
  for (const preset of DEFAULT_SYNTHESIS_SOURCES) {
    if (!combined.some((c) => c.id === preset.id)) {
      combined.push(preset);
    }
  }
  return combined;
}

/**
 * Merges 2+ selected saved passages and 2+ selected video lecture transcripts
 * into 1 unified, Prakriti-formatted Master Study Book with strict inline citations.
 */
export function synthesizeMasterStudyBook(params: {
  sources: readonly SynthesisSource[];
  videoLectures: readonly VideoLectureRecord[];
  prakritiDosha: Dosha;
  cognitiveDnaSummary?: string;
  customTitle?: string;
}): SynthesizedMasterStudyBook {
  const {
    sources,
    videoLectures,
    prakritiDosha,
    cognitiveDnaSummary = "Standard Oryzen Learn cognitive energy directive",
    customTitle,
  } = params;

  if (sources.length < MIN_REQUIRED_SOURCES) {
    throw new Error(
      `Multi-Source Synthesis requires at least ${MIN_REQUIRED_SOURCES} saved passages (received ${sources.length}).`
    );
  }

  if (videoLectures.length < MIN_REQUIRED_VIDEO_TRANSCRIPTS) {
    throw new Error(
      `Multi-Source Synthesis requires at least ${MIN_REQUIRED_VIDEO_TRANSCRIPTS} video lecture transcripts (received ${videoLectures.length}).`
    );
  }

  const docCitations: MasterStudyBookCitation[] = sources.map((nb) => ({
    id: `cite-doc-${nb.id}`,
    sourceType: "document",
    badge: `[Doc: ${nb.title.split("•")[0].trim()}, p. ${nb.pageNumber}]`,
    sourceId: nb.documentId,
    title: nb.title,
    pageNumber: nb.pageNumber,
  }));

  const videoCitations: MasterStudyBookCitation[] = videoLectures.flatMap(
    (lec) =>
      lec.notes.slice(0, 2).map((note) => ({
        id: `cite-vid-${note.id}`,
        sourceType: "video" as const,
        badge: `[Video: ${lec.title.split(":")[0].trim()}, ${note.timestampBadge.replace(
          /[\[\]]/g,
          ""
        )}]`,
        sourceId: lec.id,
        title: lec.title,
        timestampSeconds: note.startSeconds,
      }))
  );

  const allCitations = [...docCitations, ...videoCitations];

  const docBadge1 = docCitations[0].badge;
  const docBadge2 = docCitations[1].badge;
  const vidBadge1 = videoCitations[0]?.badge ?? "[Video: Lecture 1, 00:00]";
  const vidBadge2 =
    videoCitations[videoCitations.length - 1]?.badge ??
    "[Video: Lecture 2, 02:00]";

  const formatStyleIntro =
    prakritiDosha === "Vata"
      ? "Formatted in Bite-Sized Focus Cards, Visual Story Analogies & 24h/72h Flashcard Anchors (*Shighra-grahi* Vata Mode)."
      : prakritiDosha === "Pitta"
        ? "Formatted in High-Precision Comparison Tables, Mechanism Hierarchies & Exact Page Citations (*Tikshna-buddhi* Pitta Mode)."
        : "Formatted in Socratic Question-First Blocks, Worked-Example Challenges & Active Checkpoints (*Dridha-smriti* Kapha Mode).";

  const lectureAnchor =
    videoLectures[0]?.notes[0]?.highYieldKeyPoint ??
    "Restate the lecture's opening claim in your own words.";

  const sections: MasterStudyBookSection[] = [
    {
      sectionNumber: 1,
      heading: "1. Cross-Source Synthesis (Compendiums + Lectures)",
      prakritiFormattedBody: [
        `${formatStyleIntro}`,
        ``,
        `- **Foundational idea:** ${sources[0].excerpt} ${docBadge1}.`,
        `- **Parallel source:** ${sources[1].excerpt} ${docBadge2}, reinforced by the lecture thread ${vidBadge1}.`,
        `- **Integrative note:** Hold the core claim, the mechanism, and one worked example together so *Dhee*, *Dhriti*, and *Smriti* stay aligned ${docBadge1} ${vidBadge1}.`,
      ].join("\n"),
      inlineCitations: [
        docCitations[0],
        docCitations[1],
        ...(videoCitations[0] ? [videoCitations[0]] : []),
      ],
    },
    {
      sectionNumber: 2,
      heading: "2. Comparison Matrix Across Your Sources",
      prakritiFormattedBody: [
        `| Source | Textbook Compendium Anchor | Parallel Lecture Insight |`,
        `| :--- | :--- | :--- |`,
        `| First compendium | ${sources[0].excerpt.slice(0, 90)} ${docBadge1} | ${lectureAnchor} ${vidBadge1} |`,
        `| Second compendium | ${sources[1].excerpt.slice(0, 90)} ${docBadge2} | Cross-check the claim against ${vidBadge2} |`,
        ``,
        `- **High-Yield Exam Synthesis:** Restate each claim in your own words, then verify it against both the page citation and the lecture timestamp ${docBadge2} ${vidBadge2}.`,
      ].join("\n"),
      inlineCitations: [
        docCitations[0],
        docCitations[1],
        ...(videoCitations[videoCitations.length - 1]
          ? [videoCitations[videoCitations.length - 1]]
          : []),
      ],
    },
    {
      sectionNumber: 3,
      heading: `3. ${prakritiDosha}-Adaptive Active Recall & 72-Hour Retention Blueprint`,
      prakritiFormattedBody: [
        `- **Recall challenge:** In one sentence, what is the core claim in ${docBadge1}, and how does the lecture at ${vidBadge1} confirm or extend it?`,
        `- **Answer grounded in sources:** ${sources[0].excerpt} ${docBadge1}. The parallel lecture adds: ${lectureAnchor} ${vidBadge1}. A second source adds: ${sources[1].excerpt} ${docBadge2} ${vidBadge2}.`,
      ].join("\n"),
      inlineCitations: allCitations,
    },
  ];

  return {
    id: `master-book-${Date.now()}`,
    title:
      customTitle?.trim() ||
      `My Study Guide: ${sources.length} sources and ${videoLectures.length} lectures`,
    prakritiDosha,
    cognitiveDnaDirectiveUsed: cognitiveDnaSummary,
    selectedSourceCount: sources.length,
    selectedVideoTranscriptCount: videoLectures.length,
    executiveSummary: `A study guide that brings together ${sources.length} sources and ${videoLectures.length} lectures, with ${allCitations.length} citations so you can return to each idea.`,
    sections,
    allCitations,
    createdAt: new Date().toISOString(),
  };
}

export { DEFAULT_VIDEO_LECTURES };
