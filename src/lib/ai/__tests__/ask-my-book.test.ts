import { describe, expect, it } from "vitest";
import {
  askMyBookCacheSeed,
  buildAskMyBookLensBody,
  isolateChunksForDocument,
  isBlankAskQuestion,
  isFollowUpAsk,
  preferAskMyBookAnswer,
  resolveAskGrounding,
  selectAskSupportingText,
} from "../ask-my-book";
import type { CitationReadyChunk } from "@/lib/reader/extractor";

const LINEAR =
  "A linear equation in one variable has the form ax + b = 0, where a is not zero. Solving for x gives x = -b / a.";

const chunk = (
  documentId: string,
  text: string,
  page = 1
): CitationReadyChunk => ({
  chunk_id: `${documentId}-${page}`,
  document_id: documentId,
  page_number: page,
  section_heading: "Page",
  text,
  bounding_box: { x: 1, y: 1, width: 10, height: 10 },
  token_estimate: 20,
});

describe("Ask My Book helpers", () => {
  it("rejects empty questions and keeps follow-ups on the same passage", () => {
    expect(isBlankAskQuestion("  ")).toBe(true);
    expect(isBlankAskQuestion("x")).toBe(true);
    expect(isBlankAskQuestion("What is x?")).toBe(false);
    expect(isFollowUpAsk("Why?", [{ question: "What is the solution for x?", answer: "x = -b / a" }])).toBe(
      true
    );
    expect(
      isFollowUpAsk("Who wrote the Kalinga edicts?", [
        { question: "What is the solution for x?", answer: "x = -b / a" },
      ])
    ).toBe(false);
  });

  it("grounds supported questions and refuses unsupported ones", () => {
    expect(
      resolveAskGrounding({ question: "What is the solution for x?", selectedText: LINEAR }).sufficient
    ).toBe(true);
    expect(
      resolveAskGrounding({ question: "Who wrote the Kalinga edicts?", selectedText: LINEAR }).sufficient
    ).toBe(false);
    expect(
      resolveAskGrounding({
        question: "Why?",
        selectedText: LINEAR,
        history: [{ question: "What is the solution for x?", answer: "x = -b / a" }],
      }).followUp
    ).toBe(true);
  });

  it("drops chunks from another document before the lens body is sent", () => {
    const body = buildAskMyBookLensBody({
      documentId: "doc-a",
      documentHash: "hash-a",
      pageNumber: 1,
      sectionHeading: "Linear",
      selectedText: LINEAR,
      studentQuestion: "What is the solution for x?",
      conversationHistory: [],
      candidateChunks: [
        chunk("doc-a", LINEAR),
        chunk("doc-b", "Ashoka's edicts describe dhamma after the Kalinga war."),
      ],
    });
    expect(body.lensType).toBe("ask_my_book");
    expect(body.candidateChunks.every((item) => item.document_id === "doc-a")).toBe(true);
    expect(isolateChunksForDocument(body.candidateChunks, "doc-b")).toEqual([]);
    expect(askMyBookCacheSeed({ selectedText: LINEAR, studentQuestion: "Why?", conversationHistory: [] })).not.toBe(
      askMyBookCacheSeed({
        selectedText: LINEAR,
        studentQuestion: "Why?",
        conversationHistory: [{ question: "What is x?", answer: "x = -b / a" }],
      })
    );
  });
});

const NEWTON =
  "Newton's first law says an object keeps a constant velocity unless a net force acts on it. A puck on ice keeps sliding until a stick or friction changes that velocity.";

describe("Ask My Book answer completeness", () => {
  it("keeps a complete Gemini math answer instead of a first-sentence excerpt", () => {
    const chosen = preferAskMyBookAnswer({
      question: "How do you solve ax + b = 0 for x?",
      sourceText: LINEAR,
      model: {
        question: "How do you solve ax + b = 0 for x?",
        answer: "A linear equation in one variable has the form ax + b = 0, where a is not zero.",
        sufficientSource: true,
      },
      fallback: {
        question: "How do you solve ax + b = 0 for x?",
        answer: "A linear equation in one variable has the form ax + b = 0, where a is not zero.",
        sufficientSource: true,
      },
      markdownBody:
        "To solve ax + b = 0, isolate x by subtracting b and dividing by a, so x = -b / a, with a not zero.",
    });
    expect(chosen.sufficientSource).toBe(true);
    expect(chosen.answer).toMatch(/x = -b \/ a/);
    expect(chosen.answer).toMatch(/subtract|divid|isolate/i);
  });

  it("answers a supported science question from the passage", () => {
    const chosen = preferAskMyBookAnswer({
      question: "What stays the same until a net force acts?",
      sourceText: NEWTON,
      model: {
        question: "What stays the same until a net force acts?",
        answer: "The object keeps a constant velocity unless a net force acts on it.",
        sufficientSource: true,
      },
      fallback: {
        question: "What stays the same until a net force acts?",
        answer: "Newton's first law says an object keeps a constant velocity unless a net force acts on it.",
        sufficientSource: true,
      },
    });
    expect(chosen.sufficientSource).toBe(true);
    expect(chosen.answer).toMatch(/velocity|net force/i);
  });

  it("joins supporting sentences for a multistep how question", () => {
    const supporting = selectAskSupportingText("How do you solve ax + b = 0 for x?", LINEAR);
    expect(supporting).toMatch(/ax \+ b = 0/);
    expect(supporting).toMatch(/x = -b \/ a/);
    expect(supporting).toMatch(/not zero/);
  });

  it("refuses a question the passage does not support", () => {
    const chosen = preferAskMyBookAnswer({
      question: "What is the quadratic formula for ax² + bx + c = 0?",
      sourceText: LINEAR,
      model: {
        question: "What is the quadratic formula for ax² + bx + c = 0?",
        answer: "x = (-b ± sqrt(b² - 4ac)) / 2a",
        sufficientSource: true,
      },
      fallback: {
        question: "What is the quadratic formula for ax² + bx + c = 0?",
        answer: "The selected lines do not give enough evidence to answer that. They discuss: linear equations.",
        sufficientSource: false,
      },
    });
    expect(chosen.sufficientSource).toBe(false);
    expect(chosen.answer).toMatch(/not give enough evidence|insufficient/i);
    expect(chosen.answer).not.toMatch(/sqrt|quadratic formula is/i);
  });

  it("uses supporting source text when the model answer is missing", () => {
    const chosen = preferAskMyBookAnswer({
      question: "How do you solve ax + b = 0 for x?",
      sourceText: LINEAR,
      model: null,
      fallback: {
        question: "How do you solve ax + b = 0 for x?",
        answer: selectAskSupportingText("How do you solve ax + b = 0 for x?", LINEAR),
        sufficientSource: true,
      },
    });
    expect(chosen.sufficientSource).toBe(true);
    expect(chosen.answer).toMatch(/x = -b \/ a/);
  });
});
