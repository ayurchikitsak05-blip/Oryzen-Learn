import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AskMyBookPanel } from "../AskMyBookPanel";

describe("Ask My Book panel", () => {
  it("blocks an empty question and keeps the passage on screen", () => {
    const onAsk = vi.fn();
    const view = render(
      <AskMyBookPanel
        passageExcerpt="ax + b = 0, where a is not zero."
        draft=""
        turns={[]}
        loading={false}
        error={null}
        emptyHint="Type a question about this passage first."
        onDraftChange={() => undefined}
        onAsk={onAsk}
        onRetry={() => undefined}
      />
    );
    expect(view.getByTestId("ask-my-book-passage").textContent).toMatch(/ax \+ b = 0/);
    view.getByTestId("ask-my-book-submit").click();
    expect(view.getByTestId("ask-my-book-empty").textContent).toMatch(/Type a question/);
  });

  it("shows a grounded answer, a follow-up field, and an insufficient-evidence state", () => {
    const onAsk = vi.fn();
    const view = render(
      <AskMyBookPanel
        passageExcerpt="Solving for x gives x = -b / a."
        draft="Why?"
        turns={[
          {
            question: "What is the solution for x?",
            answer: "Solving for x gives x = -b / a.",
            sufficientSource: true,
            citations: [{ label: "[Page 2]", page_number: 2, section_heading: "Linear equations" }],
          },
          {
            question: "Who wrote the Kalinga edicts?",
            answer: "The selected lines do not give enough evidence to answer that.",
            sufficientSource: false,
            citations: [{ label: "[Page 2]", page_number: 2, section_heading: "Linear equations" }],
          },
        ]}
        loading={false}
        error={null}
        emptyHint={null}
        onDraftChange={() => undefined}
        onAsk={onAsk}
        onRetry={() => undefined}
      />
    );
    expect(view.getByTestId("ask-my-book-answer-0").textContent).toMatch(/x = -b \/ a/);
    expect(view.getByTestId("ask-my-book-citations-0").textContent).toMatch(/Page 2/);
    expect(view.getByTestId("ask-my-book-insufficient-1").textContent).toMatch(/enough evidence/);
    expect(view.getByLabelText("Ask a follow-up")).toBeTruthy();
    view.getByTestId("ask-my-book-submit").click();
    expect(onAsk).toHaveBeenCalledTimes(1);
  });

  it("renders a longer mathematical answer with preserved notation", () => {
    const view = render(
      <AskMyBookPanel
        passageExcerpt="A linear equation in one variable has the form ax + b = 0, where a is not zero."
        draft=""
        turns={[
          {
            question: "How do you solve ax + b = 0 for x?",
            answer:
              "Subtract **b** from both sides, then divide by **a**.\n\nThe result is `x = -b / a`, and a ≠ 0.",
            sufficientSource: true,
            citations: [{ label: "[Page 1]", page_number: 1, section_heading: "Linear equations" }],
          },
        ]}
        loading={false}
        error={null}
        emptyHint={null}
        onDraftChange={() => undefined}
        onAsk={() => undefined}
        onRetry={() => undefined}
      />
    );
    const answer = view.getByTestId("ask-my-book-answer-0");
    expect(answer.textContent).toMatch(/x = -b \/ a/);
    expect(answer.textContent).toMatch(/a ≠ 0|a is not zero|a cannot/i);
    expect(answer.querySelector("strong")?.textContent).toMatch(/b|a/);
    expect(answer.querySelector("code")?.textContent).toMatch(/x = -b \/ a/);

    view.rerender(
      <AskMyBookPanel
        passageExcerpt="A linear equation in one variable has the form ax + b = 0, where a is not zero."
        draft=""
        turns={[
          {
            question: "How do you solve ax + b = 0 for x?",
            answer:
              "Subtract **b** from both sides, then divide by **a**.\n\nThe result is `x = -b / a`, and a ≠ 0.",
            sufficientSource: true,
            citations: [{ label: "[Page 1]", page_number: 1, section_heading: "Linear equations" }],
          },
          {
            question: "Why can a not be zero?",
            answer: "The selected lines say a is not zero, because dividing by a is how we isolate x.",
            sufficientSource: true,
            citations: [{ label: "[Page 1]", page_number: 1, section_heading: "Linear equations" }],
          },
        ]}
        loading={false}
        error={null}
        emptyHint={null}
        onDraftChange={() => undefined}
        onAsk={() => undefined}
        onRetry={() => undefined}
      />
    );
    expect(view.getByTestId("ask-my-book-answer-0").textContent).toMatch(/x = -b \/ a/);
    expect(view.getByTestId("ask-my-book-answer-1").textContent).toMatch(/not zero/);
  });

  it("renders loading and retryable error states", () => {
    const onRetry = vi.fn();
    const view = render(
      <AskMyBookPanel
        passageExcerpt="ax + b = 0"
        draft="What is x?"
        turns={[]}
        loading
        error={null}
        emptyHint={null}
        onDraftChange={() => undefined}
        onAsk={() => undefined}
        onRetry={onRetry}
      />
    );
    expect(view.getByTestId("ask-my-book-loading")).toBeTruthy();
    view.rerender(
      <AskMyBookPanel
        passageExcerpt="ax + b = 0"
        draft="What is x?"
        turns={[]}
        loading={false}
        error="We couldn't answer from this passage. Please try again."
        emptyHint={null}
        onDraftChange={() => undefined}
        onAsk={() => undefined}
        onRetry={onRetry}
      />
    );
    view.getByText("Try again").click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
