import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormatPicker, FormattedNoteEditor, FormattedNoteView } from "../NoteFormats";
import { blankNote, serializeNote, type FormattedNote, type NoteFormat } from "@/lib/notes/formats";

function Harness({ onSave }: { onSave: (text: string) => void }) {
  const [format, setFormat] = useState<NoteFormat>("plain");
  const [note, setNote] = useState<FormattedNote>(blankNote("plain"));
  return (
    <div>
      <FormatPicker
        value={format}
        onChange={(next) => {
          setFormat(next);
          setNote(blankNote(next));
        }}
      />
      <FormattedNoteEditor note={note} onChange={setNote} />
      <button type="button" onClick={() => onSave(serializeNote(note))}>
        save
      </button>
    </div>
  );
}

describe("note format editors and views", () => {
  it("writes a Cornell note", () => {
    let saved = "";
    render(<Harness onSave={(text) => (saved = text)} />);
    fireEvent.click(screen.getByTestId("format-cornell"));
    fireEvent.change(screen.getByLabelText("Question 1"), { target: { value: "Causes?" } });
    fireEvent.change(screen.getByLabelText("Answer 1"), { target: { value: "Blood loss" } });
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Iron is low." } });
    fireEvent.click(screen.getByText("save"));
    expect(saved).toBe("Format: Cornell\n\nQ: Causes?\nA: Blood loss\n\nSummary: Iron is low.");
  });

  it("draws a Cornell note and covers the answers", () => {
    render(<FormattedNoteView title="Iron" body={"Format: Cornell\n\nQ: Causes?\nA: Blood loss"} />);
    expect(screen.getByTestId("note-view-cornell").textContent).toContain("Blood loss");
    fireEvent.click(screen.getByTestId("cornell-cover"));
    expect(screen.getByTestId("note-view-cornell").textContent).not.toContain("Blood loss");
  });

  it("draws tables, flowcharts and mind maps", () => {
    const { rerender } = render(<FormattedNoteView title="Doshas" body={"Format: Table\nProperty | Vata\nGuna | Ruksha"} />);
    expect(screen.getByRole("columnheader", { name: "Vata" })).toBeTruthy();
    rerender(<FormattedNoteView title="Flow" body={"Format: Flowchart\n1. Heat\n2. Melt"} />);
    expect(screen.getByTestId("note-view-flowchart").querySelectorAll("li")).toHaveLength(2);
    rerender(<FormattedNoteView title="Prameha" body={"Format: Mind map\n- Nidana\n  - Ahara"} />);
    expect(screen.getByTestId("note-view-mindmap").textContent).toContain("Prameha");
    expect(screen.getByTestId("note-view-mindmap").textContent).toContain("Ahara");
  });
});
