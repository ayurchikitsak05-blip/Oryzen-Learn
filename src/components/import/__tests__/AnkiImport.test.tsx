import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AnkiImport } from "../AnkiImport";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Anki import panel", () => {
  it("previews a plain-text deck and saves it in one request", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ imported: 2 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onImported = vi.fn();
    render(<AnkiImport onImported={onImported} />);
    const file = new File(["#deck:Physics\nInertia\tResists change\nForce\tmass × acceleration\n"], "physics.txt", { type: "text/plain" });
    fireEvent.change(screen.getByTestId("anki-import-file"), { target: { files: [file] } });
    await screen.findByTestId("anki-import-preview");
    expect((screen.getByTestId("anki-import-subject") as HTMLInputElement).value).toBe("Physics");
    fireEvent.click(screen.getByTestId("anki-import-save"));
    await screen.findByTestId("anki-import-done");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ action: "import_notes", subjectTitle: "Physics" });
    expect(body.notes).toHaveLength(2);
    expect(onImported).toHaveBeenCalled();
  });

  it("says so when the file has no cards", async () => {
    render(<AnkiImport />);
    fireEvent.change(screen.getByTestId("anki-import-file"), { target: { files: [new File(["just one column\n"], "x.txt")] } });
    await waitFor(() => expect(screen.getByTestId("anki-import-error").textContent).toMatch(/No cards/));
  });
});
