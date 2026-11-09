import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notes/photo-resize", () => ({
  shrinkPhoto: vi.fn(async () => ({ data: "AAAA", mimeType: "image/jpeg", previewUrl: "data:image/jpeg;base64,AAAA" })),
}));
const save = vi.fn(async () => ({ ok: true as const }));
vi.mock("@/lib/notes/save-to-notebook", () => ({
  saveToNotebook: (...args: unknown[]) => save(...(args as [])),
  notebookSaveMessage: () => "Saved to My Notes.",
}));

import { PhotoToNotes } from "../PhotoToNotes";

describe("Photo to notes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads a photo, lets the student edit, and saves to My Notes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ photo: { readable: true, title: "Ohm's law", subject: "Physics", body: "V = IR" } }), {
          status: 200,
        })
      )
    );
    render(<PhotoToNotes />);
    fireEvent.change(screen.getByTestId("photo-input"), { target: { files: [new File(["x"], "page.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(await screen.findByTestId("photo-read"));
    const body = (await screen.findByTestId("photo-body")) as HTMLTextAreaElement;
    expect(body.value).toBe("V = IR");
    fireEvent.change(body, { target: { value: "V = I × R" } });
    fireEvent.click(screen.getByTestId("photo-save"));
    await screen.findByTestId("photo-saved");
    expect(save).toHaveBeenCalledWith({ subjectTitle: "Physics", title: "Ohm's law", noteBody: "V = I × R" });
  });

  it("shows the limit message and keeps the photo to try again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "You've used today's 5 free AI helps." }), { status: 429 }))
    );
    render(<PhotoToNotes />);
    fireEvent.change(screen.getByTestId("photo-input"), { target: { files: [new File(["x"], "page.jpg", { type: "image/jpeg" })] } });
    fireEvent.click(await screen.findByTestId("photo-read"));
    await waitFor(() => expect(screen.getByTestId("photo-message").textContent).toMatch(/5 free AI helps/));
    expect(screen.getByTestId("photo-read")).toBeTruthy();
  });
});

describe("subject names", () => {
  it("files the same subject under one name", async () => {
    const { subjectName } = await import("../PhotoToNotes");
    expect(subjectName(" physics ")).toBe("Physics");
    expect(subjectName("PHYSICS")).toBe("Physics");
    expect(subjectName("EVS")).toBe("EVS");
    expect(subjectName("")).toBe("Photo notes");
  });
});
