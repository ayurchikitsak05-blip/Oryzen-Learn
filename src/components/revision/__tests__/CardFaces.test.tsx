import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChoiceFace, ClozeFace, MatchGame, RatingButtons } from "../CardFaces";

describe("card faces", () => {
  it("multiple choice marks the right answer and reports it", () => {
    const onAnswered = vi.fn();
    render(<ChoiceFace card={{ kind: "choice", question: "Q", options: ["A1", "B1", "C1", "D1"], correct: 2 }} onAnswered={onAnswered} />);
    fireEvent.click(screen.getByRole("button", { name: /B1/ }));
    expect(onAnswered).toHaveBeenCalledWith(false);
    expect((screen.getByRole("button", { name: /C1/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("fill-the-gap checks a typed answer", () => {
    const onRevealed = vi.fn();
    render(<ClozeFace card={{ kind: "cloze", text: "The SI unit of force is _____.", answer: "newton" }} onRevealed={onRevealed} />);
    fireEvent.change(screen.getByTestId("revision-cloze-input"), { target: { value: "Newton" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(onRevealed).toHaveBeenCalledWith(true);
    expect(screen.getByRole("status").textContent).toMatch(/Right/);
  });

  it("rating buttons show when the card comes back", () => {
    const onRate = vi.fn();
    render(<RatingButtons days={{ 1: 1, 2: 3, 3: 4, 4: 15 }} onRate={onRate} />);
    expect(screen.getByTestId("revision-rate-4").textContent).toMatch(/15 days/);
    fireEvent.click(screen.getByTestId("revision-rate-2"));
    expect(onRate).toHaveBeenCalledWith(2);
  });

  it("matching game finishes when every pair is matched", () => {
    render(
      <MatchGame
        round={{ pairs: [{ id: "a", left: "Inertia", right: "Resists change" }, { id: "b", left: "Momentum", right: "Mass × velocity" }, { id: "c", left: "Impulse", right: "Change in momentum" }], order: [2, 0, 1] }}
        onClose={() => undefined}
      />
    );
    for (const [left, right] of [["Inertia", "Resists change"], ["Momentum", "Mass × velocity"], ["Impulse", "Change in momentum"]]) {
      fireEvent.click(screen.getByRole("button", { name: left }));
      fireEvent.click(screen.getByRole("button", { name: right }));
    }
    expect(screen.getByTestId("revision-match-done").textContent).toMatch(/no mistakes/);
  });
});
