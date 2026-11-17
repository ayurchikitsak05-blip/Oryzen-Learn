import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LectureTopics from "../LectureTopics";
import { inlineMarkdown } from "../ParallelNotes";

describe("Mark topic", () => {
  it("keeps the moment Mark topic was tapped, not when Add is pressed", () => {
    const onMark = vi.fn();
    const props = {
      lectureTitle: "Lecture",
      topics: [],
      sourceText: null,
      onSeek: vi.fn(),
      onMark,
      onRemove: vi.fn(),
      onSaveOutline: vi.fn(),
    };
    const view = render(<LectureTopics {...props} currentTimeSeconds={60} />);
    fireEvent.click(view.getByTestId("mark-topic"));
    // The video keeps playing while the student types.
    view.rerender(<LectureTopics {...props} currentTimeSeconds={75} />);
    expect(view.container.textContent).toMatch(/New topic at \[01:00\]/);
    fireEvent.change(view.getByTestId("mark-topic-input"), { target: { value: "Newton's 2nd law" } });
    fireEvent.click(view.getByTestId("mark-topic-save"));
    expect(onMark).toHaveBeenCalledWith("Newton's 2nd law", 60);
  });
});

describe("lecture note formatting", () => {
  it("shows bold and italic instead of raw marks", () => {
    const view = render(<p>{inlineMarkdown("**First law:** velocity stays *constant* (`[00:00]`).")}</p>);
    expect(view.container.textContent).toBe("First law: velocity stays constant ([00:00]).");
    expect(view.container.querySelector("strong")?.textContent).toBe("First law:");
    expect(view.container.querySelector("em")?.textContent).toBe("constant");
  });
});
