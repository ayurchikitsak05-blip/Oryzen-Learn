import { describe, expect, it } from "vitest";
import { synthesizeMasterStudyBook, type SynthesisSource } from "../master-book";
import { createStudentLecture } from "@/lib/video/sync-engine";
import { topicsFromChapters } from "@/lib/video/lecture-topics";

const source = (id: string, excerpt: string): SynthesisSource => ({
  id,
  title: `Source ${id}`,
  documentId: `doc-${id}`,
  pageNumber: 1,
  sectionHeading: "Laws of motion",
  excerpt,
  notesMarkdown: excerpt,
});

function studentLecture(videoId: string, topics: string[]) {
  const lecture = createStudentLecture({ sourceType: "youtube", youtubeVideoId: videoId, title: `Lecture ${videoId}` });
  return {
    ...lecture,
    notes: topicsFromChapters(
      lecture.id,
      topics.map((title, index) => ({ startSeconds: index * 300, title }))
    ),
  };
}

describe("study book with the student's own YouTube lectures", () => {
  it("uses their topic headings and timestamps (no AI notes needed)", () => {
    const book = synthesizeMasterStudyBook({
      sources: [source("a", "Force changes momentum."), source("b", "Inertia resists change.")],
      videoLectures: [studentLecture("abcdefghijk", ["Newton's 2nd law", "Free body diagrams"]), studentLecture("bcdefghijkl", ["Friction"])],
      prakritiDosha: "Pitta",
    });
    const text = book.sections.map((section) => section.prakritiFormattedBody).join("\n");
    expect(text).toContain("Lecture topic: Newton's 2nd law.");
    expect(book.allCitations.some((citation) => citation.sourceType === "video" && citation.timestampSeconds === 300)).toBe(true);
  });
});
