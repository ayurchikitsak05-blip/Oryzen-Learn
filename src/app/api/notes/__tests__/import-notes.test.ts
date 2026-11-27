import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: unknown[] = [];
let existing: Array<{ id: string; title: string }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "student-a" } } }) },
    from: () => ({
      select: () => ({ eq: async () => ({ data: existing, error: null }) }),
      insert: (row: unknown) => {
        inserted.push(row);
        return Object.assign(Promise.resolve({ error: null }), {
          select: () => ({ single: async () => ({ data: { id: "deck-new" }, error: null }) }),
        });
      },
    }),
  }),
}));

import { POST } from "../route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/notes", { method: "POST", body: JSON.stringify(body) }) as never);

describe("importing an Anki deck", () => {
  beforeEach(() => {
    inserted.length = 0;
    existing = [];
  });

  it("saves every card into the deck's subject, reusing one with the same name", async () => {
    existing = [{ id: "physics-1", title: "Physics" }];
    const response = await post({
      action: "import_notes",
      subjectTitle: "physics",
      notes: [{ title: "Inertia", body: "Resists change" }, { title: "  ", body: "skipped" }, { title: "Force", body: 5 }],
    });
    expect(await response.json()).toEqual({ subjectId: "physics-1", imported: 2 });
    expect(inserted).toEqual([
      [
        { subject_id: "physics-1", user_id: "student-a", title: "Inertia", body: "Resists change" },
        { subject_id: "physics-1", user_id: "student-a", title: "Force", body: "" },
      ],
    ]);
  });

  it("creates the subject when it is new and refuses oversized batches", async () => {
    const response = await post({ action: "import_notes", subjectTitle: "Biology", notes: [{ title: "Cell", body: "Unit of life" }] });
    expect(await response.json()).toMatchObject({ subjectId: "deck-new", imported: 1 });
    const big = await post({ action: "import_notes", notes: Array.from({ length: 501 }, () => ({ title: "x" })) });
    expect(big.status).toBe(400);
  });
});
