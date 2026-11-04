import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LectureNotesCard, lectureShareText } from "../LectureNotesCard";

const VIDEO = "dQw4w9WgXcQ";

function mockFetch(responses: Array<{ status?: number; body: unknown }>) {
  const fn = vi.fn(async () => {
    const next = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("LectureNotesCard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("says what a new lecture uses, makes notes and offers to share them", async () => {
    mockFetch([
      { body: { cached: false, enabled: true, allowance: { plan: "pro", limit: 8, used: 2, left: 6 } } },
      {
        body: {
          ok: true, cached: false, title: "Optics",
          notes: [{ id: "n1", heading: "Reflection" }],
          allowance: { plan: "pro", limit: 8, used: 3, left: 5 },
        },
      },
    ]);
    const onNotes = vi.fn();
    render(<LectureNotesCard videoId={VIDEO} onNotes={onNotes} />);
    const make = await screen.findByTestId("lecture-notes-make");
    expect(make.textContent).toBe("Make notes (uses 1 of 6)");
    fireEvent.click(make);
    await waitFor(() => expect(onNotes).toHaveBeenCalledWith("Optics", [{ id: "n1", heading: "Reflection" }]));
    expect(screen.getByText(/5 new lectures left this month/)).toBeTruthy();
    expect(screen.getByTestId("lecture-notes-share")).toBeTruthy();
    expect(screen.getByTestId("lecture-share-hint").textContent).toMatch(/open free/);
  });

  it("offers shared notes free, even with no lectures left", async () => {
    mockFetch([{ body: { cached: true, enabled: true, allowance: { plan: "free", limit: 1, used: 1, left: 0 } } }]);
    render(<LectureNotesCard videoId={VIDEO} onNotes={() => undefined} />);
    const make = (await screen.findByTestId("lecture-notes-make")) as HTMLButtonElement;
    expect(make.textContent).toBe("Add the notes (free)");
    expect(make.disabled).toBe(false);
  });

  it("stays quiet when the feature is off", async () => {
    mockFetch([{ status: 503, body: { error: "Lecture notes aren't switched on yet." } }]);
    render(<LectureNotesCard videoId={VIDEO} onNotes={() => undefined} />);
    expect(await screen.findByText("Lecture notes aren't switched on yet.")).toBeTruthy();
    expect(screen.queryByTestId("lecture-notes-make")).toBeNull();
  });

  it("builds a share link that opens the same lecture", () => {
    const share = lectureShareText(VIDEO, "https://learn.example");
    expect(share.url).toBe("https://learn.example/video?v=dQw4w9WgXcQ");
    expect(share.text).toMatch(/free/);
  });
});
